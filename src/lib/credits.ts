import crypto from "node:crypto";
import { getDb } from "./db";
import {
  MATERIAL_CATEGORY,
  MAX_DELIVERY_QUANTITY,
  MAX_POINTS_PER_DAY,
  CLAIM_WINDOW_SECONDS,
  QR_TTL_SECONDS,
  isMaterial,
  pointsFor,
  type Material,
  type MaterialUnit,
} from "./domain";
import { DomainError, type Actor } from "./repo";

// Alfabeto sem I, L, O e U (Crockford): evita confundir letras com números
// quando o operador digita o código.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 10;

export function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Aceita minúsculas, espaços, hífens e as confusões clássicas (O/0, I/L/1). */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function formatCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

/** Emite um código novo e invalida os anteriores ainda não usados da mesma pessoa. */
export async function issueQrCode(userId: string): Promise<IssuedCode> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query(`DELETE FROM qr_tokens WHERE user_id = $1 AND used_at IS NULL`, [userId]);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);
    await tx.query(`INSERT INTO qr_tokens (code, user_id, expires_at) VALUES ($1,$2,$3)`, [code, userId, expiresAt]);
    return { code, expiresAt };
  });
}

export interface CitizenPreview {
  userId: string;
  displayName: string;
  expiresAt: Date;
}

/**
 * Passo de identificação do operador: confere o código sem consumi-lo e
 * estende a validade para dar tempo de pesar. Continua de uso único.
 */
export async function claimQrCode(rawCode: string): Promise<CitizenPreview | null> {
  const db = await getDb();
  const { rows } = await db.query<{ user_id: string; display_name: string; expires_at: Date }>(
    `UPDATE qr_tokens t
     SET expires_at = GREATEST(t.expires_at, now() + make_interval(secs => $2::double precision))
     FROM users u
     WHERE u.id = t.user_id AND t.code = $1 AND t.used_at IS NULL AND t.expires_at > now()
     RETURNING t.user_id, u.display_name, t.expires_at`,
    [normalizeCode(rawCode), CLAIM_WINDOW_SECONDS],
  );
  return rows[0] ? { userId: rows[0].user_id, displayName: rows[0].display_name, expiresAt: rows[0].expires_at } : null;
}

export interface RegisterDeliveryInput {
  code: string;
  material: string;
  quantity: number;
}

export interface DeliveryReceipt {
  deliveryId: string;
  citizenName: string;
  material: Material;
  quantity: number;
  unit: MaterialUnit;
  points: number;
  balance: number;
}

/**
 * Registra a entrega pesada por um operador: consome o código (uso único),
 * grava a entrega e credita os EcoCoins no livro-razão, tudo numa transação.
 */
export async function registerDelivery(operator: Actor, input: RegisterDeliveryInput): Promise<DeliveryReceipt> {
  if (operator.role !== "OPERADOR" || !operator.pointId) {
    throw new DomainError("FORBIDDEN", "Apenas operadores de um ponto de recebimento podem registrar entregas.");
  }
  if (!isMaterial(input.material)) throw new DomainError("INVALID", "Escolha o material.");
  const material = input.material;
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > MAX_DELIVERY_QUANTITY) {
    throw new DomainError("INVALID", `Informe uma quantidade entre 0 e ${MAX_DELIVERY_QUANTITY}.`);
  }
  const quantity = Math.round(input.quantity * 1000) / 1000;
  const code = normalizeCode(input.code);

  const db = await getDb();
  return db.transaction(async (tx) => {
    const { rows: pointRows } = await tx.query<{ name: string; accepts: string[]; staffed: boolean }>(
      `SELECT name, accepts, staffed FROM collection_points WHERE id = $1`,
      [operator.pointId],
    );
    const point = pointRows[0];
    if (!point || !point.staffed) throw new DomainError("FORBIDDEN", "Seu ponto não está habilitado a pesar entregas.");
    if (!point.accepts.includes(MATERIAL_CATEGORY[material])) {
      throw new DomainError("INVALID", `${point.name} não recebe este material.`);
    }

    const { rows: rateRows } = await tx.query<{ unit: MaterialUnit; points_per_unit: number }>(
      `SELECT unit, points_per_unit FROM material_rates WHERE material = $1`,
      [material],
    );
    if (!rateRows[0]) throw new DomainError("INVALID", "Material sem tabela de EcoCoins.");
    const points = pointsFor(quantity, rateRows[0].points_per_unit);

    // Uso único e atômico: se duas telas tentarem usar o mesmo código, só uma passa.
    const { rows: consumed } = await tx.query<{ user_id: string }>(
      `UPDATE qr_tokens SET used_at = now()
       WHERE code = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [code],
    );
    if (!consumed[0]) throw new DomainError("INVALID_STATE", "Código inválido, expirado ou já utilizado.");
    const userId = consumed[0].user_id;

    const { rows: todayRows } = await tx.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::int AS total FROM credit_ledger
       WHERE user_id = $1 AND reason = 'ENTREGA' AND created_at >= now() - interval '24 hours'`,
      [userId],
    );
    if (todayRows[0].total + points > MAX_POINTS_PER_DAY) {
      throw new DomainError("INVALID", "Esta pessoa atingiu o limite diário de EcoCoins.");
    }

    const deliveryId = crypto.randomUUID();
    await tx.query(
      `INSERT INTO deliveries (id, user_id, point_id, operator_id, material, quantity, points, qr_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [deliveryId, userId, operator.pointId, operator.id, material, quantity, points, code],
    );
    await tx.query(
      `INSERT INTO credit_ledger (id, user_id, amount, reason, delivery_id) VALUES ($1,$2,$3,'ENTREGA',$4)`,
      [crypto.randomUUID(), userId, points, deliveryId],
    );

    const { rows: nameRows } = await tx.query<{ display_name: string }>(
      `SELECT display_name FROM users WHERE id = $1`,
      [userId],
    );
    const { rows: balanceRows } = await tx.query<{ balance: number }>(
      `SELECT COALESCE(SUM(amount), 0)::int AS balance FROM credit_ledger WHERE user_id = $1`,
      [userId],
    );

    return {
      deliveryId,
      citizenName: nameRows[0].display_name,
      material,
      quantity,
      unit: rateRows[0].unit,
      points,
      balance: balanceRows[0].balance,
    };
  });
}

export async function getBalance(userId: string): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ balance: number }>(
    `SELECT COALESCE(SUM(amount), 0)::int AS balance FROM credit_ledger WHERE user_id = $1`,
    [userId],
  );
  return rows[0].balance;
}

export interface DeliveryHistoryItem {
  id: string;
  material: Material;
  label: string;
  quantity: number;
  unit: MaterialUnit;
  points: number;
  pointName: string;
  createdAt: Date;
}

export async function listDeliveries(userId: string, limit = 20): Promise<DeliveryHistoryItem[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    material: Material;
    label: string;
    quantity: number;
    unit: MaterialUnit;
    points: number;
    point_name: string;
    created_at: Date;
  }>(
    // Nos dados abertos, vários pontos se chamam só "Ecoestação" ou "Cooperativa": o
    // bairro identifica qual foi, a menos que o próprio nome já o traga.
    `SELECT d.id, d.material, r.label, d.quantity, r.unit, d.points, d.created_at,
            p.name || CASE WHEN p.neighborhood IS NOT NULL AND p.name NOT ILIKE '%' || p.neighborhood || '%'
                           THEN ' (' || p.neighborhood || ')' ELSE '' END AS point_name
     FROM deliveries d
     JOIN material_rates r ON r.material = d.material
     JOIN collection_points p ON p.id = d.point_id
     WHERE d.user_id = $1 ORDER BY d.created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    material: r.material,
    label: r.label,
    quantity: r.quantity,
    unit: r.unit,
    points: r.points,
    pointName: r.point_name,
    createdAt: r.created_at,
  }));
}

export interface RecyclingSummary {
  windowDays: number;
  deliveries: number;
  participants: number;
  totalKg: number;
  totalLiters: number;
  pointsIssued: number;
}

/** Números de reciclagem da janela: só entregas pesadas e conferidas por um operador. */
export async function getRecyclingSummary(days = 30): Promise<RecyclingSummary> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const { rows } = await db.query<{
    deliveries: number;
    participants: number;
    kg: number;
    liters: number;
    points: number;
  }>(
    `SELECT count(*)::int AS deliveries,
            count(DISTINCT d.user_id)::int AS participants,
            COALESCE(SUM(d.quantity) FILTER (WHERE r.unit = 'KG'), 0)::float8 AS kg,
            COALESCE(SUM(d.quantity) FILTER (WHERE r.unit = 'L'), 0)::float8 AS liters,
            COALESCE(SUM(d.points), 0)::int AS points
     FROM deliveries d JOIN material_rates r ON r.material = d.material
     WHERE d.created_at >= $1`,
    [since],
  );
  return {
    windowDays: days,
    deliveries: rows[0].deliveries,
    participants: rows[0].participants,
    totalKg: rows[0].kg,
    totalLiters: rows[0].liters,
    pointsIssued: rows[0].points,
  };
}

export interface MaterialRate {
  material: Material;
  label: string;
  unit: MaterialUnit;
  pointsPerUnit: number;
}

export async function listRates(): Promise<MaterialRate[]> {
  const db = await getDb();
  const { rows } = await db.query<{ material: Material; label: string; unit: MaterialUnit; points_per_unit: number }>(
    `SELECT material, label, unit, points_per_unit FROM material_rates ORDER BY points_per_unit DESC`,
  );
  return rows.map((r) => ({ material: r.material, label: r.label, unit: r.unit, pointsPerUnit: r.points_per_unit }));
}
