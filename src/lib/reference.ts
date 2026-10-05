import type { Database } from "./db";
import raw from "../data/collection-points.json";
import { DEFAULT_RATES, MATERIALS, STAFFED_KINDS, type PointCategory, type PointKind } from "./domain";
import { insertMany } from "./sql";

interface RawPoint {
  id: string;
  kind: PointKind;
  name: string;
  neighborhood: string | null;
  address: string | null;
  lat: number;
  lng: number;
  accepts: PointCategory[];
}

export const POINTS_ATTRIBUTION = (raw as unknown as { attribution: string }).attribution;

/**
 * Dados de referência carregados em qualquer ambiente (não só na demonstração):
 * pontos de descarte reais dos dados abertos e a tabela de EcoCoins por material.
 * Só insere o que ainda não existe, então pode rodar a cada inicialização.
 */
export async function seedReferenceData(db: Database): Promise<void> {
  const points = (raw as unknown as { points: RawPoint[] }).points;
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM collection_points`);
  if (rows[0].n === 0) {
    await db.transaction(async (tx) => {
      await insertMany(
        tx,
        "collection_points",
        ["id", "kind", "name", "neighborhood", "address", "lat", "lng", "accepts", "staffed"],
        points.map((p) => [p.id, p.kind, p.name, p.neighborhood, p.address, p.lat, p.lng, p.accepts, STAFFED_KINDS.includes(p.kind)]),
      );
    });
  }

  for (const material of MATERIALS) {
    const rate = DEFAULT_RATES[material];
    await db.query(
      `INSERT INTO material_rates (material, label, unit, points_per_unit) VALUES ($1,$2,$3,$4)
       ON CONFLICT (material) DO NOTHING`,
      [material, rate.label, rate.unit, rate.pointsPerUnit],
    );
  }
}
