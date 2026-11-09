import { CAPIBA_CATALOG, CAPIBA_SOURCES } from "@/lib/capiba-catalog";
import { formatNumber } from "@/lib/format";
import { Card } from "./ui";

/** Saldo de Capibas recebidas por aqui (simulado) e o que a Capiba real compra. */
export function CapibaWallet({ capibas }: { capibas: number }) {
  return (
    <>
      <Card className="text-center">
        <p className="text-sm font-semibold text-ink-muted">Suas Capibas</p>
        <p className="text-5xl font-extrabold tracking-tight text-brand-strong">{formatNumber(capibas)}</p>
        <p className="text-sm text-ink-muted">Moeda Capiba (simulada)</p>
        <p className="mt-3 text-xs text-ink-muted">
          Soma das trocas feitas aqui. No ambiente real, elas apareceriam na sua carteira do Conecta Recife.
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">O que dá para trocar com a Capiba</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Na &quot;feirinha&quot; do app Conecta Recife, a Capiba vale estes tipos de benefício:
        </p>
        <div className="mt-3 space-y-3">
          {CAPIBA_CATALOG.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-bold">{group.title}</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-canvas p-3 text-xs text-ink-muted">
          A Prefeitura não divulga o preço de cada item em Capibas, e a lista é de 2024: a oferta muda. Confira o que
          está disponível no Conecta Recife, em Destaques &gt; Moeda Capiba &gt; feirinha. Aqui não é possível gastar
          Capibas.
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          Fontes:{" "}
          {CAPIBA_SOURCES.map((s, i) => (
            <span key={s.url}>
              {i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                {s.label}
              </a>
            </span>
          ))}
        </p>
      </Card>
    </>
  );
}
