import { MAX_ACTIONS_PER_HOUR, NOTE_MAX_LENGTH } from "./domain";
import { isWithinRecifeArea } from "./geo";
import { reportSchema } from "./report-schema";
import { confirmIfDuplicate, countRecentActivity, createReport, type CreateReportResult } from "./repo";
import { UploadError, deleteImage, normalizePhoto, readUpload, storeImageBytes } from "./uploads";

// Um registro guardado no aparelho (sem internet) pode demorar a chegar.
// Aceitamos a data da captura até este limite; fora dele, vale a data de envio.
const MAX_BACKDATE_DAYS = 7;

export type IntakeResult =
  | { ok: true; reportId: string; kind: CreateReportResult["kind"]; alreadyConfirmed: boolean }
  | { ok: false; error: string };

function textOrNull(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function capturedAt(value: FormDataEntryValue | null): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return undefined;
  const now = Date.now();
  if (at.getTime() > now) return undefined;
  return now - at.getTime() <= MAX_BACKDATE_DAYS * 86_400_000 ? at : undefined;
}

/**
 * Caminho único de entrada de um registro de entulho, usado pelo formulário e
 * pela fila offline. A ordem importa: primeiro o que é de graça (validação,
 * limite de uso e checagem de ponto já registrado), depois o que custa
 * (tratamento e armazenamento da foto).
 */
export async function intakeReport(userId: string, formData: FormData): Promise<IntakeResult> {
  const parsed = reportSchema.safeParse({ lat: formData.get("lat"), lng: formData.get("lng") });
  if (!parsed.success) return { ok: false, error: "Marque no mapa onde está o entulho." };
  const { lat, lng } = parsed.data;
  if (!isWithinRecifeArea({ lat, lng })) return { ok: false, error: "O local precisa estar dentro do Recife." };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { ok: false, error: "Envie uma foto do entulho." };

  const recent = await countRecentActivity(userId, new Date(Date.now() - 3_600_000));
  if (recent >= MAX_ACTIONS_PER_HOUR) {
    return { ok: false, error: "Você já enviou vários registros ou confirmações na última hora. Tente novamente mais tarde." };
  }

  // Ponto já registrado: só confirma. Isso vem ANTES de guardar a foto.
  const existing = await confirmIfDuplicate(userId, { lat, lng });
  if (existing?.kind === "confirmed") {
    return { ok: true, reportId: existing.report.id, kind: "confirmed", alreadyConfirmed: existing.alreadyConfirmed };
  }

  let upload;
  try {
    upload = await readUpload(photo);
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    throw error;
  }

  // Rotação do EXIF aplicada nos pixels e metadados (inclusive o GPS da câmera) removidos.
  let normalized;
  try {
    normalized = await normalizePhoto(upload.data);
  } catch {
    return { ok: false, error: "Não foi possível ler esta foto. Tente enviar outra." };
  }

  const photoName = await storeImageBytes(normalized.data, "jpg");

  const result = await createReport({
    reporterId: userId,
    lat,
    lng,
    note: textOrNull(formData.get("note"), NOTE_MAX_LENGTH),
    photoBefore: photoName,
    createdAt: capturedAt(formData.get("capturadoEm")),
  });

  // Outra pessoa registrou o mesmo ponto entre a checagem acima e agora: a foto não é necessária.
  if (result.kind === "confirmed") await deleteImage(photoName);

  return {
    ok: true,
    reportId: result.report.id,
    kind: result.kind,
    alreadyConfirmed: result.kind === "confirmed" && result.alreadyConfirmed,
  };
}

/** Sufixo de URL que conta à pessoa o que aconteceu com o envio. */
export function intakeFlag(result: Extract<IntakeResult, { ok: true }>): string {
  if (result.kind === "created") return "nova=1";
  return result.alreadyConfirmed ? "ja=1" : "confirmada=1";
}
