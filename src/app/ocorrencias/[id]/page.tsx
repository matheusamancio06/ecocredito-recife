import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CloseReportForm } from "@/components/CloseReportForm";
import { MapView } from "@/components/MapView";
import { Card, PageTitle, ReportPhoto, StatusBadge, Steps, type Step } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { NEAR_POINT_METERS, POINT_KIND_LABEL, isOpen } from "@/lib/domain";
import { formatAge, formatDateTime } from "@/lib/format";
import { formatDistance, listPoints, nearestPoints } from "@/lib/points";
import { canViewReport, getReport } from "@/lib/repo";

export const metadata: Metadata = { title: "Registro de entulho" };

export default async function ReportDetailPage(props: PageProps<"/ocorrencias/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const flags = await props.searchParams;

  const report = await getReport(id);
  if (!report || !(await canViewReport(user, report))) notFound();

  const alternatives = nearestPoints(await listPoints(), report, "ENTULHO", 3);
  const open = isOpen(report.status);

  const steps: Step[] = [{ title: "Registro enviado", meta: formatDateTime(report.createdAt) }];
  if (report.confirmations > 0) {
    steps.push({
      title: `${report.confirmations} confirmaç${report.confirmations === 1 ? "ão" : "ões"} de outros moradores`,
    });
  }
  if (report.closedAt) {
    steps.push({
      title: report.status === "BAIXADA" ? "Entulho removido: baixa dada" : "Baixa dada: registro não procedente",
      meta: formatDateTime(report.closedAt),
      note: report.closingNote,
    });
  } else {
    steps.push({ title: "Aguardando a gestão de coleta", meta: `Aberto ${formatAge(report.createdAt)}`, pending: true });
  }

  return (
    <div className="mx-auto max-w-4xl">
      {flags.nova && (
        <p role="status" className="mb-4 rounded-2xl bg-st-ok-bg p-4 font-semibold text-st-ok">
          Registro enviado com o número {report.code}. A gestão de coleta vai ver e dar baixa depois da remoção; você
          acompanha por aqui.
        </p>
      )}
      {flags.confirmada && (
        <p role="status" className="mb-4 rounded-2xl bg-st-triada-bg p-4 font-semibold text-st-triada">
          Este ponto já havia sido registrado. Sua confirmação foi somada e ajuda a priorizar a remoção.
        </p>
      )}
      {flags.ja && (
        <p role="status" className="mb-4 rounded-2xl bg-st-triada-bg p-4 font-semibold text-st-triada">
          Este ponto já está registrado e você já o acompanha. Não é preciso enviar de novo.
        </p>
      )}

      <PageTitle
        title="Registro de entulho"
        subtitle={`${report.code} · ${report.neighborhood ?? "Recife"}`}
        action={<StatusBadge status={report.status} />}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-lg font-bold">Fotos</h2>
            <div className={`grid gap-3 ${report.photoAfter ? "grid-cols-2" : "grid-cols-1"}`}>
              <figure>
                <ReportPhoto name={report.photoBefore} alt="Local com o entulho" className="aspect-[4/3] w-full rounded-xl" />
                <figcaption className="mt-1 text-xs font-semibold text-ink-muted">Antes</figcaption>
              </figure>
              {report.photoAfter && (
                <figure>
                  <ReportPhoto name={report.photoAfter} alt="Local depois da remoção" className="aspect-[4/3] w-full rounded-xl" />
                  <figcaption className="mt-1 text-xs font-semibold text-ink-muted">Depois</figcaption>
                </figure>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-bold">Acompanhamento</h2>
            <Steps steps={steps} />
            {report.note && (
              <p className="mt-4 rounded-xl bg-canvas p-3 text-sm">
                <span className="font-semibold">Observação de quem registrou:</span> {report.note}
              </p>
            )}
            {report.recurrenceOf && (
              <p className="mt-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger">
                Reincidência: este ponto teve baixa há pouco tempo e o entulho voltou a aparecer.
              </p>
            )}
          </Card>

          {user.role === "GESTOR" && open && (
            <Card>
              <h2 className="mb-3 text-lg font-bold">Dar baixa</h2>
              <CloseReportForm reportId={report.id} />
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-1 text-lg font-bold">Onde descartar entulho corretamente</h2>
            {alternatives.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhum ponto de entulho cadastrado.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-ink-muted">Pontos oficiais que recebem entulho, do mais perto para o mais longe.</p>
                <ul className="divide-y divide-line">
                  {alternatives.map((p) => (
                    <li key={p.id} className="py-2">
                      <p className="text-sm font-bold">
                        {p.name} <span className="font-medium text-ink-muted">· {POINT_KIND_LABEL[p.kind]}</span>
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatDistance(p.distanceMeters)} do local
                        {p.distanceMeters > NEAR_POINT_METERS ? " (longe para levar material a pé)" : ""}
                        {p.neighborhood ? ` · ${p.neighborhood}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <MapView
            className="h-64"
            label={`Mapa com a localização do registro ${report.code}`}
            focus={{ lat: report.lat, lng: report.lng }}
            zoom={17}
            points={[{ lat: report.lat, lng: report.lng, label: report.code }]}
          />
          {user.role === "GESTOR" && (
            <p className="text-sm">
              <Link href="/gestor" className="font-semibold text-brand-strong underline">
                Voltar para a lista de registros
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
