import { closeReportAction } from "@/app/actions";
import { NOTE_MAX_LENGTH } from "@/lib/domain";
import { ActionForm, SubmitButton } from "./ActionForm";
import { PhotoInput } from "./PhotoInput";
import { Field, RadioChips, inputClass } from "./ui";

/** Formulário de baixa: usado na fila da gestão de coleta e na página do registro. */
export function CloseReportForm({ reportId }: { reportId: string }) {
  return (
    <ActionForm action={closeReportAction} className="space-y-4">
      <input type="hidden" name="id" value={reportId} />

      <fieldset>
        <legend className="mb-2 text-base font-semibold">Resultado</legend>
        <RadioChips
          name="outcome"
          defaultValue="BAIXADA"
          options={[
            { value: "BAIXADA", label: "Entulho removido" },
            { value: "IMPROCEDENTE", label: "Não procedente" },
          ]}
        />
      </fieldset>

      <Field label="Observação (opcional)" hint="Obrigatória se o registro não procede: diga o que foi encontrado.">
        <input name="note" maxLength={NOTE_MAX_LENGTH} className={inputClass} placeholder="Ex.: 2 caçambas removidas" />
      </Field>

      <PhotoInput name="photo" label="Foto do local depois (opcional)" required={false} />

      <SubmitButton className="w-full" pendingText="Dando baixa…">
        Confirmar baixa
      </SubmitButton>
    </ActionForm>
  );
}
