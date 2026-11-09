-- EcoCrédito Recife: criação do banco (PostgreSQL 14+).
-- Gerado por scripts/export-sql.ts a partir das migrações do aplicativo; não edite à mão.
-- Pode ser executado de novo: usa IF NOT EXISTS.

BEGIN;

-- ===== Migração 1 =====
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

-- ===== Migração 2 =====
-- Troca de EcoCoins por Moeda Capiba (moeda social digital da Prefeitura do Recife,
-- usada no app Conecta Recife). A troca nasce PENDENTE, debita o saldo no livro-razão
-- e vira CREDITADA quando a Capiba confirma; se falhar, o débito é estornado.
CREATE TABLE IF NOT EXISTS capiba_exchanges (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  ecocoins int NOT NULL CHECK (ecocoins > 0),
  capibas int NOT NULL CHECK (capibas > 0),
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','CREDITADA','FALHOU')),
  protocol text,
  simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS capiba_exchanges_user_idx ON capiba_exchanges (user_id, created_at);

-- Lançamentos de troca e de estorno apontam para a troca que os gerou.
ALTER TABLE credit_ledger ADD COLUMN IF NOT EXISTS capiba_exchange_id text REFERENCES capiba_exchanges(id);
-- Cada troca debita uma vez só.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_capiba_debit_idx
  ON credit_ledger (capiba_exchange_id) WHERE reason = 'TROCA_CAPIBA';

COMMIT;
