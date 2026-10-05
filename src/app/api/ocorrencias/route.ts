import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { needsConsent } from "@/lib/account";
import { intakeFlag, intakeReport } from "@/lib/report-intake";

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
