/**
 * Teste de fumaça: sobe nada, só conversa com um servidor já rodando.
 *
 *   npm run build && npm run start   (em outro terminal)
 *   npm run smoke                    (ou: node scripts/smoke.mjs http://localhost:3000)
 *
 * Confere o que os testes unitários não alcançam: rotas reais respondendo,
 * cabeçalhos de segurança, sessão de verdade por cookie, permissão por perfil e
 * a garantia de que as funções retiradas do app não voltaram por engano. Exige o
 * servidor em modo demonstração (DEMO_MODE=1), porque usa o login simulado.
 */

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");

let failures = 0;
let checks = 0;

function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
    return true;
  }
  failures += 1;
  console.log(`  FALHA ${name}${detail ? ` — ${detail}` : ""}`);
  return false;
}

function section(title) {
  console.log(`\n${title}`);
}

/** Guarda os cookies entre as requisições, como um navegador faria. */
class Session {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  store(response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  async fetch(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      redirect: "manual",
      ...options,
      headers: { ...(options.headers ?? {}), ...(this.cookies.size ? { cookie: this.header() } : {}) },
    });
    this.store(response);
    return response;
  }

  // A tela de login usa server action, que um script não chama: aqui entramos
  // pela rota de demonstração, que só existe com DEMO_MODE ligado.
  async login(persona) {
    const body = new FormData();
    body.append("persona", persona);
    return this.fetch("/api/demo/login", { method: "POST", body });
  }
}

async function main() {
  console.log(`Testando ${base}`);

  section("Disponibilidade");
  const health = await fetch(`${base}/api/saude`).catch(() => null);
  if (!health) {
    console.log(`  FALHA servidor não respondeu em ${base}. Rode "npm run start" antes.`);
    process.exit(1);
  }
  const healthBody = await health.json();
  check("/api/saude responde 200", health.status === 200, `status ${health.status}`);
  check("migrações em dia", healthBody.migracao?.aplicada === healthBody.migracao?.esperada, JSON.stringify(healthBody.migracao));
  check("modo demonstração ligado", healthBody.modoDemonstracao === true, "rode com DEMO_MODE=1");

  section("Páginas públicas");
  for (const path of [
    "/",
    "/login",
    "/onde-descartar",
    "/onde-descartar?categoria=ENTULHO",
    "/onde-descartar?atendente=1",
    "/privacidade",
    "/manifest.webmanifest",
    "/sw.js",
  ]) {
    const response = await fetch(`${base}${path}`);
    check(`${path} responde 200`, response.ok, `status ${response.status}`);
  }
  const staffedPage = await (await fetch(`${base}/onde-descartar?atendente=1`)).text();
  check("pontos com atendente têm título próprio", staffedPage.includes("Onde entregar e ganhar EcoCoins"));

  section("Cabeçalhos de segurança");
  const home = await fetch(`${base}/`);
  const expected = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  for (const [header, value] of Object.entries(expected)) {
    check(`${header}: ${value}`, home.headers.get(header) === value, home.headers.get(header) ?? "ausente");
  }
  const csp = home.headers.get("content-security-policy");
  check("política de conteúdo presente", Boolean(csp), "ausente (só é aplicada em produção)");
  check("frame-ancestors bloqueado", csp?.includes("frame-ancestors 'none'") ?? false);

  section("Acesso sem sessão");
  for (const path of ["/reportar", "/carteira", "/gestor", "/operador", "/minha-conta"]) {
    const response = await fetch(`${base}${path}`, { redirect: "manual" });
    const location = response.headers.get("location") ?? "";
    check(`${path} manda para o login`, (response.status === 307 || response.status === 302) && location.includes("login"), `status ${response.status} ${location}`);
  }
  const photo = await fetch(`${base}/api/fotos/demo-ANTES`);
  check("foto exige sessão", photo.status === 401, `status ${photo.status}`);

  section("Funções retiradas do app não voltaram");
  const removed = [
    "/gestor/triagem",
    "/gestor/ocorrencias",
    "/gestor/reciclagem",
    "/gestor/ecocoins",
    "/gestor/administracao",
    "/executor",
    "/avisos",
    "/api/integracao/ocorrencias",
    "/api/gestor/ocorrencias.csv",
  ];
  const manager = new Session();
  await manager.login("gestora");
  for (const path of removed) {
    const anonymous = await fetch(`${base}${path}`, { redirect: "manual" });
    const asManager = await manager.fetch(path);
    check(`${path} não existe`, anonymous.status === 404 && asManager.status === 404, `anônimo ${anonymous.status}, gestão ${asManager.status}`);
  }

  section("Cidadã (login simulado)");
  const citizen = new Session();
  const login = await citizen.login("cidadao-ana");
  check("login responde 200", login.status === 200, `status ${login.status}`);
  check("cookie de sessão definido", citizen.cookies.has("eco_session"));

  for (const path of ["/minhas-ocorrencias", "/carteira", "/minha-conta", "/consentimento"]) {
    const response = await citizen.fetch(path);
    check(`${path} abre para a cidadã`, response.status === 200, `status ${response.status}`);
  }
  const myRecords = await (await citizen.fetch("/minhas-ocorrencias")).text();
  check("cidadã vê as três abas", ["Registrar entulho", "Meus registros", "Reciclar"].every((t) => myRecords.includes(t)));
  check("cidadã não vê menus retirados", !/Avisos|Painel|Triagem|Administração/.test(myRecords));
  const wallet = await (await citizen.fetch("/carteira")).text();
  check("carteira mostra saldo e QR, sem resgate", wallet.includes("Seu saldo") && !/Resgatar|comprovante/i.test(wallet));

  // Sem aceitar o aviso de privacidade, registrar leva ao consentimento.
  const beforeConsent = await citizen.fetch("/reportar");
  check(
    "sem consentimento, /reportar pede o aceite",
    (beforeConsent.headers.get("location") ?? "").includes("consentimento"),
    beforeConsent.headers.get("location") ?? `status ${beforeConsent.status}`,
  );
  const blocked = await citizen.fetch("/gestor");
  check(
    "cidadã não entra na gestão de coleta",
    (blocked.headers.get("location") ?? "").includes("acesso-negado"),
    blocked.headers.get("location") ?? `status ${blocked.status}`,
  );
  const myData = await citizen.fetch("/api/minha-conta/dados");
  check("baixar meus dados funciona", myData.status === 200, `status ${myData.status}`);
  const exported = await myData.json().catch(() => null);
  check("arquivo tem as seções esperadas", Boolean(exported?.registrosDeEntulho && exported?.usuario && exported?.lancamentosEcoCoins));

  section("Gestão de coleta (login simulado)");
  for (const path of ["/gestor", "/gestor?ver=baixados"]) {
    const response = await manager.fetch(path);
    check(`${path} abre para a gestão`, response.status === 200, `status ${response.status}`);
  }
  const queue = await (await manager.fetch("/gestor")).text();
  check("resumo com os quatro números", ["Abertos agora", "Baixados", "Reciclado", "EcoCoins emitidos"].every((t) => queue.includes(t)));
  check("fila tem o botão Dar baixa", queue.includes("Dar baixa"));
  check("gestão tem uma aba só", queue.includes("Registros de entulho") && !/Triagem|Administração|Reciclagem<\/a>/.test(queue));
  const closedList = await (await manager.fetch("/gestor?ver=baixados")).text();
  check("lista de baixados mostra a situação", closedList.includes("Baixado") || closedList.includes("Nenhum registro teve baixa"));

  section("Operador (login simulado)");
  const operator = new Session();
  await operator.login("operador-cooperativa");
  const desk = await operator.fetch("/operador");
  check("/operador abre", desk.status === 200, `status ${desk.status}`);
  const deskForbidden = await operator.fetch("/gestor");
  check("operador não entra na gestão de coleta", (deskForbidden.headers.get("location") ?? "").includes("acesso-negado"));

  section("Envio de registro");
  const anonymousPost = await fetch(`${base}/api/ocorrencias`, { method: "POST", body: new FormData() });
  check("POST sem sessão é recusado", anonymousPost.status === 401, `status ${anonymousPost.status}`);
  const managerPost = await manager.fetch("/api/ocorrencias", { method: "POST", body: new FormData() });
  check("POST de quem não é cidadão é recusado", managerPost.status === 403, `status ${managerPost.status}`);
  // A cidadã do teste ainda não aceitou o aviso de privacidade: o envio tem de
  // parar aqui, antes de qualquer foto ser lida ou guardada.
  const withoutConsent = await citizen.fetch("/api/ocorrencias", { method: "POST", body: new FormData() });
  const consentBody = await withoutConsent.json().catch(() => ({}));
  check(
    "envio sem consentimento é recusado",
    withoutConsent.status === 403 && /privacidade/i.test(consentBody.error ?? ""),
    `status ${withoutConsent.status} — ${consentBody.error ?? ""}`,
  );

  console.log(`\n${checks - failures}/${checks} verificações passaram.`);
  if (failures > 0) {
    console.log(`${failures} falha(s).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Erro inesperado:", error);
  process.exit(1);
});
