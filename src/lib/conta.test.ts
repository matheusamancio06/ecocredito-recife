// Consentimento, portabilidade dos dados e encerramento de conta (LGPD).
import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { acceptConsent, deleteAccount, exportUserData, needsConsent } from "./account";
import { getDb, setDbForTests } from "./db";
import { freshDb } from "./test-db";
import { createReport, findUserById, upsertUserFromIdentity, type User } from "./repo";

const SPOT = { lat: -8.1049, lng: -34.9107 };

async function credit(userId: string, amount: number): Promise<void> {
  const db = await getDb();
  await db.query(`INSERT INTO credit_ledger (id, user_id, amount, reason) VALUES ($1,$2,$3,'AJUSTE')`, [
    crypto.randomUUID(),
    userId,
    amount,
  ]);
}

describe("conta do cidadão", () => {
  let ana: User;

  beforeEach(async () => {
    setDbForTests(await freshDb());
    ana = await upsertUserFromIdentity({ sub: "s-ana", cpf: "000.000.000-11", name: "Ana" }, { role: "CIDADAO" });
  });

  it("o consentimento é exigido até a pessoa aceitar a versão vigente", async () => {
    expect(await needsConsent(ana.id)).toBe(true);
    await acceptConsent(ana.id);
    expect(await needsConsent(ana.id)).toBe(false);

    // Texto novo (versão diferente): precisa aceitar de novo.
    const db = await getDb();
    await db.query(`UPDATE users SET consent_version = 'antiga' WHERE id = $1`, [ana.id]);
    expect(await needsConsent(ana.id)).toBe(true);
  });

  it("encerrar a conta apaga o vínculo com a pessoa e mantém o registro de entulho", async () => {
    const created = await createReport({ reporterId: ana.id, ...SPOT, note: null, photoBefore: "a.jpg" });
    await credit(ana.id, 500);

    const summary = await deleteAccount(ana.id);
    expect(summary.reportsKept).toBe(1);
    expect(summary.balanceLost).toBe(500);

    // Não entra mais, mas o registro continua no banco para o planejamento da coleta.
    expect(await findUserById(ana.id)).toBeNull();
    const db = await getDb();
    const { rows } = await db.query<{ display_name: string; gov_sub: string; n: number }>(
      `SELECT u.display_name, u.gov_sub, (SELECT count(*)::int FROM reports WHERE id = $2) AS n
       FROM users u WHERE u.id = $1`,
      [ana.id, created.report.id],
    );
    expect(rows[0].display_name).toBe("Conta encerrada");
    expect(rows[0].gov_sub).not.toBe("s-ana");
    expect(rows[0].n).toBe(1);

    await expect(deleteAccount(ana.id)).rejects.toThrow(/já foi encerrada/i);
  });

  it("entrar de novo pelo gov.br depois de encerrar cria uma conta nova, sem o histórico antigo", async () => {
    await deleteAccount(ana.id);
    const again = await upsertUserFromIdentity({ sub: "s-ana", cpf: "000.000.000-11", name: "Ana" }, { role: "CIDADAO" });
    expect(again.id).not.toBe(ana.id);
  });

  it("a pessoa consegue baixar os próprios dados, sem o CPF", async () => {
    await createReport({ reporterId: ana.id, ...SPOT, note: "Em frente ao poste", photoBefore: "a.jpg" });
    await credit(ana.id, 120);

    const data = await exportUserData(ana.id);
    expect((data.registrosDeEntulho as unknown[]).length).toBe(1);
    expect((data.lancamentosEcoCoins as unknown[]).length).toBe(1);
    expect(JSON.stringify(data)).not.toContain("000.000.000-11");
  });
});
