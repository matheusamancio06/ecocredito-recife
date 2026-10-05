import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
// Login simulado e dados de demonstração: ligados em desenvolvimento; em produção
// só com DEMO_MODE=1 explícito (senão qualquer pessoa entraria como gestão).
export const DEMO_MODE = process.env.DEMO_MODE
  ? process.env.DEMO_MODE === "1"
  : process.env.NODE_ENV !== "production";

// Postgres gerenciado quando DATABASE_URL está definida; senão o Postgres
// embutido (WASM), que grava em disco e serve para desenvolvimento e demonstração.
export const DATABASE_URL = process.env.DATABASE_URL ?? "";
export const USING_MANAGED_POSTGRES = DATABASE_URL !== "";

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Queryable {
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// SQL compatível com PostgreSQL. Migrações são aplicadas em ordem e registradas
// em schema_migrations. A versão 1 é a linha de base do app simplificado (registro
// de entulho + reciclagem com EcoCoins); a versão completa anterior, com triagem,
// equipes, avisos e painel, está guardada à parte e não compartilha este banco.
// Depois de publicada, nunca edite uma migração: crie a próxima.
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
-- Pontos de descarte e coleta (dados abertos da Prefeitura do Recife).
CREATE TABLE IF NOT EXISTS collection_points (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('PEV','ECOPONTO','ECOESTACAO','COOPERATIVA','OUTRO')),
  name text NOT NULL,
  neighborhood text,
  address text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accepts text[] NOT NULL,
  staffed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS collection_points_geo_idx ON collection_points (lat, lng);

-- Cidadão, operador de ponto de recebimento ou gestão de coleta.
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  gov_sub text NOT NULL UNIQUE,
  cpf_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('CIDADAO','OPERADOR','GESTOR')),
  point_id text REFERENCES collection_points(id),
  consent_at timestamptz,
  consent_version text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Registro de entulho feito pelo cidadão. A gestão de coleta dá baixa depois.
CREATE SEQUENCE IF NOT EXISTS report_seq START 1;

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  reporter_id text NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','BAIXADA','IMPROCEDENTE')),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  neighborhood text,
  note text,
  photo_before text NOT NULL,
  photo_after text,
  recurrence_of text REFERENCES reports(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by text REFERENCES users(id),
  closing_note text
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status);
CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at);
CREATE INDEX IF NOT EXISTS reports_geo_idx ON reports (lat, lng);
CREATE INDEX IF NOT EXISTS reports_reporter_idx ON reports (reporter_id);
-- A foto é buscada pelo nome para conferir quem pode vê-la.
CREATE INDEX IF NOT EXISTS reports_photo_before_idx ON reports (photo_before);
CREATE INDEX IF NOT EXISTS reports_photo_after_idx ON reports (photo_after);

-- Quem viu o mesmo ponto e confirmou, em vez de abrir um registro repetido.
CREATE TABLE IF NOT EXISTS report_confirmations (
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id)
);

-- Quantos EcoCoins vale cada unidade de material reciclável.
CREATE TABLE IF NOT EXISTS material_rates (
  material text PRIMARY KEY,
  label text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('KG','L')),
  points_per_unit int NOT NULL CHECK (points_per_unit >= 0)
);

-- Código de uso único que o cidadão mostra ao operador (QR Code).
CREATE TABLE IF NOT EXISTS qr_tokens (
  code text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qr_tokens_user_idx ON qr_tokens (user_id, created_at);

-- Entrega pesada e conferida por um operador.
CREATE TABLE IF NOT EXISTS deliveries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  point_id text NOT NULL REFERENCES collection_points(id),
  operator_id text NOT NULL REFERENCES users(id),
  material text NOT NULL REFERENCES material_rates(material),
  quantity double precision NOT NULL CHECK (quantity > 0),
  points int NOT NULL CHECK (points >= 0),
  qr_code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deliveries_user_idx ON deliveries (user_id, created_at);
CREATE INDEX IF NOT EXISTS deliveries_point_idx ON deliveries (point_id, created_at);

-- Livro-razão só de acréscimos: o saldo é a soma dos lançamentos.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  amount int NOT NULL,
  reason text NOT NULL,
  delivery_id text UNIQUE REFERENCES deliveries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger (user_id, created_at);

-- Sessões no servidor: permitem encerrar o acesso de um aparelho (ou de todos)
-- sem esperar o cookie expirar.
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, created_at);

-- Limite de tentativas por chave (códigos de EcoCoins, envios).
CREATE TABLE IF NOT EXISTS rate_events (
  id text PRIMARY KEY,
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_events_bucket_idx ON rate_events (bucket, created_at);

-- Fotos no banco: hospedagem serverless não tem disco que sobreviva ao deploy.
CREATE TABLE IF NOT EXISTS photos (
  name text PRIMARY KEY,
  mime text NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
];

/** Aplica UMA migração e registra a versão, tudo numa transação. */
type ApplyMigration = (migration: { version: number; sql: string }) => Promise<void>;

async function migrate(db: Database, apply: ApplyMigration): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const { rows } = await db.query<{ version: number }>(`SELECT version FROM schema_migrations`);
  const applied = new Set(rows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.version)) await apply(migration);
  }
}

export const LATEST_MIGRATION = MIGRATIONS[MIGRATIONS.length - 1].version;

function wrapPglite(db: PGlite): Database {
  return {
    query: (sql, params) => db.query(sql, params as unknown[]),
    exec: (sql) => db.exec(sql),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>): Promise<T> => db.transaction((tx) => fn(tx)) as Promise<T>,
    close: () => db.close(),
  };
}

/**
 * TLS com o Postgres gerenciado. Por padrão o certificado é validado pela cadeia
 * do sistema. O Supabase assina o dele com uma autoridade própria, que não está
 * nessa cadeia: o caminho correto é `PGSSL_CA` com o certificado dela (baixado no
 * painel do Supabase). `PGSSLMODE=no-verify` mantém a conexão cifrada mas NÃO
 * confere quem está do outro lado: serve a uma demonstração, não à produção.
 */
export function pgSsl(
  env: Record<string, string | undefined> = process.env,
): false | { rejectUnauthorized: boolean; ca?: string } {
  if (env.PGSSLMODE === "disable") return false;
  const ca = env.PGSSL_CA?.replace(/\\n/g, "\n").trim();
  if (ca) return { rejectUnauthorized: true, ca };
  if (env.PGSSLMODE === "no-verify") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

/** O driver lê `sslmode` da URL e ele passaria por cima da opção `ssl`: tiramos da URL. */
export function withoutSslMode(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return url;
  }
}

// O driver do Postgres só é carregado quando há DATABASE_URL: sem ela, o pacote
// nunca entra no processo (a demonstração roda só com o banco embutido).
async function createPgPool(url: string): Promise<{ db: Database; apply: ApplyMigration }> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: withoutSslMode(url),
    ssl: pgSsl(),
    // Em hospedagem serverless cada instância abre as próprias conexões: poucas
    // por instância, para não esgotar o limite do banco.
    max: Number(process.env.PGPOOL_MAX ?? 5),
  });

  // Com pooler de conexões (Supabase, Neon), comandos soltos podem cair em
  // conexões diferentes: BEGIN, migração e COMMIT têm de usar a MESMA.
  const apply: ApplyMigration = async (migration) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [migration.version]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  const db: Database = {
    query: async (sql, params) => {
      const result = await pool.query(sql, params as unknown[]);
      return { rows: result.rows };
    },
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          query: async (sql, params) => {
            const result = await client.query(sql, params as unknown[]);
            return { rows: result.rows };
          },
        });
        await client.query("COMMIT");
        return out;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  return { db, apply };
}

/** Banco embutido (arquivo em disco ou memória). Usado nos testes e na demonstração. */
export async function createDb(dataDir?: string): Promise<Database> {
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;
  const db = wrapPglite(pglite);
  // Uma conexão só: BEGIN, migração e COMMIT vão sempre pelo mesmo caminho.
  await migrate(db, async (migration) => {
    await db.exec("BEGIN");
    try {
      await db.exec(migration.sql);
      await db.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [migration.version]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  });
  return db;
}

const globalForDb = globalThis as unknown as { __ecoDb?: Promise<Database> };

// Uma única instância por processo (também sobrevive ao hot reload do `next dev`).
export function getDb(): Promise<Database> {
  globalForDb.__ecoDb ??= (async () => {
    let db: Database | undefined;
    try {
      if (USING_MANAGED_POSTGRES) {
        const pg = await createPgPool(DATABASE_URL);
        db = pg.db;
        await migrate(db, pg.apply);
      } else {
        db = await createDb(path.join(DATA_DIR, "pgdata"));
      }
      const { seedReferenceData } = await import("./reference");
      await seedReferenceData(db);
      if (DEMO_MODE) {
        const { seedDemoIfEmpty } = await import("./seed");
        await seedDemoIfEmpty(db);
      }
      return db;
    } catch (error) {
      // A próxima tentativa abre um pool novo: sem fechar este, cada falha deixaria
      // conexões penduradas e o banco acabaria recusando todas.
      await db?.close().catch(() => undefined);
      throw error;
    }
  })().catch((error) => {
    globalForDb.__ecoDb = undefined;
    throw error;
  });
  return globalForDb.__ecoDb;
}

export function setDbForTests(db: Database): void {
  globalForDb.__ecoDb = Promise.resolve(db);
}
