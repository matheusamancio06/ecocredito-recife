import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FLOW_COOKIE, FLOW_COOKIE_PATH, buildAuthorizeRequest, getGovBrConfig } from "@/lib/govbr";
import { signPayload } from "@/lib/signed";

export async function GET() {
  const config = getGovBrConfig();
  if (!config) return new Response("Login gov.br não configurado neste ambiente.", { status: 503 });

  const flow = buildAuthorizeRequest(config);
  const store = await cookies();
  // state, nonce e code_verifier ficam num cookie assinado e de vida curta,
  // lido de volta apenas no callback.
  store.set(FLOW_COOKIE, signPayload({ state: flow.state, nonce: flow.nonce, verifier: flow.codeVerifier }, 600), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: FLOW_COOKIE_PATH,
    maxAge: 600,
  });
  redirect(flow.url);
}
