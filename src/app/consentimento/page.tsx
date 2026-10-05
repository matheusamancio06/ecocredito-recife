import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptConsentAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageTitle } from "@/components/ui";
import { needsConsent } from "@/lib/account";
import { HOME_BY_ROLE, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Aviso de privacidade" };

// Só aceitamos voltar para dentro do próprio app.
function safeDestination(value: string | undefined, fallback: string): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export default async function ConsentPage(props: PageProps<"/consentimento">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const destination = safeDestination(
    Array.isArray(params.destino) ? params.destino[0] : params.destino,
    HOME_BY_ROLE[user.role],
  );
  if (!(await needsConsent(user.id))) redirect(destination);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title="Antes de continuar"
        subtitle="Um resumo do que o app guarda e por quê. Leva menos de um minuto."
      />

      <Card>
        <ul className="space-y-3 text-base">
          <li>
            <strong>Do gov.br</strong> chegam só o seu nome e o CPF verificado. O CPF não é guardado — fica apenas um
            código derivado dele, que não permite recuperar o número.
          </li>
          <li>
            <strong>Do registro de entulho</strong> ficam a foto, o ponto que você marcar no mapa e o que você
            escrever. Os metadados da foto (inclusive o GPS da câmera) são removidos no servidor.
          </li>
          <li>
            <strong>Quem vê a foto:</strong> você, quem confirmou o mesmo ponto e a gestão de coleta. Evite
            fotografar pessoas e placas de veículos.
          </li>
          <li>
            <strong>Você manda na sua conta:</strong> pode baixar tudo o que foi guardado e encerrar a conta quando
            quiser, em Minha conta.
          </li>
        </ul>

        <p className="mt-4 text-sm text-ink-muted">
          Texto completo no{" "}
          <Link href="/privacidade" className="font-semibold text-brand-strong underline">
            aviso de privacidade
          </Link>
          . Este é um protótipo acadêmico: não envie dados reais sensíveis.
        </p>

        <ActionForm action={acceptConsentAction} className="mt-5">
          <input type="hidden" name="destino" value={destination} />
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 hover:bg-canvas">
            <input type="checkbox" name="aceito" value="1" className="mt-1 size-5 accent-[var(--color-brand-strong)]" />
            <span className="text-base font-semibold">
              Li e aceito o aviso de privacidade e o uso das informações acima para o serviço de coleta de entulho.
            </span>
          </label>
          <SubmitButton className="mt-4 w-full" pendingText="Registrando…">
            Aceitar e continuar
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
