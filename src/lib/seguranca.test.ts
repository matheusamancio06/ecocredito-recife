// Sessões revogáveis, limite de tentativas e quem pode ver cada foto.
import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, setDbForTests } from "./db";
import { freshDb } from "./test-db";
import { closeReport, createReport, canViewPhoto, upsertUserFromIdentity, type User } from "./repo";
import { resolveSession, revokeAllSessions } from "./session";
import { clearLimit, hitLimit } from "./throttle";

const SPOT = { lat: -8.1049, lng: -34.9107 };

async function citizen(sub: string, name: string): Promise<User> {
  return upsertUserFromIdentity({ sub, cpf: `000.000.000-${sub.length}${sub.at(-1)}`, name }, { role: "CIDADAO" });
}

async function openSession(userId: string, options: { revoked?: boolean; expired?: boolean } = {}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO sessions (id, user_id, expires_at, revoked_at) VALUES ($1,$2,$3,$4)`, [
    id,
    userId,
    new Date(Date.now() + (options.expired ? -1000 : 3_600_000)),
    options.revoked ? new Date() : null,
  ]);
  return id;
}

describe("sessões no servidor", () => {
  beforeEach(async () => {
    setDbForTests(await freshDb());
  });

  it("aceita a sessão aberta e recusa a revogada e a vencida", async () => {
    const ana = await citizen("s-ana", "Ana");
    const open = await openSession(ana.id);
    const revoked = await openSession(ana.id, { revoked: true });
    const expired = await openSession(ana.id, { expired: true });

    expect(await resolveSession(open)).toBe(ana.id);
    expect(await resolveSession(revoked)).toBeNull();
    expect(await resolveSession(expired)).toBeNull();
    expect(await resolveSession(crypto.randomUUID())).toBeNull();
  });

  it("encerrar todas as sessões corta o acesso na hora", async () => {
    const ana = await citizen("s-ana", "Ana");
    const roberto = await citizen("s-rob", "Roberto");
    const dela1 = await openSession(ana.id);
    const dela2 = await openSession(ana.id);
    const dele = await openSession(roberto.id);

    expect(await revokeAllSessions(ana.id)).toBe(2);
    expect(await resolveSession(dela1)).toBeNull();
    expect(await resolveSession(dela2)).toBeNull();
    // A sessão de outra pessoa não é afetada.
    expect(await resolveSession(dele)).toBe(roberto.id);
    // Revogar de novo não conta sessões já encerradas.
    expect(await revokeAllSessions(ana.id)).toBe(0);
  });
});

describe("limite de tentativas", () => {
  beforeEach(async () => {
    setDbForTests(await freshDb());
  });

  it("libera até o limite e depois bloqueia, por chave", async () => {
    for (let i = 0; i < 3; i++) expect(await hitLimit("codigo:op-1", 3, 60)).toBe(true);
    expect(await hitLimit("codigo:op-1", 3, 60)).toBe(false);
    // Outro operador tem a própria contagem.
    expect(await hitLimit("codigo:op-2", 3, 60)).toBe(true);
  });

  it("esquece o que saiu da janela de tempo", async () => {
    const db = await getDb();
    await hitLimit("codigo:op-1", 2, 60);
    await hitLimit("codigo:op-1", 2, 60);
    expect(await hitLimit("codigo:op-1", 2, 60)).toBe(false);

    await db.query(`UPDATE rate_events SET created_at = now() - interval '2 hours' WHERE bucket = 'codigo:op-1'`);
    expect(await hitLimit("codigo:op-1", 2, 60)).toBe(true);
  });

  it("acertar o código zera as tentativas", async () => {
    await hitLimit("codigo:op-1", 2, 60);
    await hitLimit("codigo:op-1", 2, 60);
    await clearLimit("codigo:op-1");
    expect(await hitLimit("codigo:op-1", 2, 60)).toBe(true);
  });
});

describe("quem pode ver a foto de um registro", () => {
  let ana: User;
  let roberto: User;
  let photo: string;
  let reportId: string;

  beforeEach(async () => {
    setDbForTests(await freshDb());
    ana = await citizen("s-ana", "Ana");
    roberto = await citizen("s-rob", "Roberto");
    photo = `${crypto.randomUUID()}.jpg`;
    const created = await createReport({ reporterId: ana.id, ...SPOT, note: null, photoBefore: photo });
    reportId = created.report.id;
  });

  const actor = (user: User) => ({ id: user.id, role: user.role, pointId: user.pointId });

  it("autora sim, vizinho que não confirmou não", async () => {
    expect(await canViewPhoto(actor(ana), photo)).toBe(true);
    expect(await canViewPhoto(actor(roberto), photo)).toBe(false);
  });

  it("quem confirmou o ponto passa a ver", async () => {
    const db = await getDb();
    await db.query(`INSERT INTO report_confirmations (report_id, user_id) VALUES ($1,$2)`, [reportId, roberto.id]);
    expect(await canViewPhoto(actor(roberto), photo)).toBe(true);
  });

  it("operador de ponto não vê foto de registro de entulho", async () => {
    const paulo = await upsertUserFromIdentity({ sub: "s-op", cpf: "000.000.000-44", name: "Paulo" }, { role: "OPERADOR" });
    expect(await canViewPhoto(actor(paulo), photo)).toBe(false);
  });

  it("a gestão de coleta vê tudo; foto inexistente é negada para todos", async () => {
    const gestora = await upsertUserFromIdentity({ sub: "s-gest", cpf: "000.000.000-33", name: "Marina" }, { role: "GESTOR" });
    expect(await canViewPhoto(actor(gestora), photo)).toBe(true);
    expect(await canViewPhoto(actor(gestora), `${crypto.randomUUID()}.jpg`)).toBe(false);
  });

  it("a foto do depois segue a mesma regra do registro", async () => {
    const gestora = await upsertUserFromIdentity({ sub: "s-gest", cpf: "000.000.000-33", name: "Marina" }, { role: "GESTOR" });
    const after = `${crypto.randomUUID()}.jpg`;
    await closeReport(actor(gestora), reportId, { outcome: "BAIXADA", note: null, photoAfter: after });
    expect(await canViewPhoto(actor(ana), after)).toBe(true);
    expect(await canViewPhoto(actor(roberto), after)).toBe(false);
  });
});
