import crypto from "node:crypto";
import { DEMO_MODE, getDb } from "./db";
import { ECOCOINS_PER_CAPIBA, MAX_CAPIBAS_PER_EXCHANGE } from "./domain";
import { DomainError } from "./repo";

/**
 * Troca de EcoCoins por Moeda Capiba.
 *
 * A Capiba é a moeda social digital da Prefeitura do Recife e vive dentro do app
 * Conecta Recife: quem a emite é a Prefeitura, não este sistema. Por isso o
 * crédito passa por um `CapibaGateway`. Hoje existe só o simulado (modo
 * demonstração); o real depende de acordo e de uma API da Prefeitura, que este
 * protótipo não tem. Trocar o gateway não mexe no resto.
 */

export interface CapibaGateway {
  /** Verdadeiro quando NÃO credita Capiba de verdade (demonstração). */
  readonly simulated: boolean;
  /** Credita as Capibas na carteira da pessoa. Lança erro se não conseguir. */
  credit(input: { exchangeId: string; capibas: number }): Promise<{ protocol: string }>;
}

export const simulatedGateway: CapibaGateway = {
  simulated: true,
  async credit({ exchangeId }) {
    return { protocol: `SIM-${exchangeId.slice(0, 8).toUpperCase()}` };
  },
};

/** O gateway do ambiente, ou null quando a troca não está disponível. */
export function defaultGateway(): CapibaGateway | null {
  return DEMO_MODE ? simulatedGateway : null;
}

export type CapibaStatus = "PENDENTE" | "CREDITADA" | "FALHOU";

export interface CapibaExchange {
  id: string;
  ecocoins: number;
  capibas: number;
  status: CapibaStatus;
  protocol: string | null;
  simulated: boolean;
  createdAt: Date;
}

interface ExchangeRow {
  id: string;
  ecocoins: number;
  capibas: number;
  status: CapibaStatus;
  protocol: string | null;
  simulated: boolean;
  created_at: Date;
}

const EXCHANGE_COLUMNS = `id, ecocoins, capibas, status, protocol, simulated, created_at`;

function mapExchange(row: ExchangeRow): CapibaExchange {
  return {
    id: row.id,
    ecocoins: row.ecocoins,
    capibas: row.capibas,
    status: row.status,
    protocol: row.protocol,
    simulated: row.simulated,
    createdAt: row.created_at,
  };
}

/**
 * Troca `capibas` Capibas por EcoCoins do saldo da pessoa.
 *
 * Em duas etapas, porque o crédito na Capiba é um serviço de fora e pode falhar:
 * 1. numa transação, trava a pessoa, confere o saldo, debita e registra a troca
 *    como PENDENTE (duas trocas ao mesmo tempo não gastam o mesmo saldo);
 * 2. fora da transação, pede o crédito. Deu certo: CREDITADA. Deu errado: FALHOU
 *    e o débito é estornado, uma vez só.
 */
export async function exchangeForCapibas(
  userId: string,
  capibas: number,
  gateway: CapibaGateway | null = defaultGateway(),
): Promise<CapibaExchange> {
  if (!gateway) {
    throw new DomainError("INVALID_STATE", "A troca por Moeda Capiba ainda não está disponível neste ambiente.");
  }
  if (!Number.isInteger(capibas) || capibas < 1 || capibas > MAX_CAPIBAS_PER_EXCHANGE) {
    throw new DomainError("INVALID", `Escolha de 1 a ${MAX_CAPIBAS_PER_EXCHANGE} Capibas, em números inteiros.`);
  }
  const ecocoins = capibas * ECOCOINS_PER_CAPIBA;
  const id = crypto.randomUUID();
  const db = await getDb();

  await db.transaction(async (tx) => {
    await tx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    const { rows } = await tx.query<{ balance: number }>(
      `SELECT COALESCE(SUM(amount), 0)::int AS balance FROM credit_ledger WHERE user_id = $1`,
      [userId],
    );
    const balance = rows[0].balance;
    if (balance < ecocoins) {
      throw new DomainError("INVALID", `Saldo insuficiente: faltam ${ecocoins - balance} EcoCoins para ${capibas} Capiba${capibas === 1 ? "" : "s"}.`);
    }
    await tx.query(
      `INSERT INTO capiba_exchanges (id, user_id, ecocoins, capibas, simulated) VALUES ($1,$2,$3,$4,$5)`,
      [id, userId, ecocoins, capibas, gateway.simulated],
    );
    await tx.query(
      `INSERT INTO credit_ledger (id, user_id, amount, reason, capiba_exchange_id) VALUES ($1,$2,$3,'TROCA_CAPIBA',$4)`,
      [crypto.randomUUID(), userId, -ecocoins, id],
    );
  });

  try {
    const { protocol } = await gateway.credit({ exchangeId: id, capibas });
    await db.query(
      `UPDATE capiba_exchanges SET status = 'CREDITADA', protocol = $2, settled_at = now()
       WHERE id = $1 AND status = 'PENDENTE'`,
      [id, protocol],
    );
  } catch (error) {
    console.error("[capiba] crédito falhou:", error instanceof Error ? error.message : "erro desconhecido");
    await db.transaction(async (tx) => {
      const { rows } = await tx.query(
        `UPDATE capiba_exchanges SET status = 'FALHOU', settled_at = now()
         WHERE id = $1 AND status = 'PENDENTE' RETURNING id`,
        [id],
      );
      if (rows.length > 0) {
        await tx.query(
          `INSERT INTO credit_ledger (id, user_id, amount, reason, capiba_exchange_id) VALUES ($1,$2,$3,'ESTORNO',$4)`,
          [crypto.randomUUID(), userId, ecocoins, id],
        );
      }
    });
    throw new DomainError("INVALID_STATE", "Não foi possível creditar as Capibas agora. Seus EcoCoins foram devolvidos.");
  }

  const { rows } = await db.query<ExchangeRow>(`SELECT ${EXCHANGE_COLUMNS} FROM capiba_exchanges WHERE id = $1`, [id]);
  return mapExchange(rows[0]);
}

export async function listExchanges(userId: string, limit = 10): Promise<CapibaExchange[]> {
  const db = await getDb();
  const { rows } = await db.query<ExchangeRow>(
    `SELECT ${EXCHANGE_COLUMNS} FROM capiba_exchanges WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapExchange);
}

/** Capibas já creditadas por trocas desta pessoa (no protótipo, a carteira simulada). */
export async function capibaBalance(userId: string): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ total: number | string }>(
    `SELECT COALESCE(SUM(capibas), 0) AS total FROM capiba_exchanges WHERE user_id = $1 AND status = 'CREDITADA'`,
    [userId],
  );
  return Number(rows[0]?.total ?? 0);
}
