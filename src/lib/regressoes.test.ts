// Regressões de bugs encontrados na revisão. Cada teste protege um caso que já quebrou.
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, setDbForTests } from "./db";
import { freshDb } from "./test-db";
import { hashCpf } from "./identity";
import { formatAge } from "./format";
import { formatDistance } from "./points";
import { reportSchema } from "./report-schema";
import {
  confirmIfDuplicate,
  countRecentActivity,
  createReport,
  getReport,
  upsertUserFromIdentity,
  type NewReport,
  type User,
} from "./repo";

const SPOT = { lat: -8.1049, lng: -34.9107 };

function report(reporterId: string, overrides: Partial<NewReport> = {}): NewReport {
  return { reporterId, ...SPOT, note: null, photoBefore: "a.jpg", ...overrides };
}

describe("confirmação de registro no mesmo ponto", () => {
  let ana: User;
  let roberto: User;

  beforeEach(async () => {
    setDbForTests(await freshDb());
    ana = await upsertUserFromIdentity({ sub: "s-ana", cpf: "000.000.000-11", name: "Ana" }, { role: "CIDADAO" });
    roberto = await upsertUserFromIdentity({ sub: "s-rob", cpf: "000.000.000-12", name: "Roberto" }, { role: "CIDADAO" });
  });

  it("o autor reenviando o mesmo ponto não conta como confirmação", async () => {
    const first = await createReport(report(ana.id));
    const again = await createReport(report(ana.id));

    expect(again.kind).toBe("confirmed");
    if (again.kind === "confirmed") expect(again.alreadyConfirmed).toBe(true);
    expect((await getReport(first.report.id))!.confirmations).toBe(0);
  });

  it("confirmIfDuplicate não grava nada quando não há registro aberto no ponto", async () => {
    expect(await confirmIfDuplicate(roberto.id, SPOT)).toBeNull();
    expect(await confirmIfDuplicate(roberto.id, { lat: SPOT.lat + 0.01, lng: SPOT.lng })).toBeNull();
  });

  it("confirmIfDuplicate soma a confirmação de outra pessoa uma única vez", async () => {
    const first = await createReport(report(ana.id));
    const one = await confirmIfDuplicate(roberto.id, SPOT);
    const two = await confirmIfDuplicate(roberto.id, SPOT);

    expect(one?.kind === "confirmed" && one.alreadyConfirmed).toBe(false);
    expect(two?.kind === "confirmed" && two.alreadyConfirmed).toBe(true);
    expect((await getReport(first.report.id))!.confirmations).toBe(1);
  });

  it("o limite por hora conta registros novos e confirmações", async () => {
    await createReport(report(ana.id));
    await createReport(report(roberto.id, { lat: SPOT.lat + 0.01 }));
    await confirmIfDuplicate(roberto.id, SPOT);
    const since = new Date(Date.now() - 3_600_000);
    expect(await countRecentActivity(roberto.id, since)).toBe(2);
    expect(await countRecentActivity(ana.id, since)).toBe(1);
  });

  it("um registro de ontem no banco continua com a data original", async () => {
    const created = await createReport(report(ana.id, { createdAt: new Date("2026-09-01T12:00:00Z") }));
    const db = await getDb();
    const { rows } = await db.query<{ created_at: Date }>(`SELECT created_at FROM reports WHERE id = $1`, [created.report.id]);
    expect(rows[0].created_at.toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });
});

describe("formulário de registro", () => {
  it("rejeita coordenadas vazias (antes viravam 0,0)", () => {
    const result = reportSchema.safeParse({ lat: "", lng: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("lat");
      expect(paths).toContain("lng");
    }
  });

  it("aceita coordenadas em texto", () => {
    const result = reportSchema.safeParse({ lat: "-8.05", lng: "-34.88" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lat).toBeCloseTo(-8.05);
  });

  it("rejeita coordenada não numérica", () => {
    expect(reportSchema.safeParse({ lat: "abc", lng: "-34" }).success).toBe(false);
  });
});

describe("apresentação", () => {
  it("distâncias não mostram '1000 m' e tratam valores muito curtos", () => {
    expect(formatDistance(999)).toBe("1,0 km");
    expect(formatDistance(1234)).toBe("1,2 km");
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(3)).toBe("menos de 10 m");
  });

  it("idade do registro em dias corridos", () => {
    const now = new Date("2026-09-21T15:00:00Z");
    expect(formatAge(new Date("2026-09-21T01:00:00Z"), now)).toBe("hoje");
    expect(formatAge(new Date("2026-09-20T01:00:00Z"), now)).toBe("há 1 dia");
    expect(formatAge(new Date("2026-09-09T12:00:00Z"), now)).toBe("há 12 dias");
  });
});

describe("identidade do cidadão", () => {
  it("não muda quando o segredo de sessão é trocado", () => {
    const before = hashCpf("123.456.789-09");
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "outro-segredo-de-sessao-totalmente-diferente";
    try {
      expect(hashCpf("123.456.789-09")).toBe(before);
    } finally {
      if (original === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = original;
    }
  });

  it("ignora pontuação e diferencia CPFs", () => {
    expect(hashCpf("123.456.789-09")).toBe(hashCpf("12345678909"));
    expect(hashCpf("123.456.789-09")).not.toBe(hashCpf("123.456.789-10"));
  });
});
