import { authenticate, json } from "@/lib/api-json";
import { capibaBalance, listExchanges } from "@/lib/capiba";
import { getBalance, listDeliveries } from "@/lib/credits";

/** Carteira do cidadão: saldo de EcoCoins, Capibas recebidas, entregas e trocas. */
export async function GET(): Promise<Response> {
  const auth = await authenticate("CIDADAO");
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;

  const [ecocoins, capibas, entregas, trocas] = await Promise.all([
    getBalance(userId),
    capibaBalance(userId),
    listDeliveries(userId),
    listExchanges(userId),
  ]);
  return json({
    ok: true,
    saldoEcoCoins: ecocoins,
    saldoCapibas: capibas,
    entregas: entregas.map((d) => ({
      id: d.id,
      material: d.material,
      rotulo: d.label,
      quantidade: d.quantity,
      unidade: d.unit,
      ecocoins: d.points,
      ponto: d.pointName,
      em: d.createdAt.toISOString(),
    })),
    trocasPorCapiba: trocas.map((t) => ({
      id: t.id,
      capibas: t.capibas,
      ecocoins: t.ecocoins,
      situacao: t.status,
      protocolo: t.protocol,
      simulada: t.simulated,
      em: t.createdAt.toISOString(),
    })),
  });
}
