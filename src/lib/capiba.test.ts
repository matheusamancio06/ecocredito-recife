// Troca de EcoCoins por Moeda Capiba: débito, estorno, saldo e concorrência.
import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { exportUserData } from "./account";
import { exchangeForCapibas, listExchanges, simulatedGateway, type CapibaGateway } from "./capiba";
import { getBalance } from "./credits";
import { getDb, setDbForTests } from "./db";
import { ECOCOINS_PER_CAPIBA, MAX_CAPIBAS_PER_EXCHANGE } from "./domain";
import { upsertUserFromIdentity, type User } from "./repo";
import { freshDb } from "./test-db";

async function credit(userId: string, amount: number): Promise<void> {
  const db = await getDb();
  await db.query(`INSERT INTO credit_ledger (id, user_id, amount, reason) VALUES ($1,$2,$3,'AJUSTE')`, [
    crypto.randomUUID(),
    userId,
    amount,
  ]);
}

const failing: CapibaGateway = {
  simulated: true,
  async credit() {
    throw new Error("Conecta Recife fora do ar");
  },
};

describe("troca por Moeda Capiba", () => {
  let ana: User;
  let roberto: User;

  beforeEach(async () => {
    setDbForTests(await freshDb());
    ana = await upsertUserFromIdentity({ sub: "s-ana", cpf: "000.000.000-11", name: "Ana" }, { role: "CIDADAO" });
    roberto = await upsertUserFromIdentity({ sub: "s-rob", cpf: "000.000.000-12", name: "Roberto" }, { role: "CIDADAO" });
  });

  it("debita os EcoCoins, credita a Capiba e registra o protocolo", async () => {
    await credit(ana.id, 1000);
    const exchange = await exchangeForCapibas(ana.id, 3, simulatedGateway);

    expect(exchange.capibas).toBe(3);
    expect(exchange.ecocoins).toBe(3 * ECOCOINS_PER_CAPIBA);
    expect(exchange.status).toBe("CREDITADA");
    expect(exchange.simulated).toBe(true);
    expect(exchange.protocol).toMatch(/^SIM-[0-9A-F]{8}$/);
    expect(await getBalance(ana.id)).toBe(1000 - 300);

    const db = await getDb();
    const { rows } = await db.query<{ amount: number; reason: string }>(
      `SELECT amount, reason FROM credit_ledger WHERE capiba_exchange_id = $1`,
      [exchange.id],
    );
    expect(rows).toEqual([{ amount: -300, reason: "TROCA_CAPIBA" }]);
  });

  it("recusa quando falta saldo, diz quanto falta e não debita nada", async () => {
    await credit(ana.id, 250);
    await expect(exchangeForCapibas(ana.id, 3, simulatedGateway)).rejects.toThrow(/faltam 50 EcoCoins/);
    expect(await getBalance(ana.id)).toBe(250);
    expect(await listExchanges(ana.id)).toHaveLength(0);
  });

  it("aceita gastar o saldo inteiro, até zerar", async () => {
    await credit(ana.id, 200);
    await exchangeForCapibas(ana.id, 2, simulatedGateway);
    expect(await getBalance(ana.id)).toBe(0);
    await expect(exchangeForCapibas(ana.id, 1, simulatedGateway)).rejects.toThrow(/saldo insuficiente/i);
  });

  it("só aceita números inteiros de 1 até o teto", async () => {
    await credit(ana.id, 1_000_000);
    for (const capibas of [0, -2, 1.5, Number.NaN, MAX_CAPIBAS_PER_EXCHANGE + 1]) {
      await expect(exchangeForCapibas(ana.id, capibas, simulatedGateway)).rejects.toMatchObject({ code: "INVALID" });
    }
    expect(await getBalance(ana.id)).toBe(1_000_000);
    await expect(exchangeForCapibas(ana.id, MAX_CAPIBAS_PER_EXCHANGE, simulatedGateway)).resolves.toBeTruthy();
  });

  it("duas trocas ao mesmo tempo não gastam o mesmo saldo duas vezes", async () => {
    await credit(ana.id, 500);
    const results = await Promise.allSettled([
      exchangeForCapibas(ana.id, 4, simulatedGateway),
      exchangeForCapibas(ana.id, 4, simulatedGateway),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await getBalance(ana.id)).toBe(100);
  });

  it("se a Capiba falha, devolve os EcoCoins uma vez só e marca a troca como não concluída", async () => {
    await credit(ana.id, 600);
    await expect(exchangeForCapibas(ana.id, 2, failing)).rejects.toThrow(/EcoCoins foram devolvidos/);
    expect(await getBalance(ana.id)).toBe(600);

    const [exchange] = await listExchanges(ana.id);
    expect(exchange.status).toBe("FALHOU");
    expect(exchange.protocol).toBeNull();

    const db = await getDb();
    const { rows } = await db.query<{ reason: string; amount: number }>(
      `SELECT reason, amount FROM credit_ledger WHERE capiba_exchange_id = $1 ORDER BY amount`,
      [exchange.id],
    );
    expect(rows).toEqual([
      { reason: "TROCA_CAPIBA", amount: -200 },
      { reason: "ESTORNO", amount: 200 },
    ]);
  });

  it("sem gateway (ambiente real, sem integração) a troca não existe e não mexe no saldo", async () => {
    await credit(ana.id, 500);
    await expect(exchangeForCapibas(ana.id, 1, null)).rejects.toThrow(/ainda não está disponível/);
    expect(await getBalance(ana.id)).toBe(500);
  });

  it("o histórico é de cada pessoa, do mais recente para o mais antigo", async () => {
    await credit(ana.id, 1000);
    await credit(roberto.id, 1000);
    const first = await exchangeForCapibas(ana.id, 1, simulatedGateway);
    const second = await exchangeForCapibas(ana.id, 2, simulatedGateway);
    await exchangeForCapibas(roberto.id, 5, simulatedGateway);

    const mine = await listExchanges(ana.id);
    expect(mine.map((x) => x.id)).toEqual([second.id, first.id]);
    expect(await listExchanges(roberto.id)).toHaveLength(1);
  });

  it("as trocas entram no arquivo de dados do titular (LGPD)", async () => {
    await credit(ana.id, 300);
    await exchangeForCapibas(ana.id, 1, simulatedGateway);
    const data = await exportUserData(ana.id);
    const trocas = data.trocasPorMoedaCapiba as { capibas: number; ecocoins: number; simulated: boolean }[];
    expect(trocas).toHaveLength(1);
    expect(trocas[0]).toMatchObject({ capibas: 1, ecocoins: 100, simulated: true });
  });
});
