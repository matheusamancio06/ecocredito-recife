import type { Metadata } from "next";
import Link from "next/link";
import { CapibaExchange } from "@/components/CapibaExchange";
import { Card, PageTitle } from "@/components/ui";
import { WalletQr } from "@/components/WalletQr";
import { CapibaWallet } from "@/components/CapibaWallet";
import { capibaBalance, defaultGateway, listExchanges } from "@/lib/capiba";
import { getBalance, listDeliveries, listRates } from "@/lib/credits";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Reciclar" };

export default async function WalletPage() {
  const user = await requireUser("CIDADAO");
  const [balance, history, rates, exchanges, capibas] = await Promise.all([
    getBalance(user.id),
    listDeliveries(user.id),
    listRates(),
    listExchanges(user.id),
    capibaBalance(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        title="Reciclar e acumular EcoCoins"
        subtitle="Leve recicláveis a uma cooperativa ou ecoestação, mostre o QR Code e ganhe EcoCoins pelo peso conferido."
      />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-5">
          <Card className="text-center">
            <p className="text-sm font-semibold text-ink-muted">Seu saldo</p>
            <p className="text-5xl font-extrabold tracking-tight text-brand-strong">{formatNumber(balance)}</p>
            <p className="text-sm text-ink-muted">EcoCoins</p>
            <p className="mt-3 text-xs text-ink-muted">
              O saldo fica guardado e não expira. Você pode trocá-lo por Moeda Capiba, logo abaixo.
            </p>
          </Card>

          <CapibaExchange balance={balance} available={defaultGateway() !== null} history={exchanges} />

          <CapibaWallet capibas={capibas} />

          <Card>
            <h2 className="mb-3 text-center text-lg font-bold">Código para o operador</h2>
            <WalletQr />
            <p className="mt-4 text-center text-sm">
              <Link href="/onde-descartar?atendente=1" className="font-semibold text-brand-strong underline">
                Ver onde entregar e ganhar EcoCoins
              </Link>
            </p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-lg font-bold">Histórico</h2>
            {history.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhuma entrega registrada ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {history.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">
                        {d.label} · {formatNumber(d.quantity, 1)} {d.unit === "L" ? "L" : "kg"}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {d.pointName} · {formatDateTime(d.createdAt)}
                      </p>
                    </div>
                    <p className="shrink-0 font-extrabold tabular-nums text-brand-strong">+{formatNumber(d.points)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-bold">Quanto vale cada material</h2>
            <p className="mb-3 text-xs text-ink-muted">Tabela de exemplo do protótipo; a Prefeitura define os valores.</p>
            <ul className="divide-y divide-line text-sm">
              {rates.map((r) => (
                <li key={r.material} className="flex justify-between py-2">
                  <span>{r.label}</span>
                  <span className="font-bold tabular-nums">
                    {r.pointsPerUnit} por {r.unit === "L" ? "litro" : "kg"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
