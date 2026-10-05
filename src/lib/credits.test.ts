import { beforeEach, describe, expect, it } from "vitest";
import {
  formatCode,
  generateCode,
  getBalance,
  getRecyclingSummary,
  issueQrCode,
  listDeliveries,
  normalizeCode,
  claimQrCode,
  registerDelivery,
} from "./credits";
import { setDbForTests } from "./db";
import { freshDb } from "./test-db";
import { MAX_POINTS_PER_DAY } from "./domain";
import { findPointByKind } from "./points";
import { seedReferenceData } from "./reference";
import { upsertUserFromIdentity, type Actor, type User } from "./repo";

describe("códigos de entrega", () => {
  it("gera códigos sem caracteres ambíguos e com o tamanho certo", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    }
    expect(formatCode("ABCDE12345")).toBe("ABCDE-12345");
  });

  it("normaliza o que o operador digita", () => {
    expect(normalizeCode(" abcde-1o1il ")).toBe("ABCDE10111");
  });
});

describe("EcoCrédito: entrega, código e livro-razão", () => {
  let ana: User;
  let operator: Actor;
  let ecoOperator: Actor;
  let coopName: string;
  let coopNeighborhood: string | null;

  const asActor = (u: User): Actor => ({ id: u.id, role: u.role, pointId: u.pointId });

  beforeEach(async () => {
    const db = await freshDb();
    setDbForTests(db);
    await seedReferenceData(db);

    const coop = (await findPointByKind("COOPERATIVA"))!;
    const eco = (await findPointByKind("ECOESTACAO"))!;
    coopName = coop.name;
    coopNeighborhood = coop.neighborhood;

    ana = await upsertUserFromIdentity({ sub: "s-ana", cpf: "000.000.000-11", name: "Ana" }, { role: "CIDADAO" });
    const op = await upsertUserFromIdentity(
      { sub: "s-op", cpf: "000.000.000-04", name: "Paulo" },
      { role: "OPERADOR", pointId: coop.id },
    );
    const opEco = await upsertUserFromIdentity(
      { sub: "s-op2", cpf: "000.000.000-05", name: "Sônia" },
      { role: "OPERADOR", pointId: eco.id },
    );
    operator = asActor(op);
    ecoOperator = asActor(opEco);
  });

  it("emite um código, invalida o anterior e permite conferir sem consumir", async () => {
    const first = await issueQrCode(ana.id);
    const second = await issueQrCode(ana.id);
    expect(await claimQrCode(first.code)).toBeNull();
    const preview = await claimQrCode(formatCode(second.code).toLowerCase());
    expect(preview?.displayName).toBe("Ana");
    expect(await claimQrCode(second.code)).not.toBeNull();
  });

  it("dá tempo de pesar depois de conferir o código, sem torná-lo reutilizável", async () => {
    const db = await (await import("./db")).getDb();
    const { code } = await issueQrCode(ana.id);
    await db.query(`UPDATE qr_tokens SET expires_at = now() + interval '5 seconds' WHERE code = $1`, [code]);
    await claimQrCode(code);
    const { rows } = await db.query<{ secs: number }>(
      `SELECT extract(epoch FROM (expires_at - now()))::float8 AS secs FROM qr_tokens WHERE code = $1`,
      [code],
    );
    expect(rows[0].secs).toBeGreaterThan(500);

    await registerDelivery(operator, { code, material: "VIDRO", quantity: 1 });
    expect(await claimQrCode(code)).toBeNull();
  });

  it("credita EcoCoins pela tabela do material e soma o saldo", async () => {
    const { code } = await issueQrCode(ana.id);
    const receipt = await registerDelivery(operator, { code, material: "PLASTICO_PET", quantity: 2.5 });
    expect(receipt.points).toBe(125);
    expect(receipt.balance).toBe(125);
    expect(receipt.unit).toBe("KG");

    const next = await issueQrCode(ana.id);
    const second = await registerDelivery(operator, { code: next.code, material: "ALUMINIO", quantity: 1 });
    expect(second.points).toBe(100);
    expect(await getBalance(ana.id)).toBe(225);

    const history = await listDeliveries(ana.id);
    expect(history.map((d) => d.points)).toEqual([100, 125]);
    // O histórico identifica o ponto pelo bairro: nos dados abertos há 16 pontos chamados só "Cooperativa".
    expect(history[0].pointName.startsWith(coopName)).toBe(true);
    if (coopNeighborhood) expect(history[0].pointName.toLowerCase()).toContain(coopNeighborhood.toLowerCase());
  });

  it("não deixa o mesmo código valer duas vezes", async () => {
    const { code } = await issueQrCode(ana.id);
    await registerDelivery(operator, { code, material: "VIDRO", quantity: 3 });
    await expect(registerDelivery(operator, { code, material: "VIDRO", quantity: 3 })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    expect(await getBalance(ana.id)).toBe(90);
  });

  it("rejeita código expirado", async () => {
    const { code } = await issueQrCode(ana.id);
    const db = await (await import("./db")).getDb();
    await db.query(`UPDATE qr_tokens SET expires_at = now() - interval '1 second' WHERE code = $1`, [code]);
    expect(await claimQrCode(code)).toBeNull();
    await expect(registerDelivery(operator, { code, material: "VIDRO", quantity: 1 })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });

  it("só operadores de ponto com atendente registram entregas", async () => {
    const { code } = await issueQrCode(ana.id);
    await expect(registerDelivery(asActor(ana), { code, material: "VIDRO", quantity: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await claimQrCode(code)).not.toBeNull();
  });

  it("exige que o ponto receba o material e não consome o código em caso de erro", async () => {
    const db = await (await import("./db")).getDb();
    const { rows } = await db.query<{ accepts: string[] }>(
      `SELECT accepts FROM collection_points WHERE id = $1`,
      [operator.pointId],
    );
    const coopAcceptsEletronico = rows[0].accepts.includes("ELETRONICO");

    const { code } = await issueQrCode(ana.id);
    if (!coopAcceptsEletronico) {
      await expect(registerDelivery(operator, { code, material: "ELETRONICO", quantity: 1 })).rejects.toMatchObject({
        code: "INVALID",
      });
      expect(await claimQrCode(code)).not.toBeNull();
    }
    const ok = await registerDelivery(ecoOperator, { code, material: "ELETRONICO", quantity: 1 });
    expect(ok.points).toBe(120);
  });

  it("valida a quantidade", async () => {
    const { code } = await issueQrCode(ana.id);
    for (const quantity of [0, -3, Number.NaN, 100000]) {
      await expect(registerDelivery(operator, { code, material: "VIDRO", quantity })).rejects.toMatchObject({
        code: "INVALID",
      });
    }
    expect(await claimQrCode(code)).not.toBeNull();
  });

  it("aplica o limite diário sem consumir o código", async () => {
    const big = await issueQrCode(ana.id);
    // 39 kg de PET = 1950 pontos; depois 22 kg de vidro = 660 => 2610 (cabe)
    await registerDelivery(operator, { code: big.code, material: "PLASTICO_PET", quantity: 39 });
    const second = await issueQrCode(ana.id);
    await registerDelivery(operator, { code: second.code, material: "VIDRO", quantity: 22 });

    const over = await issueQrCode(ana.id);
    await expect(registerDelivery(operator, { code: over.code, material: "PLASTICO_PET", quantity: 20 })).rejects.toMatchObject({
      code: "INVALID",
    });
    expect(await claimQrCode(over.code)).not.toBeNull();
    expect(await getBalance(ana.id)).toBeLessThanOrEqual(MAX_POINTS_PER_DAY);
  });

  it("resume a reciclagem da janela: peso, entregas, participantes e EcoCoins emitidos", async () => {
    const a = await issueQrCode(ana.id);
    await registerDelivery(operator, { code: a.code, material: "PLASTICO_PET", quantity: 4 });
    const b = await issueQrCode(ana.id);
    await registerDelivery(operator, { code: b.code, material: "VIDRO", quantity: 6 });

    const summary = await getRecyclingSummary(30);
    expect(summary.deliveries).toBe(2);
    expect(summary.participants).toBe(1);
    expect(summary.totalKg).toBeCloseTo(10);
    expect(summary.totalLiters).toBe(0);
    expect(summary.pointsIssued).toBe(4 * 50 + 6 * 30);
  });

  it("entrega antiga fica fora da janela do resumo", async () => {
    const db = await (await import("./db")).getDb();
    const { code } = await issueQrCode(ana.id);
    await registerDelivery(operator, { code, material: "VIDRO", quantity: 5 });
    await db.query(`UPDATE deliveries SET created_at = now() - interval '45 days'`);

    expect((await getRecyclingSummary(30)).deliveries).toBe(0);
    expect((await getRecyclingSummary(60)).deliveries).toBe(1);
  });
});
