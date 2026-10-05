import crypto from "node:crypto";
import { getDb } from "./db";

/**
 * Limite de tentativas por chave, gravado no banco (e não na memória do
 * processo) para continuar valendo com mais de uma instância no ar.
 *
 * A limpeza é oportunista: cada registro apaga o que já saiu da janela daquela
 * chave, então a tabela não cresce sem fim e não precisa de rotina agendada.
 */
export async function hitLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = await getDb();
  const since = new Date(Date.now() - windowSeconds * 1000);
  return db.transaction(async (tx) => {
    await tx.query(`DELETE FROM rate_events WHERE bucket = $1 AND created_at < $2`, [bucket, since]);
    const { rows } = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM rate_events WHERE bucket = $1 AND created_at >= $2`,
      [bucket, since],
    );
    if (rows[0].n >= limit) return false;
    await tx.query(`INSERT INTO rate_events (id, bucket) VALUES ($1,$2)`, [crypto.randomUUID(), bucket]);
    return true;
  });
}

/** Apaga o histórico de uma chave (ex.: acertou o código, zera as tentativas). */
export async function clearLimit(bucket: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM rate_events WHERE bucket = $1`, [bucket]);
}
