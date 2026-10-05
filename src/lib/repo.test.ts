import { beforeEach, describe, expect, it } from "vitest";
import { getDb, setDbForTests } from "./db";
import { freshDb } from "./test-db";
import {
  DomainError,
  closeReport,
  createReport,
  getCollectionSummary,
  getReport,
  listClosedReports,
  listOpenReports,
  upsertUserFromIdentity,
  type Actor,
  type NewReport,
  type User,
} from "./repo";
import { seedReferenceData } from "./reference";
import { seedDemoIfEmpty } from "./seed";

const BASE = { lat: -8.1049, lng: -34.9107 };

function newReport(reporterId: string, overrides: Partial<NewReport> = {}): NewReport {
  return {
    reporterId,
    lat: BASE.lat,
    lng: BASE.lng,
    note: null,
    photoBefore: "antes.jpg",
    ...overrides,
  };
}

const asActor = (u: User): Actor => ({ id: u.id, role: u.role, pointId: u.pointId });

async function expectDomainError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
  await expect(promise).rejects.toBeInstanceOf(DomainError);
}

describe("registro de entulho e baixa", () => {
  let ana: User;
  let roberto: User;
  let gestor: User;

  beforeEach(async () => {
    setDbForTests(await freshDb());
    const mk = (n: string, role: "CIDADAO" | "GESTOR") =>
      upsertUserFromIdentity({ sub: `s-${n}`, cpf: `000.000.000-${n}`, name: n }, { role });
    ana = await mk("ana", "CIDADAO");
    roberto = await mk("roberto", "CIDADAO");
    gestor = await mk("gestor", "GESTOR");
  });

  it("cria o registro aberto, com código sequencial e bairro", async () => {
    const result = await createReport(newReport(ana.id, { note: "Em frente ao poste 42" }));
    expect(result.kind).toBe("created");
    expect(result.report.status).toBe("ABERTA");
    expect(result.report.code).toMatch(/^OC-\d{4}-000001$/);
    expect(result.report.neighborhood).toBeTruthy();
    expect(result.report.note).toBe("Em frente ao poste 42");
    expect(result.report.closedAt).toBeNull();
  });

  it("confirma em vez de duplicar quando há registro aberto no mesmo ponto", async () => {
    const first = await createReport(newReport(ana.id));
    const second = await createReport(newReport(roberto.id, { lat: BASE.lat + 0.0001 }));
    expect(second.kind).toBe("confirmed");
    expect(second.report.id).toBe(first.report.id);
    expect(second.report.confirmations).toBe(1);

    const again = await createReport(newReport(roberto.id));
    expect(again.kind).toBe("confirmed");
    if (again.kind === "confirmed") expect(again.alreadyConfirmed).toBe(true);
    expect((await getReport(first.report.id))!.confirmations).toBe(1);
  });

  it("abre um registro novo quando o ponto está longe", async () => {
    const first = await createReport(newReport(ana.id));
    const far = await createReport(newReport(roberto.id, { lat: BASE.lat + 0.003 }));
    expect(far.kind).toBe("created");
    expect(far.report.id).not.toBe(first.report.id);
    expect(far.report.code).toMatch(/000002$/);
  });

  it("a gestão dá baixa, com foto e observação opcionais", async () => {
    const { report } = await createReport(newReport(ana.id));

    await closeReport(asActor(gestor), report.id, { outcome: "BAIXADA", note: "2 caçambas removidas", photoAfter: "depois.jpg" });
    const closed = (await getReport(report.id))!;
    expect(closed.status).toBe("BAIXADA");
    expect(closed.photoAfter).toBe("depois.jpg");
    expect(closed.closingNote).toBe("2 caçambas removidas");
    expect(closed.closedAt).toBeInstanceOf(Date);

    const plain = await createReport(newReport(ana.id, { lat: BASE.lat + 0.01 }));
    await closeReport(asActor(gestor), plain.report.id, { outcome: "BAIXADA", note: null, photoAfter: null });
    expect((await getReport(plain.report.id))!.photoAfter).toBeNull();
  });

  it("só a gestão de coleta dá baixa", async () => {
    const { report } = await createReport(newReport(ana.id));
    await expectDomainError(
      closeReport(asActor(roberto), report.id, { outcome: "BAIXADA", note: null, photoAfter: null }),
      "FORBIDDEN",
    );
    expect((await getReport(report.id))!.status).toBe("ABERTA");
  });

  it("registro que não procede exige o motivo", async () => {
    const { report } = await createReport(newReport(ana.id));
    await expectDomainError(
      closeReport(asActor(gestor), report.id, { outcome: "IMPROCEDENTE", note: " ", photoAfter: null }),
      "INVALID",
    );
    await closeReport(asActor(gestor), report.id, { outcome: "IMPROCEDENTE", note: "Sem entulho no local.", photoAfter: null });
    const closed = (await getReport(report.id))!;
    expect(closed.status).toBe("IMPROCEDENTE");
    expect(closed.closingNote).toBe("Sem entulho no local.");
  });

  it("não permite dar baixa duas vezes nem em registro que não existe", async () => {
    const { report } = await createReport(newReport(ana.id));
    await closeReport(asActor(gestor), report.id, { outcome: "BAIXADA", note: null, photoAfter: null });
    await expectDomainError(
      closeReport(asActor(gestor), report.id, { outcome: "IMPROCEDENTE", note: "Motivo qualquer", photoAfter: null }),
      "INVALID_STATE",
    );
    expect((await getReport(report.id))!.status).toBe("BAIXADA");
    await expectDomainError(
      closeReport(asActor(gestor), "nao-existe", { outcome: "BAIXADA", note: null, photoAfter: null }),
      "NOT_FOUND",
    );
  });

  it("recusa um resultado que não é uma baixa", async () => {
    const { report } = await createReport(newReport(ana.id));
    await expectDomainError(
      closeReport(asActor(gestor), report.id, { outcome: "ABERTA" as never, note: null, photoAfter: null }),
      "INVALID",
    );
  });

  it("depois da baixa o ponto aceita um registro novo, marcado como reincidência", async () => {
    const first = await createReport(newReport(ana.id));
    await closeReport(asActor(gestor), first.report.id, { outcome: "BAIXADA", note: null, photoAfter: null });

    const again = await createReport(newReport(roberto.id));
    expect(again.kind).toBe("created");
    expect(again.report.recurrenceOf).toBe(first.report.id);
  });

  it("registro que não procedeu não conta como reincidência", async () => {
    const first = await createReport(newReport(ana.id));
    await closeReport(asActor(gestor), first.report.id, { outcome: "IMPROCEDENTE", note: "Sem entulho.", photoAfter: null });

    const again = await createReport(newReport(roberto.id));
    expect(again.kind).toBe("created");
    expect(again.report.recurrenceOf).toBeNull();
  });

  it("a fila mostra os abertos do mais antigo ao mais novo, e os fechados à parte", async () => {
    const newest = await createReport(newReport(ana.id, { lat: BASE.lat + 0.01 }));
    const oldest = await createReport(newReport(ana.id, { createdAt: new Date(Date.now() - 5 * 86_400_000) }));
    const done = await createReport(newReport(ana.id, { lat: BASE.lat + 0.02 }));
    await closeReport(asActor(gestor), done.report.id, { outcome: "BAIXADA", note: null, photoAfter: null });

    expect((await listOpenReports()).map((r) => r.id)).toEqual([oldest.report.id, newest.report.id]);
    expect((await listClosedReports()).map((r) => r.id)).toEqual([done.report.id]);
  });

  it("o resumo conta abertos e baixados na janela", async () => {
    const a = await createReport(newReport(ana.id));
    await createReport(newReport(ana.id, { lat: BASE.lat + 0.01 }));
    const c = await createReport(newReport(ana.id, { lat: BASE.lat + 0.02 }));
    await closeReport(asActor(gestor), c.report.id, { outcome: "BAIXADA", note: null, photoAfter: null });

    let summary = await getCollectionSummary(30);
    expect(summary.openCount).toBe(2);
    expect(summary.removedCount).toBe(1);
    expect(summary.oldestOpenAt).toBeInstanceOf(Date);
    expect(summary.oldestOpenDays).toBe(0);

    // Baixa antiga fica fora da janela de 30 dias; improcedente nunca entra em "removidos".
    const db = await getDb();
    await db.query(`UPDATE reports SET closed_at = now() - interval '45 days' WHERE id = $1`, [c.report.id]);
    await closeReport(asActor(gestor), a.report.id, { outcome: "IMPROCEDENTE", note: "Sem entulho.", photoAfter: null });
    summary = await getCollectionSummary(30);
    expect(summary.removedCount).toBe(0);
    expect(summary.openCount).toBe(1);
  });
});

describe("dados simulados", () => {
  it("geram uma fila e um histórico coerentes, sem repetir ao ser chamados de novo", async () => {
    const db = await freshDb();
    setDbForTests(db);
    await seedReferenceData(db);
    await seedDemoIfEmpty(db);
    await seedDemoIfEmpty(db);

    const summary = await getCollectionSummary(30);
    expect(summary.openCount).toBeGreaterThanOrEqual(8);
    expect(summary.removedCount).toBeGreaterThan(0);

    const open = await listOpenReports();
    expect(open.length).toBe(summary.openCount);
    expect(open.some((r) => r.recurrenceOf !== null)).toBe(true);
    expect(open.every((r) => r.status === "ABERTA")).toBe(true);
    // A fila anda do mais antigo para o mais novo.
    for (let i = 1; i < open.length; i++) {
      expect(open[i].createdAt.getTime()).toBeGreaterThanOrEqual(open[i - 1].createdAt.getTime());
    }

    const { rows } = await db.query<{ n: number; operators: number; citizens: number; managers: number }>(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE role = 'OPERADOR')::int AS operators,
              count(*) FILTER (WHERE role = 'CIDADAO')::int AS citizens,
              count(*) FILTER (WHERE role = 'GESTOR')::int AS managers
       FROM users`,
    );
    expect(rows[0].managers).toBe(1);
    expect(rows[0].operators).toBeGreaterThanOrEqual(2);
    expect(rows[0].citizens).toBeGreaterThanOrEqual(6);
  });
});
