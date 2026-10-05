import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginAsPersona } from "@/app/actions";
import { PageTitle } from "@/components/ui";
import { HOME_BY_ROLE, getCurrentUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/domain";
import { isGovBrConfigured } from "@/lib/govbr";
import { PERSONAS } from "@/lib/identity";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage(props: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(HOME_BY_ROLE[user.role]);

  const params = await props.searchParams;
  const failed = params.erro === "govbr";
  const govbr = isGovBrConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Entrar com gov.br"
        subtitle={
          govbr
            ? "Use sua conta gov.br. O sistema recebe apenas seu nome e CPF verificados e não guarda senha."
            : DEMO_MODE
              ? "Modo demonstração: escolha um personagem fictício para simular o retorno do login gov.br."
              : "A integração com o Login Único gov.br ainda não foi configurada neste ambiente."
        }
      />

      {failed && (
        <p role="alert" className="mb-4 rounded-2xl bg-danger-bg p-4 font-semibold text-danger">
          Não foi possível concluir o login com o gov.br. Tente de novo; se persistir, sua conta pode não ter o nível de
          segurança exigido (prata ou ouro).
        </p>
      )}

      {govbr && (
        <a
          href="/api/auth/govbr/login"
          className="mb-6 inline-flex min-h-14 items-center rounded-xl bg-ink px-8 text-lg font-bold text-white hover:opacity-90"
        >
          Entrar com gov.br
        </a>
      )}

      {DEMO_MODE && (
        <>
          <div className="mb-6 rounded-2xl border border-line bg-white p-4 text-sm text-ink-muted">
            No ambiente real, o cidadão é redirecionado ao gov.br e volta com CPF e nome já verificados; o sistema não
            guarda senha e só armazena um hash do CPF. Quem pode acessar como gestão de coleta ou operador de ponto é
            definido pela Prefeitura. A credencial de integração precisa ser solicitada por um órgão público.
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {PERSONAS.map((persona) => (
              <li key={persona.id}>
                <form action={loginAsPersona} className="h-full">
                  <input type="hidden" name="persona" value={persona.id} />
                  <button
                    type="submit"
                    className="flex h-full min-h-24 w-full flex-col items-start justify-center gap-1 rounded-2xl border border-line bg-white p-4 text-left hover:border-brand-strong hover:bg-brand-soft"
                  >
                    <span className="text-xs font-bold uppercase tracking-wide text-brand-strong">
                      {ROLE_LABEL[persona.role]}
                    </span>
                    <span className="text-lg font-bold">{persona.name}</span>
                    <span className="text-sm text-ink-muted">{persona.blurb}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
