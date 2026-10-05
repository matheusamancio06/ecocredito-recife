import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { HOME_BY_ROLE } from "@/lib/auth";
import { FLOW_COOKIE, FLOW_COOKIE_PATH, exchangeCode, getGovBrConfig, verifyIdToken } from "@/lib/govbr";
import { upsertUserFromIdentity } from "@/lib/repo";
import { createSession } from "@/lib/session";
import { readPayload } from "@/lib/signed";

interface Flow {
  state: string;
  nonce: string;
  verifier: string;
}

export async function GET(request: NextRequest) {
  const config = getGovBrConfig();
  if (!config) return new Response("Login gov.br não configurado neste ambiente.", { status: 503 });

  const store = await cookies();
  const flow = readPayload<Flow>(store.get(FLOW_COOKIE)?.value);
  // Apaga no MESMO caminho em que foi criado (delete() sem caminho não remove este cookie).
  store.set(FLOW_COOKIE, "", { path: FLOW_COOKIE_PATH, maxAge: 0 });

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (params.get("error") || !code || !flow || flow.state !== params.get("state")) {
    redirect("/login?erro=govbr");
  }

  let destination: string;
  try {
    const tokens = await exchangeCode(config, code, flow.verifier);
    const identity = await verifyIdToken(config, tokens.id_token, flow.nonce);
    // Todo mundo entra como cidadão; perfis de gestão e de operador são concedidos pela Prefeitura.
    const user = await upsertUserFromIdentity(identity, { role: "CIDADAO" });
    await createSession(user.id);
    destination = HOME_BY_ROLE[user.role];
  } catch (error) {
    console.error("[govbr] falha no login:", error instanceof Error ? error.message : "erro desconhecido");
    redirect("/login?erro=govbr");
  }
  redirect(destination);
}
