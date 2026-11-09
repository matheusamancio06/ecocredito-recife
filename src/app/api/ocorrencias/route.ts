import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { needsConsent } from "@/lib/account";
import { intakeFlag, intakeReport } from "@/lib/report-intake";
import { apiError, authenticate, json, serializeReport } from "@/lib/api-json";
import { listClosedReports, listOpenReports, listReportsByReporter, type Report } from "@/lib/repo";

/**
 * Lista de registros. O cidadão recebe os que registrou ou confirmou; a gestão de coleta
 * recebe a fila (`?situacao=abertas`, padrão) ou os que já tiveram baixa (`?situacao=baixadas`).
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate("CIDADAO", "GESTOR");
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let reports: Report[];
  if (user.role === "CIDADAO") {
    reports = await listReportsByReporter(user.id);
  } else {
    const situacao = new URL(request.url).searchParams.get("situacao") ?? "abertas";
    if (situacao !== "abertas" && situacao !== "baixadas") {
      return apiError("Use situacao=abertas ou situacao=baixadas.", 400);
    }
    reports = situacao === "abertas" ? await listOpenReports() : await listClosedReports();
  }
  return json({ ok: true, total: reports.length, ocorrencias: reports.map(serializeReport) });
}

/**
 * Envio de registro de entulho. O formulário usa esta rota diretamente, e é ela também
 * que recebe o que ficou guardado no aparelho enquanto faltava internet — por
 * isso o envio não é uma server action: a fila offline precisa de um endereço
 * fixo para repetir a requisição depois.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Sessão expirada. Entre de novo." }, { status: 401 });
  if (user.role !== "CIDADAO") {
    return Response.json({ ok: false, error: "Este envio é do app do cidadão." }, { status: 403 });
  }
  if (await needsConsent(user.id)) {
    return Response.json({ ok: false, error: "Aceite o aviso de privacidade para registrar entulho." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Envio inválido." }, { status: 400 });
  }

  const result = await intakeReport(user.id, formData);
  if (!result.ok) return Response.json(result, { status: 400 });

  revalidatePath("/minhas-ocorrencias");
  return Response.json({
    ok: true,
    reportId: result.reportId,
    url: `/ocorrencias/${result.reportId}?${intakeFlag(result)}`,
  });
}
