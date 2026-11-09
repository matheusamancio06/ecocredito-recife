/**
 * Gera os scripts SQL da pasta database/ a partir do próprio aplicativo:
 *   database/schema.sql  criação das tabelas (as migrações do app, em ordem)
 *   database/seed.sql    dados de demonstração SIMULADOS (sem fotos)
 *
 *   PowerShell:  $env:DATA_DIR=".data-export"; $env:DEMO_MODE="1"; npm run db:export
 *
 * Use um DATA_DIR vazio para sempre sair a mesma carga inicial.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";

const OUT = path.join(process.cwd(), "database");

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (Array.isArray(v)) return `ARRAY[${v.map(literal).join(",")}]::text[]`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function schemaSql(): string {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/db.ts"), "utf8");
  const blocks = [...source.matchAll(/version: (\d+),\s*sql: `([\s\S]*?)`,\s*\}/g)];
  const parts = blocks.map((m) => `-- ===== Migração ${m[1]} =====\n${m[2].trim()}\n`);
  return (
    `-- EcoCrédito Recife: criação do banco (PostgreSQL 14+).\n` +
    `-- Gerado por scripts/export-sql.ts a partir das migrações do aplicativo; não edite à mão.\n` +
    `-- Pode ser executado de novo: usa IF NOT EXISTS.\n\n` +
    `BEGIN;\n\n${parts.join("\n")}\nCOMMIT;\n`
  );
}

// Ordem que respeita as chaves estrangeiras.
const TABLES: { name: string; order: string }[] = [
  { name: "collection_points", order: "id" },
  { name: "material_rates", order: "material" },
  { name: "users", order: "created_at, id" },
  { name: "reports", order: "created_at, id" },
  { name: "report_confirmations", order: "created_at, report_id, user_id" },
  { name: "deliveries", order: "created_at, id" },
  { name: "capiba_exchanges", order: "created_at, id" },
  { name: "credit_ledger", order: "created_at, id" },
];

async function seedSql(): Promise<string> {
  const db = await getDb();
  const lines: string[] = [
    "-- EcoCrédito Recife: dados de demonstração SIMULADOS (nada aqui é registro real).",
    "-- Pontos de coleta vêm de dados abertos da Prefeitura do Recife; o resto é fictício.",
    "-- Rode depois de schema.sql, num banco vazio. Fotos não entram (ficam na tabela photos).",
    "",
    "BEGIN;",
    "",
  ];
  for (const { name, order } of TABLES) {
    const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM ${name} ORDER BY ${order}`);
    lines.push(`-- ${name}: ${rows.length} linhas`);
    if (rows.length === 0) {
      lines.push("");
      continue;
    }
    const cols = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100).map((r) => `(${cols.map((c) => literal(r[c])).join(",")})`);
      lines.push(`INSERT INTO ${name} (${cols.join(",")}) VALUES\n${chunk.join(",\n")};`);
    }
    lines.push("");
  }
  lines.push("-- O próximo código de registro continua de onde a carga parou.");
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM reports`);
  lines.push(`SELECT setval('report_seq', ${Math.max(rows[0].n, 1)});`, "", "COMMIT;", "");
  await db.close();
  return lines.join("\n");
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "schema.sql"), schemaSql());
  fs.writeFileSync(path.join(OUT, "seed.sql"), await seedSql());
  console.log("database/schema.sql e database/seed.sql gerados.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
