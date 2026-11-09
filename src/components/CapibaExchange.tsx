import { exchangeCapibaAction } from "@/app/actions";
import { ECOCOINS_PER_CAPIBA, MAX_CAPIBAS_PER_EXCHANGE } from "@/lib/domain";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { CapibaExchange as Exchange } from "@/lib/capiba";
import { ActionForm, SubmitButton } from "./ActionForm";
import { Card, Field, inputClass } from "./ui";

const STATUS_LABEL: Record<Exchange["status"], string> = {
  PENDENTE: "Em andamento",
  CREDITADA: "Creditada",
  FALHOU: "Não concluída (EcoCoins devolvidos)",
};

/** Troca de EcoCoins por Moeda Capiba, a moeda social digital da Prefeitura do Recife. */
export function CapibaExchange({
  balance,
  available,
  history,
}: {
  balance: number;
  available: boolean;
  history: Exchange[];
}) {
  const max = Math.min(MAX_CAPIBAS_PER_EXCHANGE, Math.floor(balance / ECOCOINS_PER_CAPIBA));

  return (
    <Card>
      <h2 className="text-lg font-bold">Trocar por Moeda Capiba</h2>
      <p className="mt-1 text-sm text-ink-muted">
        A Capiba é a moeda social digital da Prefeitura do Recife, usada no app Conecta Recife. Cada{" "}
        <strong>{formatNumber(ECOCOINS_PER_CAPIBA)} EcoCoins</strong> viram <strong>1 Capiba</strong>{" "}
        <span className="whitespace-nowrap">(taxa de exemplo; quem define é a Prefeitura).</span>
      </p>

      {!available ? (
        <p className="mt-3 rounded-xl bg-canvas p-3 text-sm text-ink-muted">
          A troca depende da integração com o Conecta Recife e ainda não está ativa neste ambiente.
        </p>
      ) : max < 1 ? (
        <p className="mt-3 rounded-xl bg-canvas p-3 text-sm text-ink-muted">
          Junte pelo menos {formatNumber(ECOCOINS_PER_CAPIBA)} EcoCoins reciclando para fazer a primeira troca. Faltam{" "}
          {formatNumber(ECOCOINS_PER_CAPIBA - balance)}.
        </p>
      ) : (
        <ActionForm action={exchangeCapibaAction} className="mt-3 space-y-3">
          <Field label="Quantas Capibas?" hint={`Você pode trocar até ${max} agora.`}>
            <input
              name="capibas"
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              step={1}
              defaultValue={1}
              required
              className={inputClass}
            />
          </Field>
          <SubmitButton className="w-full" pendingText="Trocando…">
            Trocar por Capibas
          </SubmitButton>
          <p className="text-xs text-ink-muted">
            Protótipo: a troca é simulada. No ambiente real, as Capibas seriam creditadas na sua carteira do Conecta
            Recife, o que depende de acordo com a Prefeitura.
          </p>
        </ActionForm>
      )}

      {history.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-base font-bold">Minhas trocas</h3>
          <ul className="divide-y divide-line text-sm">
            {history.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-bold">
                    {x.capibas} Capiba{x.capibas === 1 ? "" : "s"} · −{formatNumber(x.ecocoins)} EcoCoins
                  </p>
                  <p className="text-xs text-ink-muted">
                    {STATUS_LABEL[x.status]}
                    {x.simulated && " · simulada"} · {formatDateTime(x.createdAt)}
                  </p>
                </div>
                {x.protocol && <span className="shrink-0 font-mono text-xs font-bold">{x.protocol}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
