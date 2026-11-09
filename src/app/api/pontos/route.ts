import { apiError, json, parseNumber } from "@/lib/api-json";
import { POINT_CATEGORIES, type PointCategory } from "@/lib/domain";
import { listPoints, nearestPoints } from "@/lib/points";

/**
 * Pontos de descarte e entrega (dados abertos da Prefeitura). Público.
 * Filtros: `categoria` (RECICLAVEL, ELETRONICO, OLEO, ENTULHO), `atendente=1` (só pontos com atendente)
 * e, para ordenar por distância, `lat` e `lng` (com `limite`, de 1 a 50).
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const rawCategory = params.get("categoria");
  if (rawCategory !== null && !(POINT_CATEGORIES as readonly string[]).includes(rawCategory)) {
    return apiError(`Categoria inválida. Use: ${POINT_CATEGORIES.join(", ")}.`, 400);
  }
  const category = rawCategory as PointCategory | null;

  const lat = parseNumber(params.get("lat"), -90, 90);
  const lng = parseNumber(params.get("lng"), -180, 180);
  if ((params.get("lat") !== null || params.get("lng") !== null) && (lat === null || lng === null)) {
    return apiError("Informe lat e lng válidos.", 400);
  }
  const limit = parseNumber(params.get("limite"), 1, 50) ?? 10;

  let points = await listPoints();
  if (params.get("atendente") === "1") points = points.filter((p) => p.staffed);

  const result =
    lat !== null && lng !== null
      ? nearestPoints(points, { lat, lng }, category, limit).map((p) => ({
          ...p,
          distanciaMetros: Math.round(p.distanceMeters),
        }))
      : points.filter((p) => category === null || p.accepts.includes(category));

  return json({ ok: true, total: result.length, pontos: result });
}
