import { afterAll } from "vitest";
import { createDb, type Database } from "./db";

// Subir um Postgres embutido (WASM) custa segundos e centenas de MB. Cada arquivo de
// teste sobe um só e o esvazia entre os testes, em vez de criar um por teste (que,
// numa máquina com pouca memória, terminava em estouro de tempo).
let shared: Promise<Database> | undefined;

// Tudo o que depende destas tabelas cai junto (CASCADE): sessões, registros,
// confirmações, entregas, lançamentos e códigos.
const RESET_SQL = `
  TRUNCATE collection_points, material_rates, users, rate_events, photos CASCADE;
  ALTER SEQUENCE report_seq RESTART WITH 1;
`;

/** Banco de teste vazio (só com as migrações), pronto para `setDbForTests`. */
export async function freshDb(): Promise<Database> {
  shared ??= createDb();
  const db = await shared;
  await db.exec(RESET_SQL);
  return db;
}

afterAll(async () => {
  const db = await shared?.catch(() => undefined);
  shared = undefined;
  await db?.close().catch(() => undefined);
});
