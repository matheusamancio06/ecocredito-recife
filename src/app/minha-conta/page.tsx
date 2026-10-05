import type { Metadata } from "next";
import Link from "next/link";
import { deleteAccountAction, logoutEverywhere } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, Field, PageTitle, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { listSessions } from "@/lib/session";

export const metadata: Metadata = { title: "Minha conta" };

// O nome do navegador é a informação útil para reconhecer o aparelho.
function deviceName(userAgent: string | null): string {
  if (!userAgent) return "Aparelho desconhecido";
  const system = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iOS/i.test(userAgent)
      ? "iPhone ou iPad"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS/i.test(userAgent)
          ? "Mac"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Aparelho";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Safari\//.test(userAgent)
        ? "Safari"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : "navegador";
  return `${system} · ${browser}`;
}

export default async function AccountPage() {
  const user = await requireUser();
  const sessions = await listSessions(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Minha conta" subtitle="Seus dados, seus acessos e o encerramento da conta." />

      <div className="space-y-5">
        <Card>
          <h2 className="text-lg font-bold">{user.displayName}</h2>
          <p className="text-sm text-ink-muted">{ROLE_LABEL[user.role]}</p>
          <p className="mt-3 text-sm">
            O sistema não guarda o seu CPF, só um código derivado dele. Detalhes no{" "}
            <Link href="/privacidade" className="font-semibold text-brand-strong underline">
              aviso de privacidade
            </Link>
            .
          </p>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Baixar meus dados</h2>
          <p className="mb-3 text-sm text-ink-muted">
            Um arquivo com tudo o que está guardado sobre você: registros de entulho, confirmações, entregas e EcoCoins.
          </p>
          <a
            href="/api/minha-conta/dados"
            download
            className="inline-flex min-h-12 items-center rounded-xl border border-line bg-white px-5 text-base font-bold hover:bg-canvas"
          >
            Baixar arquivo (JSON)
          </a>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Aparelhos conectados</h2>
          <p className="mb-3 text-sm text-ink-muted">
            Sessões abertas com a sua conta. Encerrar todas desconecta também este aparelho.
          </p>
          <ul className="divide-y divide-line">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-semibold">
                    {deviceName(session.userAgent)}
                    {session.current && <span className="ml-2 text-xs font-bold text-brand-strong">este aparelho</span>}
                  </p>
                  <p className="text-xs text-ink-muted">Último acesso: {formatDateTime(session.lastSeenAt)}</p>
                </div>
              </li>
            ))}
          </ul>
          <form action={logoutEverywhere} className="mt-4">
            <button
              type="submit"
              className="min-h-12 rounded-xl border border-line px-5 text-base font-bold hover:bg-canvas"
            >
              Encerrar todas as sessões
            </button>
          </form>
        </Card>

        <Card className="border-danger/30">
          <h2 className="text-lg font-bold text-danger">Encerrar minha conta</h2>
          <p className="mb-1 text-sm">
            Nome, identificador do gov.br e código do CPF são apagados, junto com o saldo de EcoCoins.
          </p>
          <p className="mb-3 text-sm text-ink-muted">
            Os registros de entulho que você fez continuam, sem dono identificado: eles registram um problema em via
            pública e embasam o serviço de coleta. Esta ação não pode ser desfeita.
          </p>
          <ActionForm action={deleteAccountAction}>
            <Field label="Para confirmar, escreva ENCERRAR">
              <input name="confirmacao" autoComplete="off" className={inputClass} />
            </Field>
            <SubmitButton variant="danger" className="mt-3 w-full" pendingText="Encerrando…">
              Encerrar minha conta
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
