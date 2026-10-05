import type { Metadata } from "next";
import Link from "next/link";
import { PendingReports } from "@/components/PendingReports";
import { PageTitle, ReportListItem } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listReportsByReporter } from "@/lib/repo";

export const metadata: Metadata = { title: "Meus registros" };

export default async function MyReportsPage() {
  const user = await requireUser("CIDADAO");
  const reports = await listReportsByReporter(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title="Meus registros"
        subtitle="Entulho que você registrou ou confirmou. Quando a gestão de coleta remove, o registro aparece como baixado."
        action={
          <Link
            href="/reportar"
            className="inline-flex min-h-12 items-center rounded-xl bg-brand px-5 text-base font-bold text-ink hover:brightness-95"
          >
            Novo registro
          </Link>
        }
      />

      <PendingReports />

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-center text-ink-muted">
          Você ainda não registrou nenhum entulho.
        </p>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <ReportListItem key={report.id} report={report} />
          ))}
        </ul>
      )}
    </div>
  );
}
