import type { Metadata } from "next";
import Link from "next/link";
import { LocationPicker } from "@/components/LocationPicker";
import { PhotoInput } from "@/components/PhotoInput";
import { ReportForm } from "@/components/ReportForm";
import { Field, PageTitle, inputClass } from "@/components/ui";
import { requireCitizenWithConsent } from "@/lib/auth";
import { NOTE_MAX_LENGTH } from "@/lib/domain";

export const metadata: Metadata = { title: "Registrar entulho" };

export default async function ReportPage() {
  await requireCitizenWithConsent();

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title="Registrar entulho"
        subtitle="Leva cerca de um minuto. Se este ponto já foi registrado, sua confirmação ajuda a priorizar."
      />

      <ReportForm>
        <PhotoInput name="photo" label="Foto do entulho" hint="Evite enquadrar pessoas e placas de veículos." />

        <LocationPicker />

        <Field
          label="Ponto de referência ou observação (opcional)"
          hint="Ex.: em frente à padaria, ao lado do poste 42. Está bloqueando a calçada?"
        >
          <textarea name="note" maxLength={NOTE_MAX_LENGTH} rows={3} className={`${inputClass} py-2`} />
        </Field>
      </ReportForm>

      <p className="mt-6 text-sm text-ink-muted">
        Tem entulho para descartar?{" "}
        <Link href="/onde-descartar?categoria=ENTULHO" className="font-semibold text-brand-strong underline">
          Veja onde levar
        </Link>
        .
      </p>
    </div>
  );
}
