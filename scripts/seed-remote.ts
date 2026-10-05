/**
 * Cria as tabelas e carrega os dados de demonstração num banco Postgres, uma vez.
 *
 *   PowerShell:  $env:DATABASE_URL="postgresql://..."; $env:DEMO_MODE="1"; npm run db:seed
 *
 * Por que fora do site: a primeira visita ao app na Vercel faria isso sozinha, mas
 * uma função serverless tem poucos segundos de limite e a carga leva mais que isso.
 * Pode rodar de novo sem medo: só insere o que ainda não existe.
 */
import { DATABASE_URL, DEMO_MODE, USING_MANAGED_POSTGRES, getDb } from "../src/lib/db";

function describeTarget(): string {
  if (!USING_MANAGED_POSTGRES) return "banco EMBUTIDO local (.data) — DATABASE_URL não está definida";
  try {
    const url = new URL(DATABASE_URL);
    return `Postgres gerenciado em ${url.hostname}:${url.port || "5432"} (banco ${url.pathname.slice(1) || "?"})`;
  } catch {
    return "Postgres gerenciado (endereço ilegível)";
  }
}

async function main(): Promise<void> {
  console.log(`Destino: ${describeTarget()}`);
  console.log(`Dados de demonstração: ${DEMO_MODE ? "sim" : "NÃO (defina DEMO_MODE=1 para criar os personagens e registros)"}`);
  if (!USING_MANAGED_POSTGRES) {
    console.log("\nATENÇÃO: nada será enviado ao Supabase. Defina DATABASE_URL e rode de novo.");
  }

  const db = await getDb();
  const count = async (table: string) => {
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
  };

  console.log("\nSituação do banco:");
  for (const table of ["collection_points", "material_rates", "users", "reports", "deliveries", "credit_ledger"]) {
    console.log(`  ${table.padEnd(18)} ${await count(table)}`);
  }
  await db.close();
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("\nFALHOU:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
