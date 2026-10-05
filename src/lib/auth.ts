import { cache } from "react";
import { redirect } from "next/navigation";
import { needsConsent } from "./account";
import type { Role } from "./domain";
import { findUserById, type User } from "./repo";
import { readSessionUserId } from "./session";

export const HOME_BY_ROLE: Record<Role, string> = {
  CIDADAO: "/minhas-ocorrencias",
  GESTOR: "/gestor",
  OPERADOR: "/operador",
};

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const id = await readSessionUserId();
  return id ? findUserById(id) : null;
});

export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length > 0 && !roles.includes(user.role)) redirect("/acesso-negado");
  return user;
}

/**
 * Telas em que o cidadão envia dados pessoais (foto, localização) exigem o
 * aceite do aviso de privacidade na versão vigente.
 */
export async function requireCitizenWithConsent(destination = "/reportar"): Promise<User> {
  const user = await requireUser("CIDADAO");
  if (await needsConsent(user.id)) redirect(`/consentimento?destino=${encodeURIComponent(destination)}`);
  return user;
}
