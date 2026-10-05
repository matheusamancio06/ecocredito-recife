import { exportUserData } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth";

/** Portabilidade (LGPD, art. 18, V): a pessoa baixa os próprios dados. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const data = await exportUserData(user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-ecocredito-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
