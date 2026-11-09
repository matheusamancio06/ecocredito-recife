import { json } from "@/lib/api-json";
import { listRates } from "@/lib/credits";

/** Quanto vale cada material reciclável em EcoCoins (valores de exemplo do protótipo). Público. */
export async function GET(): Promise<Response> {
  const rates = await listRates();
  return json({
    ok: true,
    materiais: rates.map((r) => ({
      material: r.material,
      rotulo: r.label,
      unidade: r.unit,
      ecocoinsPorUnidade: r.pointsPerUnit,
    })),
  });
}
