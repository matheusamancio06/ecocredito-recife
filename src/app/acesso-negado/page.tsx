import Link from "next/link";
import { PageTitle } from "@/components/ui";
import { HOME_BY_ROLE, getCurrentUser } from "@/lib/auth";

export default async function AccessDeniedPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Acesso restrito" subtitle="O seu perfil não tem permissão para abrir esta página." />
      <Link
        href={user ? HOME_BY_ROLE[user.role] : "/login"}
        className="inline-flex min-h-12 items-center rounded-xl bg-brand px-6 text-base font-bold text-ink"
      >
        {user ? "Voltar para a minha área" : "Entrar"}
      </Link>
    </div>
  );
}
