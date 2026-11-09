import { authenticate, json } from "@/lib/api-json";
import { getRecyclingSummary } from "@/lib/credits";
import { getCollectionSummary } from "@/lib/repo";

/** Números da gestão de coleta nos últimos 30 dias. Só a gestão. */
export async function GET(): Promise<Response> {
  const auth = await authenticate("GESTOR");
  if ("response" in auth) return auth.response;

  const [coleta, reciclagem] = await Promise.all([getCollectionSummary(30), getRecyclingSummary(30)]);
  return json({
    ok: true,
    janelaDias: coleta.windowDays,
    coleta: {
      abertos: coleta.openCount,
      removidos: coleta.removedCount,
      maisAntigoAbertoDias: coleta.oldestOpenDays,
    },
    reciclagem: {
      entregas: reciclagem.deliveries,
      participantes: reciclagem.participants,
      kg: reciclagem.totalKg,
      litros: reciclagem.totalLiters,
      ecocoinsEmitidos: reciclagem.pointsIssued,
    },
  });
}
