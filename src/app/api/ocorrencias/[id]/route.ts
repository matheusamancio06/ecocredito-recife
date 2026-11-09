import { apiError, authenticate, json, serializeReport } from "@/lib/api-json";
import { canViewReport, getReport } from "@/lib/repo";

/** Um registro de entulho. Só a gestão, quem registrou e quem confirmou podem consultar. */
export async function GET(_request: Request, context: RouteContext<"/api/ocorrencias/[id]">): Promise<Response> {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const report = await getReport(id);
  // Mesma resposta para "não existe" e "não é seu": não revela que o registro existe.
  if (!report || !(await canViewReport(auth.user, report))) return apiError("Registro não encontrado.", 404);
  return json({ ok: true, ocorrencia: serializeReport(report) });
}
