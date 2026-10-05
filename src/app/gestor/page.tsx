import type { Metadata } from "next";
import Link from "next/link";
import { CloseReportForm } from "@/components/CloseReportForm";
import { MapView } from "@/components/MapView";
import { Card, KpiCard, PageTitle, ReportPhoto, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getRecyclingSummary } from "@/lib/credits";
import { formatAge, formatDate, formatNumber } from "@/lib/format";
import { getCollectionSummary, listClosedReports, listOpenReports } from "@/lib/repo";

export const metadata: Metadata = { title: "Registros de entulho" };

export default async function CollectionManagementPage(props: PageProps<"/gestor">) {
  await requireUser("GESTOR");
  const params = await props.searchParams;
  const showClosed = (Array.isArray(params.ver) ? params.ver[0] : params.ver) === "baixados";

  const [summary, recycling, reports] = await Promise.all([
    getCollectionSummary(30),
    getRecyclingSummary(30),
    showClosed ? listClosedReports() : listOpenReports(),
  ]);

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-semibold ${active ? "border-brand-strong bg-brand-soft" : "border-line bg-white hover:bg-canvas"}`;

  return (
    <div>
      <PageTitle
        title="Registros de entulho"
        subtitle="O que a população registrou. Depois de remover o entulho, dê baixa. Dados simulados para demonstração."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Abertos agora"
          value={String(summary.openCount)}
          hint={summary.oldestOpenAt ? `O mais antigo está aberto ${formatAge(summary.oldestOpenAt)}` : "Nenhum aguardando"}
          tone={summary.oldestOpenDays !== null && summary.oldestOpenDays > 10 ? "bad" : "default"}
        />
        <KpiCard label="Baixados" value={String(summary.removedCount)} hint={`Entulho removido, últimos ${summary.windowDays} dias`} tone="good" />
        <KpiCard
          label="Reciclado"
          value={`${formatNumber(recycling.totalKg, 0)} kg`}
          hint={`${formatNumber(recycling.deliveries)} entregas pesadas, últimos ${recycling.windowDays} dias`}
        />
        <KpiCard
          label="EcoCoins emitidos"
          value={formatNumber(recycling.pointsIssued)}
          hint={`${formatNumber(recycling.participants)} participantes, últimos ${recycling.windowDays} dias`}
        />
      </div>

      <nav aria-label="Situação dos registros" className="mb-4 mt-6 flex flex-wrap gap-2">
        <Link href="/gestor" className={chip(!showClosed)} aria-current={!showClosed ? "true" : undefined}>
          Abertos ({summary.openCount})
        </Link>
        <Link href="/gestor?ver=baixados" className={chip(showClosed)} aria-current={showClosed ? "true" : undefined}>
          Já tiveram baixa
        </Link>
      </nav>

      {!showClosed && reports.length > 0 && (
        <div className="mb-5">
          <MapView
            className="h-72"
            label="Mapa dos registros de entulho abertos"
            points={reports.map((r) => ({
              lat: r.lat,
              lng: r.lng,
              label: `${r.code} · ${r.neighborhood ?? "Recife"} · aberto ${formatAge(r.createdAt)}`,
            }))}
          />
        </div>
      )}

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-center text-ink-muted">
          {showClosed ? "Nenhum registro teve baixa ainda." : "Nenhum registro aberto. Bom trabalho!"}
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {reports.map((report) => (
            <li key={report.id}>
              <Card>
                <div className="flex gap-3">
                  <ReportPhoto name={report.photoBefore} alt="" className="size-24 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-bold">{report.neighborhood ?? "Recife"}</p>
                      {showClosed && <StatusBadge status={report.status} />}
                    </div>
                    <p className="text-sm text-ink-muted">
                      {showClosed && report.closedAt
                        ? `Baixa em ${formatDate(report.closedAt)}`
                        : `Aberto ${formatAge(report.createdAt)}`}
                      {report.confirmations > 0 &&
                        ` · ${report.confirmations} confirmaç${report.confirmations === 1 ? "ão" : "ões"}`}
                    </p>
                    {report.recurrenceOf && (
                      <p className="mt-1 inline-block rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-bold text-danger">
                        Reincidência
                      </p>
                    )}
                    {report.note && <p className="mt-1 line-clamp-2 text-sm">{report.note}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-brand-strong">
                      <Link href={`/ocorrencias/${report.id}`} className="underline">
                        Ver detalhes
                      </Link>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${report.lat},${report.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Abrir rota no mapa
                      </a>
                    </div>
                  </div>
                </div>

                {!showClosed && (
                  <details className="mt-4 border-t border-line pt-4">
                    <summary className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-brand px-5 text-base font-bold text-ink hover:brightness-95">
                      Dar baixa
                    </summary>
                    <div className="mt-4">
                      <CloseReportForm reportId={report.id} />
                    </div>
                  </details>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
