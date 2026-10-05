import { getDb } from "./db";
import { POINT_CATEGORIES, type PointCategory, type PointKind } from "./domain";
import { haversineMeters, type LatLng } from "./geo";

export interface CollectionPoint {
  id: string;
  kind: PointKind;
  name: string;
  neighborhood: string | null;
  address: string | null;
  lat: number;
  lng: number;
  /** Só as categorias que o app usa (entulho, recicláveis, eletrônicos e óleo). */
  accepts: PointCategory[];
  staffed: boolean;
}

export interface NearbyPoint extends CollectionPoint {
  distanceMeters: number;
}

interface PointRow extends Omit<CollectionPoint, "accepts"> {
  accepts: string[];
}

const RELEVANT: readonly string[] = POINT_CATEGORIES;

// Os dados abertos trazem onze categorias (poda, pneus, lâmpadas...), mas o app só
// lida com quatro. As demais ficam no banco e saem daqui, para nenhuma tela
// mostrar rótulo vazio nem listar um ponto que não serve a nada do que o app faz.
function mapPoint(row: PointRow): CollectionPoint {
  return { ...row, accepts: row.accepts.filter((a): a is PointCategory => RELEVANT.includes(a)) };
}

const POINT_COLUMNS = `id, kind, name, neighborhood, address, lat, lng, accepts, staffed`;

export async function listPoints(): Promise<CollectionPoint[]> {
  const db = await getDb();
  const { rows } = await db.query<PointRow>(
    `SELECT ${POINT_COLUMNS} FROM collection_points WHERE accepts && $1::text[] ORDER BY name`,
    [POINT_CATEGORIES],
  );
  return rows.map(mapPoint);
}

export async function getPoint(id: string): Promise<CollectionPoint | null> {
  const db = await getDb();
  const { rows } = await db.query<PointRow>(`SELECT ${POINT_COLUMNS} FROM collection_points WHERE id = $1`, [id]);
  return rows[0] ? mapPoint(rows[0]) : null;
}

export async function findPointByKind(kind: PointKind, staffedOnly = true): Promise<CollectionPoint | null> {
  const db = await getDb();
  const { rows } = await db.query<PointRow>(
    `SELECT ${POINT_COLUMNS} FROM collection_points
     WHERE kind = $1 AND ($2::boolean = false OR staffed = true) ORDER BY id LIMIT 1`,
    [kind, staffedOnly],
  );
  return rows[0] ? mapPoint(rows[0]) : null;
}

/** Pontos mais próximos de um local, opcionalmente só os que aceitam uma categoria. */
export function nearestPoints(
  points: CollectionPoint[],
  origin: LatLng,
  category: PointCategory | null,
  limit = 3,
): NearbyPoint[] {
  return points
    .filter((p) => category === null || p.accepts.includes(category))
    .map((p) => ({ ...p, distanceMeters: haversineMeters(origin, p) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

export function formatDistance(meters: number): string {
  const rounded = Math.round(meters / 10) * 10;
  if (rounded < 10) return "menos de 10 m";
  if (rounded < 1000) return `${rounded} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
