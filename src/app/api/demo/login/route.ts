import { DEMO_MODE } from "@/lib/db";
import { loginAsDemoPersona } from "@/lib/demo-login";

/**
 * Login de demonstração por requisição, usado pelo teste de fumaça
 * (`npm run smoke`) para conferir as telas de cada perfil num servidor de
 * verdade — a tela de login usa uma server action, que um script não consegue
 * chamar.
 *
 * Fora do modo demonstração a rota responde 404: em produção ela não existe.
 */
export async function POST(request: Request): Promise<Response> {
  if (!DEMO_MODE) return new Response("Não encontrada", { status: 404 });

  const form = await request.formData().catch(() => null);
  const persona = String(form?.get("persona") ?? "");
  const home = await loginAsDemoPersona(persona, request.headers.get("user-agent"));
  if (!home) return Response.json({ ok: false, error: "Personagem inexistente." }, { status: 400 });

  return Response.json({ ok: true, destino: home }, { headers: { "Cache-Control": "no-store" } });
}
