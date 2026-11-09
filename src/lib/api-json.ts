import { getCurrentUser } from "./auth";
import type { Role } from "./domain";
import type { Report, User } from "./repo";

/** Resposta JSON sem cache: os dados mudam com a sessão. */
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiError(error: string, status: number): Response {
  return json({ ok: false, error }, status);
}

/** Confere a sessão e o perfil. Devolve o usuário, ou a resposta de erro (401/403) pronta. */
export async function authenticate(...roles: Role[]): Promise<{ user: User } | { response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { response: apiError("Sessão expirada. Entre de novo.", 401) };
  if (roles.length > 0 && !roles.includes(user.role)) {
    return { response: apiError("Sem permissão para esta consulta.", 403) };
  }
  return { user };
}

/**
 * Forma pública de um registro. Não expõe quem registrou (reporterId); as fotos viram
 * endereços de /api/fotos, que conferem de novo quem pode vê-las.
 */
export function serializeReport(report: Report) {
  const photo = (name: string | null) => (name ? `/api/fotos/${encodeURIComponent(name)}` : null);
  return {
    id: report.id,
    codigo: report.code,
    situacao: report.status,
    lat: report.lat,
    lng: report.lng,
    bairro: report.neighborhood,
    observacao: report.note,
    fotoAntes: photo(report.photoBefore),
    fotoDepois: photo(report.photoAfter),
    reincidenciaDe: report.recurrenceOf,
    criadoEm: report.createdAt.toISOString(),
    baixadoEm: report.closedAt ? report.closedAt.toISOString() : null,
    notaDaBaixa: report.closingNote,
    confirmacoes: report.confirmations,
  };
}

/** Número finito dentro de um intervalo, ou null (texto vazio, ausente ou fora da faixa). */
export function parseNumber(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
