import type { Metadata } from "next";
import Link from "next/link";
import { MapView, type MapPoint } from "@/components/MapView";
import { Card, PageTitle } from "@/components/ui";
import {
  POINT_CATEGORIES,
  POINT_CATEGORY_LABEL,
  POINT_KIND_LABEL,
  type PointCategory,
  type PointKind,
} from "@/lib/domain";
import { listPoints } from "@/lib/points";
import { POINTS_ATTRIBUTION } from "@/lib/reference";

export const metadata: Metadata = { title: "Onde descartar e entregar" };

const KIND_STYLE: Record<PointKind, { color: string; radius: number }> = {
  ECOESTACAO: { color: "#23310d", radius: 9 },
  COOPERATIVA: { color: "#8a5a00", radius: 8 },
  ECOPONTO: { color: "#3f6b12", radius: 7 },
  PEV: { color: "#2f6f9f", radius: 6 },
  OUTRO: { color: "#7b7b7b", radius: 5 },
};

const LIST_LIMIT = 40;

export default async function WhereToDiscardPage(props: PageProps<"/onde-descartar">) {
  const params = await props.searchParams;
  const requested = Array.isArray(params.categoria) ? params.categoria[0] : params.categoria;
  const category = POINT_CATEGORIES.find((c) => c === requested) ?? null;
  // Só os pontos com atendente pesam a entrega e creditam EcoCoins.
  const onlyStaffed = (Array.isArray(params.atendente) ? params.atendente[0] : params.atendente) === "1";

  const points = (await listPoints()).filter((p) => !onlyStaffed || p.staffed);
  const filtered = category ? points.filter((p) => p.accepts.includes(category)) : points;
  const counts = new Map<PointCategory, number>(
    POINT_CATEGORIES.map((c) => [c, points.filter((p) => p.accepts.includes(c)).length]),
  );
  const base = onlyStaffed ? "/onde-descartar?atendente=1" : "/onde-descartar";
  const withCategory = (c: PointCategory) => `${base}${onlyStaffed ? "&" : "?"}categoria=${c}`;

  const mapPoints: MapPoint[] = filtered.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    label: `${p.name} · ${POINT_KIND_LABEL[p.kind]}${p.neighborhood ? ` · ${p.neighborhood}` : ""}`,
    ...KIND_STYLE[p.kind],
  }));

  const list = [...filtered].sort((a, b) => (a.neighborhood ?? "").localeCompare(b.neighborhood ?? "", "pt-BR"));
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-2 text-sm font-semibold ${active ? "border-brand-strong bg-brand-soft" : "border-line bg-white hover:bg-canvas"}`;

  return (
    <div>
      <PageTitle
        title={onlyStaffed ? "Onde entregar e ganhar EcoCoins" : "Onde descartar"}
        subtitle={
          onlyStaffed
            ? "Cooperativas e ecoestações com atendente: só nesses pontos a entrega é pesada e vira EcoCoins. Escolha o material para filtrar."
            : "Pontos oficiais de entrega e coleta no Recife. Escolha o tipo de material para filtrar."
        }
      />

      <nav aria-label="Filtrar por material" className="mb-4 flex flex-wrap gap-2">
        <Link href={base} className={chip(category === null)} aria-current={category === null ? "true" : undefined}>
          Todos ({points.length})
        </Link>
        {POINT_CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => (
          <Link
            key={c}
            href={withCategory(c)}
            className={chip(category === c)}
            aria-current={category === c ? "true" : undefined}
          >
            {POINT_CATEGORY_LABEL[c]} ({counts.get(c)})
          </Link>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <MapView className="h-[28rem]" label="Mapa dos pontos de descarte e coleta do Recife" points={mapPoints} />
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Legenda do mapa">
            {(Object.keys(KIND_STYLE) as PointKind[]).map((kind) => (
              <li key={kind} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-full" style={{ background: KIND_STYLE[kind].color }} />
                {POINT_KIND_LABEL[kind]}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-5">
          {!onlyStaffed && (
          <Card>
            <h2 className="text-lg font-bold">Entulho e móveis: coleta agendada</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Segundo a Prefeitura (abril de 2026), pequenos geradores podem agendar a retirada em casa pelo app{" "}
              <strong>Conecta Recife</strong>: até 2 coletas por mês de até 1 m³ cada, ou 1 coleta mensal de até 2 m³. A
              equipe confirma dia e turno em até 3 dias úteis.
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Para remoção de entulho em área pública, o prazo de resposta da Emlurb é de 10 dias.{" "}
              <a
                href="https://conecta.recife.pe.gov.br/servico/245"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brand-strong underline"
              >
                Solicitar remoção de entulhos
              </a>
            </p>
          </Card>
          )}

          <Card>
            <h2 className="mb-3 text-lg font-bold">
              {filtered.length} ponto{filtered.length === 1 ? "" : "s"}
              {category ? ` para ${POINT_CATEGORY_LABEL[category].toLowerCase()}` : ""}
            </h2>
            <ul className="divide-y divide-line">
              {list.slice(0, LIST_LIMIT).map((p) => (
                <li key={p.id} className="py-2.5">
                  <p className="text-sm font-bold">
                    {p.name} <span className="font-medium text-ink-muted">· {POINT_KIND_LABEL[p.kind]}</span>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {[p.neighborhood, p.address].filter(Boolean).join(" · ") || "Endereço não informado"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {p.accepts.map((a) => POINT_CATEGORY_LABEL[a]).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
            {list.length > LIST_LIMIT && (
              <p className="mt-2 text-xs text-ink-muted">
                Mostrando {LIST_LIMIT} de {list.length}. Use os filtros para refinar.
              </p>
            )}
          </Card>
        </div>
      </div>

      <p className="mt-6 text-xs text-ink-muted">
        Fonte dos pontos: {POINTS_ATTRIBUTION}, licença ODbL. Os dados são atualizados anualmente pela Emlurb e podem
        estar desatualizados; confirme o funcionamento antes de ir.
      </p>
    </div>
  );
}
