import Link from "next/link";
import { logout } from "@/app/actions";
import { HOME_BY_ROLE, getCurrentUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/db";
import type { Role } from "@/lib/domain";

// Rótulo curto sob o nome: no celular, "Operador de ponto" empurrava o botão Sair para outra linha.
const ROLE_SHORT: Record<Role, string> = {
  CIDADAO: "Cidadão",
  OPERADOR: "Operador",
  GESTOR: "Gestão de coleta",
};

// Cada perfil vê só o que usa: o cidadão tem três abas; a gestão e o operador, uma.
const NAV: Record<Role, { href: string; label: string }[]> = {
  CIDADAO: [
    { href: "/reportar", label: "Registrar entulho" },
    { href: "/minhas-ocorrencias", label: "Meus registros" },
    { href: "/carteira", label: "Reciclar" },
  ],
  GESTOR: [{ href: "/gestor", label: "Registros de entulho" }],
  OPERADOR: [{ href: "/operador", label: "Atendimento" }],
};

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-[1000] border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      {DEMO_MODE && (
        <p className="bg-ink px-4 py-1 text-center text-xs font-medium text-white">
          Protótipo acadêmico · dados simulados · login gov.br simulado
        </p>
      )}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href={user ? HOME_BY_ROLE[user.role] : "/"} className="flex items-center gap-2 font-extrabold tracking-tight">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-brand text-sm text-ink">
            EC
          </span>
          EcoCrédito Recife
        </Link>

        {/* No celular a navegação ocupa uma linha só dela, com rolagem lateral sem barra visível;
            a partir de sm ela volta a dividir a linha com o logo e a conta. */}
        {user && (
          <nav
            aria-label="Principal"
            className="order-last flex w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:order-none sm:w-auto sm:flex-1 [&::-webkit-scrollbar]:hidden"
          >
            {NAV[user.role].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold hover:bg-brand-soft"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/minha-conta" className="text-right leading-tight hover:underline">
              <p className="text-sm font-bold">{user.displayName.split(" ")[0]}</p>
              <p className="text-xs text-ink-muted">{ROLE_SHORT[user.role]}</p>
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="min-h-10 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-canvas"
              >
                Sair
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="min-h-10 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink hover:brightness-95">
            Entrar
          </Link>
        )}
      </div>
    </header>
  );
}
