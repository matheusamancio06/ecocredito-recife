import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABEL, type Status } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import type { Report } from "@/lib/repo";

const STATUS_STYLE: Record<Status, string> = {
  ABERTA: "bg-st-nova-bg text-st-nova",
  BAIXADA: "bg-st-ok-bg text-st-ok",
  IMPROCEDENTE: "bg-st-no-bg text-st-no",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// `min-w-0` deixa o cartão encolher dentro de uma grade: sem isso, uma tabela larga ou um
// campo de data empurra a página inteira para mais larga que a tela do celular.
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad";
}) {
  const toneClass = tone === "good" ? "text-brand-strong" : tone === "bad" ? "text-danger" : "text-ink";
  return (
    <div className="h-full rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold tracking-tight ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

// Barras de um único tom: a cor representa magnitude; a identidade vem do rótulo.
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="break-words font-medium leading-tight" title={item.label}>
            {item.label}
          </span>
          <span className="h-3 rounded-full bg-brand-soft">
            <span
              className="block h-3 rounded-full bg-brand-strong"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-right font-bold tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReportPhoto({ name, alt, className = "" }: { name: string; alt: string; className?: string }) {
  return (
    // Fotos exigem sessão e permissão por registro, então não passam pelo otimizador do next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/fotos/${name}`} alt={alt} loading="lazy" className={`bg-brand-soft object-cover ${className}`} />
  );
}

export function ReportListItem({ report }: { report: Report }) {
  return (
    <li>
      <Link
        href={`/ocorrencias/${report.id}`}
        className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 hover:border-brand-strong"
      >
        <ReportPhoto name={report.photoBefore} alt="" className="size-16 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{report.neighborhood ?? "Recife"}</p>
          <p className="text-sm text-ink-muted">{formatDateTime(report.createdAt)}</p>
          <p className="text-xs text-ink-muted">
            {report.code}
            {report.confirmations > 0 && ` · ${report.confirmations} confirmaç${report.confirmations === 1 ? "ão" : "ões"}`}
          </p>
        </div>
        <div className="shrink-0 self-start">
          <StatusBadge status={report.status} />
        </div>
      </Link>
    </li>
  );
}

export interface Step {
  title: string;
  meta?: string;
  note?: string | null;
  /** Etapa que ainda vai acontecer: aparece esmaecida. */
  pending?: boolean;
}

/** Linha do tempo curta do registro: registrado, confirmações e baixa. */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-4 border-l-2 border-line pl-4">
      {steps.map((step) => (
        <li key={step.title} className="relative">
          <span
            className={`absolute -left-[1.4rem] top-1.5 size-3 rounded-full border-2 border-white ${step.pending ? "bg-line" : "bg-brand-strong"}`}
          />
          <p className={`text-sm font-bold ${step.pending ? "text-ink-muted" : ""}`}>{step.title}</p>
          {step.meta && <p className="text-xs text-ink-muted">{step.meta}</p>}
          {step.note && <p className="mt-0.5 text-sm">{step.note}</p>}
        </li>
      ))}
    </ol>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-base font-semibold">{label}</span>
      {hint && <span className="mb-1 block text-sm text-ink-muted">{hint}</span>}
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-12 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3 text-base text-ink placeholder:text-ink-muted/70";

const CHIP_CLASS =
  "flex min-h-12 items-center rounded-xl border border-line bg-white px-4 text-base font-medium peer-checked:border-brand-strong peer-checked:bg-brand-soft peer-checked:font-bold peer-focus-visible:outline-3 peer-focus-visible:outline-brand-strong";

export function RadioChips<T extends string>({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: { value: T; label: string }[];
  defaultValue?: T;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {options.map((option) => (
        <label key={option.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === defaultValue}
            required
            className="peer sr-only"
          />
          <span className={CHIP_CLASS}>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
