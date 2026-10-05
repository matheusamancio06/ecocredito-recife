import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

const COOKIE_NAME = "eco_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

export function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET não definido. Defina um segredo forte antes de subir em produção.");
  }
  return "dev-only-secret-troque-em-producao";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * O cookie leva o identificador da sessão (não o do usuário) e uma assinatura.
 * A assinatura descarta cookie forjado sem tocar no banco; o registro em
 * `sessions` é o que permite encerrar o acesso antes de o prazo vencer.
 */
export function encodeSession(sessionId: string, now = Date.now()): string {
  const payload = `${sessionId}.${Math.floor(now / 1000) + MAX_AGE_SECONDS}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);

  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  const expDot = payload.lastIndexOf(".");
  if (expDot < 0) return null;
  const expiresAt = Number(payload.slice(expDot + 1));
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < now) return null;
  return payload.slice(0, expDot);
}

export async function createSession(userId: string, userAgent: string | null = null): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO sessions (id, user_id, user_agent, expires_at) VALUES ($1,$2,$3,$4)`, [
    id,
    userId,
    userAgent ? userAgent.slice(0, 200) : null,
    new Date(Date.now() + MAX_AGE_SECONDS * 1000),
  ]);
  const store = await cookies();
  store.set(COOKIE_NAME, encodeSession(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const id = decodeSession(store.get(COOKIE_NAME)?.value);
  if (id) {
    const db = await getDb();
    await db.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
  }
  store.delete(COOKIE_NAME);
}

/** Encerra todas as sessões da pessoa (trocou de perfil, perdeu o aparelho). */
export async function revokeAllSessions(userId: string): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string }>(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
    [userId],
  );
  return rows.length;
}

/**
 * Confere a sessão no banco: existe, não foi revogada e não venceu. É o que
 * permite encerrar um acesso na hora, sem esperar o cookie expirar.
 */
export async function resolveSession(sessionId: string): Promise<string | null> {
  const db = await getDb();
  const { rows } = await db.query<{ user_id: string }>(
    `UPDATE sessions SET last_seen_at = now()
     WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [sessionId],
  );
  return rows[0]?.user_id ?? null;
}

/** Devolve o dono da sessão, conferindo assinatura, prazo e revogação. */
export async function readSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const id = decodeSession(store.get(COOKIE_NAME)?.value);
  return id ? resolveSession(id) : null;
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  current: boolean;
}

export async function listSessions(userId: string): Promise<SessionInfo[]> {
  const store = await cookies();
  const currentId = decodeSession(store.get(COOKIE_NAME)?.value);
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    user_agent: string | null;
    created_at: Date;
    last_seen_at: Date;
  }>(
    `SELECT id, user_agent, created_at, last_seen_at FROM sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY last_seen_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.user_agent,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    current: r.id === currentId,
  }));
}
