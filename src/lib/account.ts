import crypto from "node:crypto";
import { getDb } from "./db";
import { CONSENT_VERSION } from "./domain";
import { DomainError } from "./repo";
import { revokeAllSessions } from "./session";

/**
 * Registra o aceite do aviso de privacidade. A versão fica gravada: se o texto
 * mudar, a pessoa aceita de novo em vez de herdar um consentimento antigo.
 */
export async function acceptConsent(userId: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE users SET consent_at = now(), consent_version = $2 WHERE id = $1`, [userId, CONSENT_VERSION]);
}

export async function needsConsent(userId: string): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ consent_version: string | null }>(
    `SELECT consent_version FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.consent_version !== CONSENT_VERSION;
}

/** Portabilidade (LGPD, art. 18): tudo que o sistema guarda sobre a pessoa. */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const query = async (sql: string) => (await db.query<Record<string, unknown>>(sql, [userId])).rows;

  const [user] = await query(
    `SELECT id, display_name, role, created_at, consent_at, consent_version FROM users WHERE id = $1`,
  );
  const [reports, confirmations, deliveries, ledger] = await Promise.all([
    query(`SELECT code, status, lat, lng, neighborhood, note, created_at, closed_at, closing_note
           FROM reports WHERE reporter_id = $1 ORDER BY created_at`),
    query(`SELECT r.code, c.created_at FROM report_confirmations c JOIN reports r ON r.id = c.report_id
           WHERE c.user_id = $1 ORDER BY c.created_at`),
    query(`SELECT d.material, d.quantity, d.points, p.name AS point_name, d.created_at
           FROM deliveries d JOIN collection_points p ON p.id = d.point_id
           WHERE d.user_id = $1 ORDER BY d.created_at`),
    query(`SELECT amount, reason, created_at FROM credit_ledger WHERE user_id = $1 ORDER BY created_at`),
  ]);

  return {
    geradoEm: new Date().toISOString(),
    observacao:
      "O CPF não é guardado: o sistema só conserva um código derivado dele, que não permite recuperar o número.",
    usuario: user ?? null,
    registrosDeEntulho: reports,
    confirmacoes: confirmations,
    entregas: deliveries,
    lancamentosEcoCoins: ledger,
  };
}

export interface DeletionSummary {
  reportsKept: number;
  balanceLost: number;
}

/**
 * Encerra a conta a pedido do titular.
 *
 * Os registros de entulho continuam: são o registro de um problema em via
 * pública, usado para planejar a coleta e prestar contas, e a base legal deles é
 * o serviço público, não o consentimento (LGPD, art. 7º, III e art. 16, I). O que
 * some é o vínculo com a pessoa: nome, identificador do gov.br, código do CPF e
 * códigos de EcoCoins. O saldo é encerrado junto.
 */
export async function deleteAccount(userId: string): Promise<DeletionSummary> {
  const db = await getDb();
  const summary = await db.transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM users WHERE id = $1`,
      [userId],
    );
    if (!existing[0]) throw new DomainError("NOT_FOUND", "Conta não encontrada.");
    if (existing[0].deleted_at) throw new DomainError("INVALID_STATE", "Esta conta já foi encerrada.");

    const { rows: counts } = await tx.query<{ reports: number; balance: number }>(
      `SELECT (SELECT count(*) FROM reports WHERE reporter_id = $1)::int AS reports,
              (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger WHERE user_id = $1)::int AS balance`,
      [userId],
    );

    await tx.query(`DELETE FROM qr_tokens WHERE user_id = $1`, [userId]);
    await tx.query(
      `UPDATE users
       SET display_name = 'Conta encerrada', gov_sub = $2, cpf_hash = $3,
           role = 'CIDADAO', point_id = NULL, deleted_at = now()
       WHERE id = $1`,
      [userId, `removido:${crypto.randomUUID()}`, crypto.randomUUID()],
    );
    return { reportsKept: counts[0].reports, balanceLost: counts[0].balance };
  });

  await revokeAllSessions(userId);
  return summary;
}
