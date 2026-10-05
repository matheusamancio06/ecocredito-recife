import crypto from "node:crypto";
import { getDb, type Queryable } from "./db";
import { RECURRENCE_WINDOW_DAYS, SAME_SPOT_METERS, type Role, type Status } from "./domain";
import { haversineMeters, type LatLng } from "./geo";
import { hashCpf, type GovIdentity, type RoleAssignment } from "./identity";
import { neighborhoodAt } from "./bairros";

export type DomainErrorCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID_STATE" | "INVALID";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface User {
  id: string;
  govSub: string;
  displayName: string;
  role: Role;
  pointId: string | null;
}

export type Actor = Pick<User, "id" | "role" | "pointId">;

export interface Report {
  id: string;
  code: string;
  reporterId: string;
  status: Status;
  lat: number;
  lng: number;
  neighborhood: string | null;
  /** Ponto de referência ou observação escrita por quem registrou. */
  note: string | null;
  photoBefore: string;
  photoAfter: string | null;
  recurrenceOf: string | null;
  createdAt: Date;
  closedAt: Date | null;
  closingNote: string | null;
  confirmations: number;
}

interface ReportRow {
  id: string;
  code: string;
  reporter_id: string;
  status: Status;
  lat: number;
  lng: number;
  neighborhood: string | null;
  note: string | null;
  photo_before: string;
  photo_after: string | null;
  recurrence_of: string | null;
  created_at: Date;
  closed_at: Date | null;
  closing_note: string | null;
  confirmations: number;
}

const REPORT_SELECT = `r.*, (SELECT count(*)::int FROM report_confirmations c WHERE c.report_id = r.id) AS confirmations`;

function mapReport(row: ReportRow): Report {
  return {
    id: row.id,
    code: row.code,
    reporterId: row.reporter_id,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    neighborhood: row.neighborhood,
    note: row.note,
    photoBefore: row.photo_before,
    photoAfter: row.photo_after,
    recurrenceOf: row.recurrence_of,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    closingNote: row.closing_note,
    confirmations: row.confirmations,
  };
}

interface UserRow {
  id: string;
  gov_sub: string;
  display_name: string;
  role: Role;
  point_id: string | null;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    govSub: row.gov_sub,
    displayName: row.display_name,
    role: row.role,
    pointId: row.point_id,
  };
}

export function formatReportCode(sequence: number, at: Date): string {
  return `OC-${at.getUTCFullYear()}-${String(sequence).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

/**
 * Cria ou atualiza o usuário a partir de uma identidade verificada. Por padrão
 * um usuário que já existe mantém seu perfil (quem muda perfil é a Prefeitura);
 * `syncAssignment` sobrescreve o perfil e só deve ser usado nos personagens
 * do modo demonstração.
 */
export async function upsertUserFromIdentity(
  identity: GovIdentity,
  assignment: RoleAssignment,
  options: { syncAssignment?: boolean } = {},
): Promise<User> {
  const db = await getDb();
  const onConflict = options.syncAssignment
    ? `display_name = EXCLUDED.display_name, role = EXCLUDED.role, point_id = EXCLUDED.point_id`
    : `display_name = EXCLUDED.display_name`;
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (id, gov_sub, cpf_hash, display_name, role, point_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (gov_sub) DO UPDATE SET ${onConflict}
     RETURNING id, gov_sub, display_name, role, point_id`,
    [crypto.randomUUID(), identity.sub, hashCpf(identity.cpf), identity.name, assignment.role, assignment.pointId ?? null],
  );
  return mapUser(rows[0]);
}

export async function findUserById(id: string): Promise<User | null> {
  const db = await getDb();
  // Conta encerrada pelo titular não volta a ter acesso: o registro fica só
  // como vínculo histórico anônimo dos registros de entulho.
  const { rows } = await db.query<UserRow>(
    `SELECT id, gov_sub, display_name, role, point_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Registro de entulho
// ---------------------------------------------------------------------------

export interface NewReport {
  reporterId: string;
  lat: number;
  lng: number;
  note: string | null;
  photoBefore: string;
  createdAt?: Date;
}

export type CreateReportResult =
  | { kind: "created"; report: Report }
  | { kind: "confirmed"; report: Report; alreadyConfirmed: boolean };

const BOX_DEGREES = 0.0006;

function boxAround(point: LatLng): number[] {
  return [point.lat - BOX_DEGREES, point.lat + BOX_DEGREES, point.lng - BOX_DEGREES, point.lng + BOX_DEGREES];
}

function nearest<T extends { lat: number; lng: number }>(
  rows: T[],
  point: { lat: number; lng: number },
  maxMeters: number,
): T | null {
  let best: T | null = null;
  let bestDistance = maxMeters;
  for (const row of rows) {
    const d = haversineMeters(row, point);
    if (d <= bestDistance) {
      best = row;
      bestDistance = d;
    }
  }
  return best;
}

async function findOpenDuplicate(q: Queryable, point: LatLng): Promise<ReportRow | null> {
  const { rows } = await q.query<ReportRow>(
    `SELECT ${REPORT_SELECT} FROM reports r
     WHERE r.status = 'ABERTA'
       AND r.lat BETWEEN $1 AND $2 AND r.lng BETWEEN $3 AND $4`,
    boxAround(point),
  );
  return nearest(rows, point, SAME_SPOT_METERS);
}

/** Soma a confirmação de quem registrou o mesmo ponto. O autor não confirma o próprio registro. */
async function confirmExisting(tx: Queryable, duplicate: ReportRow, reporterId: string): Promise<CreateReportResult> {
  if (duplicate.reporter_id === reporterId) {
    return { kind: "confirmed", report: mapReport(duplicate), alreadyConfirmed: true };
  }
  const { rows: inserted } = await tx.query(
    `INSERT INTO report_confirmations (report_id, user_id) VALUES ($1,$2)
     ON CONFLICT DO NOTHING RETURNING report_id`,
    [duplicate.id, reporterId],
  );
  return {
    kind: "confirmed",
    report: mapReport({ ...duplicate, confirmations: duplicate.confirmations + inserted.length }),
    alreadyConfirmed: inserted.length === 0,
  };
}

/**
 * Se já existe registro aberto no ponto, confirma e devolve o resultado; senão
 * devolve null e não grava nada. Serve para decidir ANTES de guardar a foto.
 */
export async function confirmIfDuplicate(reporterId: string, point: LatLng): Promise<CreateReportResult | null> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const duplicate = await findOpenDuplicate(tx, point);
    return duplicate ? confirmExisting(tx, duplicate, reporterId) : null;
  });
}

/**
 * Registra o entulho. Se já existe registro ABERTO no mesmo ponto (até 30 m), a
 * pessoa apenas o confirma, em vez de duplicar. Se o ponto teve baixa há pouco
 * tempo, o novo registro é marcado como reincidência.
 */
export async function createReport(input: NewReport): Promise<CreateReportResult> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const duplicate = await findOpenDuplicate(tx, input);
    if (duplicate) return confirmExisting(tx, duplicate, input.reporterId);

    const since = new Date(Date.now() - RECURRENCE_WINDOW_DAYS * 86_400_000);
    const { rows: closedRows } = await tx.query<ReportRow>(
      `SELECT ${REPORT_SELECT} FROM reports r
       WHERE r.status = 'BAIXADA' AND r.closed_at >= $5
         AND r.lat BETWEEN $1 AND $2 AND r.lng BETWEEN $3 AND $4`,
      [...boxAround(input), since],
    );
    const previous = nearest(closedRows, input, SAME_SPOT_METERS);

    const {
      rows: [{ n }],
    } = await tx.query<{ n: number }>(`SELECT nextval('report_seq')::int AS n`);
    const now = input.createdAt ?? new Date();
    const area = neighborhoodAt(input);
    const { rows } = await tx.query<ReportRow>(
      `INSERT INTO reports (id, code, reporter_id, lat, lng, neighborhood, note, photo_before, recurrence_of, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *, 0 AS confirmations`,
      [
        crypto.randomUUID(),
        formatReportCode(n, now),
        input.reporterId,
        input.lat,
        input.lng,
        area?.name ?? null,
        input.note,
        input.photoBefore,
        previous?.id ?? null,
        now,
      ],
    );
    return { kind: "created", report: mapReport(rows[0]) } as const;
  });
}

export async function getReport(id: string): Promise<Report | null> {
  const db = await getDb();
  const { rows } = await db.query<ReportRow>(`SELECT ${REPORT_SELECT} FROM reports r WHERE r.id = $1`, [id]);
  return rows[0] ? mapReport(rows[0]) : null;
}

/**
 * Autorização de uma foto numa única consulta. Cada foto exibida numa lista é
 * uma requisição, então valia a pena resolver dono e confirmação juntos. A foto
 * pode mostrar pessoas ou placas: só a gestão, quem registrou e quem confirmou veem.
 */
export async function canViewPhoto(actor: Actor, name: string): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ reporter_id: string; confirmed: boolean }>(
    `SELECT r.reporter_id,
            EXISTS (SELECT 1 FROM report_confirmations c WHERE c.report_id = r.id AND c.user_id = $2) AS confirmed
     FROM reports r WHERE r.photo_before = $1 OR r.photo_after = $1 LIMIT 1`,
    [name, actor.id],
  );
  if (!rows[0]) return false;
  return actor.role === "GESTOR" || rows[0].reporter_id === actor.id || rows[0].confirmed;
}

/** Quem pode ver o registro (e suas fotos). */
export async function canViewReport(actor: Actor, report: Report): Promise<boolean> {
  if (actor.role === "GESTOR" || report.reporterId === actor.id) return true;
  const db = await getDb();
  const { rows } = await db.query(`SELECT 1 FROM report_confirmations WHERE report_id = $1 AND user_id = $2`, [
    report.id,
    actor.id,
  ]);
  return rows.length > 0;
}

export async function listReportsByReporter(userId: string): Promise<Report[]> {
  const db = await getDb();
  const { rows } = await db.query<ReportRow>(
    `SELECT ${REPORT_SELECT} FROM reports r
     WHERE r.reporter_id = $1
        OR EXISTS (SELECT 1 FROM report_confirmations c WHERE c.report_id = r.id AND c.user_id = $1)
     ORDER BY r.created_at DESC LIMIT 100`,
    [userId],
  );
  return rows.map(mapReport);
}

// Quantos registros a gestão vê por vez. O total real aparece no resumo.
const LIST_LIMIT = 200;

/** Fila da gestão de coleta: os mais antigos primeiro. */
export async function listOpenReports(): Promise<Report[]> {
  const db = await getDb();
  const { rows } = await db.query<ReportRow>(
    `SELECT ${REPORT_SELECT} FROM reports r WHERE r.status = 'ABERTA' ORDER BY r.created_at ASC LIMIT ${LIST_LIMIT}`,
  );
  return rows.map(mapReport);
}

/** Registros que já tiveram baixa, os mais recentes primeiro. */
export async function listClosedReports(): Promise<Report[]> {
  const db = await getDb();
  const { rows } = await db.query<ReportRow>(
    `SELECT ${REPORT_SELECT} FROM reports r WHERE r.status <> 'ABERTA' ORDER BY r.closed_at DESC NULLS LAST LIMIT ${LIST_LIMIT}`,
  );
  return rows.map(mapReport);
}

// ---------------------------------------------------------------------------
// Baixa
// ---------------------------------------------------------------------------

export interface CloseInput {
  /** BAIXADA: o entulho foi removido. IMPROCEDENTE: o registro não procede. */
  outcome: Exclude<Status, "ABERTA">;
  note: string | null;
  /** Foto do local depois da limpeza (opcional). */
  photoAfter: string | null;
}

/** A gestão de coleta dá baixa no registro. Um registro só tem baixa uma vez. */
export async function closeReport(actor: Actor, id: string, input: CloseInput): Promise<void> {
  if (actor.role !== "GESTOR") throw new DomainError("FORBIDDEN", "Apenas a gestão de coleta pode dar baixa.");
  if (input.outcome !== "BAIXADA" && input.outcome !== "IMPROCEDENTE") {
    throw new DomainError("INVALID", "Escolha o resultado da baixa.");
  }
  const note = input.note?.trim() || null;
  if (input.outcome === "IMPROCEDENTE" && (note?.length ?? 0) < 3) {
    throw new DomainError("INVALID", "Informe o motivo (mínimo de 3 caracteres).");
  }

  const db = await getDb();
  const { rows } = await db.query(
    `UPDATE reports
     SET status = $2, closed_at = now(), closed_by = $3, closing_note = $4, photo_after = $5
     WHERE id = $1 AND status = 'ABERTA' RETURNING id`,
    [id, input.outcome, actor.id, note, input.photoAfter],
  );
  if (rows.length > 0) return;

  const { rows: exists } = await db.query(`SELECT 1 FROM reports WHERE id = $1`, [id]);
  throw exists.length > 0
    ? new DomainError("INVALID_STATE", "Este registro já teve baixa. Atualize a página.")
    : new DomainError("NOT_FOUND", "Registro não encontrado.");
}

// ---------------------------------------------------------------------------
// Resumo da gestão de coleta
// ---------------------------------------------------------------------------

export interface CollectionSummary {
  windowDays: number;
  openCount: number;
  /** Baixas com entulho removido dentro da janela. */
  removedCount: number;
  oldestOpenAt: Date | null;
  /** Dias corridos desde o registro aberto mais antigo. */
  oldestOpenDays: number | null;
}

export async function getCollectionSummary(days = 30): Promise<CollectionSummary> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const { rows } = await db.query<{ open_count: number; removed_count: number; oldest: Date | null }>(
    `SELECT count(*) FILTER (WHERE status = 'ABERTA')::int AS open_count,
            count(*) FILTER (WHERE status = 'BAIXADA' AND closed_at >= $1)::int AS removed_count,
            MIN(created_at) FILTER (WHERE status = 'ABERTA') AS oldest
     FROM reports`,
    [since],
  );
  const oldest = rows[0].oldest;
  return {
    windowDays: days,
    openCount: rows[0].open_count,
    removedCount: rows[0].removed_count,
    oldestOpenAt: oldest,
    oldestOpenDays: oldest ? Math.floor((Date.now() - oldest.getTime()) / 86_400_000) : null,
  };
}

/** Registros criados + confirmações feitas pela pessoa desde `since` (limite de uso). */
export async function countRecentActivity(userId: string, since: Date): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(
    `SELECT ((SELECT count(*) FROM reports WHERE reporter_id = $1 AND created_at >= $2)
            + (SELECT count(*) FROM report_confirmations WHERE user_id = $1 AND created_at >= $2))::int AS n`,
    [userId, since],
  );
  return rows[0].n;
}
