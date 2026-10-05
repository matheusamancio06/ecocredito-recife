import crypto from "node:crypto";
import type { Database } from "./db";
import { interiorPoint, listNeighborhoods, neighborhoodAt, randomPointIn } from "./bairros";
import { DEFAULT_RATES, MATERIALS, MATERIAL_CATEGORY, pointsFor, type PointCategory, type Status } from "./domain";
import { hashCpf, PERSONAS, SEED_CITIZENS } from "./identity";
import { formatReportCode } from "./repo";
import { insertMany } from "./sql";

// Dados SIMULADOS para demonstração. Nada aqui representa registros reais.

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Locais SIMULADOS onde o entulho volta: posicionados dentro de bairros reais.
const RECURRING_SPOTS = ["Imbiribeira", "Ibura", "Afogados", "Água Fria", "Casa Amarela", "Cordeiro", "Jordão", "Várzea"];

const NOTES = [
  "Entulho despejado na calçada há vários dias.",
  "Ponto que sempre acumula entulho; mau cheiro e mosquitos.",
  "Bloqueando parte da passagem de pedestres.",
  "Em frente ao portão de uma obra.",
  null,
  null,
  null,
];

const CLOSING_NOTES = ["Entulho removido e local varrido.", "Removido em uma viagem de caçamba.", null];

function offsetMeters(center: { lat: number; lng: number }, meters: number, angle: number) {
  return {
    lat: center.lat + (meters * Math.cos(angle)) / 111_320,
    lng: center.lng + (meters * Math.sin(angle)) / (111_320 * Math.cos((center.lat * Math.PI) / 180)),
  };
}

interface Plan {
  id: string;
  reporterId: string;
  lat: number;
  lng: number;
  createdAt: Date;
  status: Status;
  closedAt: Date | null;
  closingNote: string | null;
  recurrenceOf: string | null;
  note: string | null;
}

export async function seedDemoIfEmpty(db: Database): Promise<void> {
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`);
  if (rows[0].n > 0) return;

  const rand = mulberry32(20260921);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const hours = (h: number) => h * 3_600_000;
  const days = (d: number) => d * 86_400_000;
  const now = Date.now();

  await db.transaction(async (tx) => {
    const userIds = new Map<string, string>();
    const insertUser = async (sub: string, cpf: string, name: string, role: string, pointId: string | null = null) => {
      const id = crypto.randomUUID();
      userIds.set(sub, id);
      await tx.query(
        `INSERT INTO users (id, gov_sub, cpf_hash, display_name, role, point_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, sub, hashCpf(cpf), name, role, pointId],
      );
      return id;
    };

    const { rows: staffedPoints } = await tx.query<{ id: string; kind: string; name: string; accepts: string[] }>(
      `SELECT id, kind, name, accepts FROM collection_points WHERE staffed = true ORDER BY id`,
    );
    const personaPoint = new Map<string, string>();
    for (const p of PERSONAS) {
      const point = p.pointKind ? staffedPoints.find((sp) => sp.kind === p.pointKind) : undefined;
      if (point) personaPoint.set(p.sub, point.id);
      await insertUser(p.sub, p.cpf, p.name, p.role, point?.id ?? null);
    }
    for (const c of SEED_CITIZENS) await insertUser(c.sub, c.cpf, c.name, "CIDADAO");

    // Um operador (fictício) para cada ponto com atendente que ainda não tem um,
    // para as entregas simuladas se espalharem por vários pontos reais.
    const operatorByPoint = new Map<string, string>();
    for (const [sub, pointId] of personaPoint) operatorByPoint.set(pointId, userIds.get(sub)!);
    let operatorNumber = 0;
    for (const point of staffedPoints.slice(0, 14)) {
      if (operatorByPoint.has(point.id)) continue;
      operatorNumber += 1;
      const id = await insertUser(
        `sim-op-${point.id}`,
        `000.000.1${String(operatorNumber).padStart(2, "0")}-00`,
        `Operador (${point.name})`,
        "OPERADOR",
        point.id,
      );
      operatorByPoint.set(point.id, id);
    }

    const citizenIds = [
      ...PERSONAS.filter((p) => p.role === "CIDADAO").map((p) => userIds.get(p.sub)!),
      ...SEED_CITIZENS.map((c) => userIds.get(c.sub)!),
    ];
    const gestorId = userIds.get(PERSONAS.find((p) => p.role === "GESTOR")!.sub)!;

    const plans: Plan[] = [];

    // Locais onde o entulho volta: uma baixa e, em seis deles, um novo registro recente a
    // menos de 30 m da limpeza anterior (reincidência). Metade desses novos segue aberta.
    RECURRING_SPOTS.forEach((bairro, index) => {
      const center = interiorPoint(bairro);
      if (!center) return;
      const recurs = index < 6;
      const secondAt = now - days(between(2, 18));
      const firstClosedAt = recurs ? secondAt - days(between(4, 25)) : now - days(between(25, 70));
      const firstAt = firstClosedAt - days(between(2, 8));
      const first: Plan = {
        id: crypto.randomUUID(),
        reporterId: pick(citizenIds),
        lat: center.lat,
        lng: center.lng,
        createdAt: new Date(firstAt),
        status: "BAIXADA",
        closedAt: new Date(firstClosedAt),
        closingNote: pick(CLOSING_NOTES),
        recurrenceOf: null,
        note: pick(NOTES),
      };
      plans.push(first);
      if (!recurs) return;

      const point = offsetMeters(center, between(4, 18), between(0, 2 * Math.PI));
      const stillOpen = index % 2 === 0;
      const secondClosedAt = secondAt + days(between(1, 6));
      const closed = !stillOpen && secondClosedAt <= now;
      plans.push({
        id: crypto.randomUUID(),
        reporterId: pick(citizenIds),
        lat: point.lat,
        lng: point.lng,
        createdAt: new Date(secondAt),
        status: closed ? "BAIXADA" : "ABERTA",
        closedAt: closed ? new Date(secondClosedAt) : null,
        closingNote: closed ? pick(CLOSING_NOTES) : null,
        recurrenceOf: first.id,
        note: pick(NOTES),
      });
    });

    // Registros espalhados pela cidade: antigos (quase todos com baixa; passado um mês,
    // todos), alguns de uma a três semanas que continuam abertos e os de hoje, que
    // acabaram de chegar.
    const allNeighborhoods = listNeighborhoods();
    const scattered = [
      ...Array.from({ length: 24 }, () => ({ ageHours: between(4, 60) * 24, keepOpen: false })),
      ...Array.from({ length: 4 }, (_, i) => ({ ageHours: between(9, 20) * 24, keepOpen: i < 2 })),
      ...Array.from({ length: 8 }, () => ({ ageHours: between(0.3, 90), keepOpen: true })),
    ];
    for (const { ageHours, keepOpen } of scattered) {
      const point = randomPointIn(pick(allNeighborhoods).name, rand);
      if (!point) continue;
      const createdAt = now - hours(ageHours);
      const closedAt = createdAt + hours(between(24, 9 * 24));
      const roll = rand();
      let status: Status = "ABERTA";
      if (!keepOpen && closedAt <= now) {
        const stale = ageHours > 25 * 24;
        if (roll < 0.86 || (stale && roll >= 0.93)) status = "BAIXADA";
        else if (roll < 0.93) status = "IMPROCEDENTE";
      }
      plans.push({
        id: crypto.randomUUID(),
        reporterId: pick(citizenIds),
        lat: point.lat,
        lng: point.lng,
        createdAt: new Date(createdAt),
        status,
        closedAt: status === "ABERTA" ? null : new Date(closedAt),
        closingNote:
          status === "BAIXADA"
            ? pick(CLOSING_NOTES)
            : status === "IMPROCEDENTE"
              ? "Não havia entulho no local na vistoria."
              : null,
        recurrenceOf: null,
        note: pick(NOTES),
      });
    }

    // Do mais antigo para o mais novo: o código sequencial e a referência à
    // reincidência (que aponta para um registro anterior) ficam coerentes.
    plans.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const confirmations: unknown[][] = [];
    const { rows: sequence } = await tx.query<{ n: number }>(
      `SELECT nextval('report_seq')::int AS n FROM generate_series(1, $1::int)`,
      [plans.length],
    );

    const reportRows = plans.map((plan, index) => {
      const area = neighborhoodAt(plan);

      const confirmationRoll = rand();
      const confirmationCount = confirmationRoll < 0.5 ? 0 : confirmationRoll < 0.75 ? 1 : confirmationRoll < 0.9 ? 2 : 3;
      const windowEnd = Math.min(plan.closedAt?.getTime() ?? now, plan.createdAt.getTime() + hours(96), now);
      const others = citizenIds.filter((id) => id !== plan.reporterId).sort(() => rand() - 0.5);
      for (const userId of others.slice(0, confirmationCount)) {
        const at = new Date(between(plan.createdAt.getTime(), Math.max(plan.createdAt.getTime() + 1, windowEnd)));
        confirmations.push([plan.id, userId, at]);
      }

      return [
        plan.id,
        formatReportCode(sequence[index].n, plan.createdAt),
        plan.reporterId,
        plan.status,
        plan.lat,
        plan.lng,
        area?.name ?? null,
        plan.note,
        "demo-ANTES",
        plan.status === "BAIXADA" && rand() < 0.6 ? "demo-DEPOIS" : null,
        plan.recurrenceOf,
        plan.createdAt,
        plan.closedAt,
        plan.closedAt ? gestorId : null,
        plan.closingNote,
      ];
    });

    await insertMany(
      tx,
      "reports",
      [
        "id", "code", "reporter_id", "status", "lat", "lng", "neighborhood", "note", "photo_before", "photo_after",
        "recurrence_of", "created_at", "closed_at", "closed_by", "closing_note",
      ],
      reportRows,
      50,
    );
    await insertMany(tx, "report_confirmations", ["report_id", "user_id", "created_at"], confirmations);

    // Entregas de recicláveis simuladas, espalhadas por pontos com atendente.
    const quantityRange: Record<string, [number, number]> = {
      OLEO_COZINHA: [0.5, 4],
      ELETRONICO: [0.5, 6],
      ALUMINIO: [0.3, 4],
      PLASTICO_PET: [0.5, 8],
      VIDRO: [1, 12],
      PAPELAO: [1, 15],
    };
    const favoriteCitizens = citizenIds.slice(0, 2);
    const operatedPoints = staffedPoints.filter((p) => operatorByPoint.has(p.id));
    const deliveryRows: unknown[][] = [];
    const ledgerRows: unknown[][] = [];
    for (let i = 0; i < 90; i++) {
      const point = pick(operatedPoints);
      const usable = MATERIALS.filter((m) => point.accepts.includes(MATERIAL_CATEGORY[m] as PointCategory));
      if (usable.length === 0) continue;
      const material = pick(usable);
      const [low, high] = quantityRange[material];
      const quantity = Math.round(between(low, high) * 10) / 10 || low;
      const points = pointsFor(quantity, DEFAULT_RATES[material].pointsPerUnit);
      const userId = rand() < 0.25 ? pick(favoriteCitizens) : pick(citizenIds);
      const at = new Date(now - hours(between(2, 60 * 24)));
      const deliveryId = crypto.randomUUID();
      deliveryRows.push([deliveryId, userId, point.id, operatorByPoint.get(point.id)!, material, quantity, points, at]);
      ledgerRows.push([crypto.randomUUID(), userId, points, "ENTREGA", deliveryId, at]);
    }
    await insertMany(
      tx,
      "deliveries",
      ["id", "user_id", "point_id", "operator_id", "material", "quantity", "points", "created_at"],
      deliveryRows,
    );
    await insertMany(tx, "credit_ledger", ["id", "user_id", "amount", "reason", "delivery_id", "created_at"], ledgerRows);
  });
}
