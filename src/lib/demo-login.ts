import { HOME_BY_ROLE } from "./auth";
import { DEMO_MODE } from "./db";
import { getPersona } from "./identity";
import { findPointByKind } from "./points";
import { upsertUserFromIdentity } from "./repo";
import { createSession } from "./session";

/**
 * Login do modo demonstração: entra como um personagem fictício, no lugar do
 * gov.br. Existe porque a credencial do Login Único só é concedida a um órgão
 * público — sem ela, não haveria como mostrar o sistema funcionando.
 *
 * Só roda com DEMO_MODE ligado (desligado por padrão em produção); caso
 * contrário, qualquer pessoa entraria como gestão de coleta.
 */
export async function loginAsDemoPersona(personaId: string, userAgent: string | null): Promise<string | null> {
  if (!DEMO_MODE) throw new Error("Login simulado desativado.");
  const persona = getPersona(personaId);
  if (!persona) return null;

  const point = persona.pointKind ? await findPointByKind(persona.pointKind) : null;
  const user = await upsertUserFromIdentity(
    persona,
    { role: persona.role, pointId: point?.id ?? null },
    { syncAssignment: true },
  );
  await createSession(user.id, userAgent);
  return HOME_BY_ROLE[user.role];
}
