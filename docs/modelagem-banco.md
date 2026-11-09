# Modelagem lógica do banco de dados

EcoCrédito Recife · PostgreSQL 14+ · Checkpoint 1 da AV2.

Os scripts estão em [`database/schema.sql`](../database/schema.sql) (criação) e
[`database/seed.sql`](../database/seed.sql) (dados de demonstração simulados). Os dois são gerados pelo
próprio aplicativo (`npm run db:export`) a partir das migrações em `src/lib/db.ts`, então o DDL entregue é
exatamente o que roda em produção (Supabase).

## Diagrama entidade-relacionamento

```mermaid
erDiagram
    COLLECTION_POINTS ||--o{ USERS : "operador atende em"
    COLLECTION_POINTS ||--o{ DELIVERIES : "recebe"
    USERS ||--o{ REPORTS : "registra (reporter_id)"
    USERS ||--o{ REPORTS : "dá baixa (closed_by)"
    REPORTS ||--o{ REPORTS : "reincidência (recurrence_of)"
    REPORTS ||--o{ REPORT_CONFIRMATIONS : "recebe"
    USERS ||--o{ REPORT_CONFIRMATIONS : "confirma"
    USERS ||--o{ QR_TOKENS : "gera"
    USERS ||--o{ DELIVERIES : "entrega (user_id)"
    USERS ||--o{ DELIVERIES : "pesa (operator_id)"
    MATERIAL_RATES ||--o{ DELIVERIES : "define o valor"
    DELIVERIES ||--o| CREDIT_LEDGER : "gera crédito"
    USERS ||--o{ CREDIT_LEDGER : "tem lançamentos"
    USERS ||--o{ CAPIBA_EXCHANGES : "troca"
    CAPIBA_EXCHANGES ||--o{ CREDIT_LEDGER : "débito e estorno"
    USERS ||--o{ SESSIONS : "abre"

    COLLECTION_POINTS {
        text id PK
        text kind "PEV, ECOPONTO, ECOESTACAO, COOPERATIVA, OUTRO"
        text name
        text neighborhood
        text address
        double lat
        double lng
        text_array accepts "materiais aceitos"
        boolean staffed "tem atendente"
    }
    USERS {
        text id PK
        text gov_sub UK "identificador do login gov.br"
        text cpf_hash "CPF nunca é guardado em claro"
        text display_name
        text role "CIDADAO, OPERADOR, GESTOR"
        text point_id FK
        timestamptz consent_at
        timestamptz deleted_at
    }
    REPORTS {
        text id PK
        text code UK "OC-2026-000001"
        text reporter_id FK
        text status "ABERTA, BAIXADA, IMPROCEDENTE"
        double lat
        double lng
        text photo_before
        text photo_after
        text recurrence_of FK
        timestamptz closed_at
        text closed_by FK
    }
    REPORT_CONFIRMATIONS {
        text report_id PK
        text user_id PK
        timestamptz created_at
    }
    MATERIAL_RATES {
        text material PK
        text label
        text unit "KG ou L"
        int points_per_unit
    }
    QR_TOKENS {
        text code PK
        text user_id FK
        timestamptz expires_at
        timestamptz used_at
    }
    DELIVERIES {
        text id PK
        text user_id FK
        text point_id FK
        text operator_id FK
        text material FK
        double quantity
        int points
        text qr_code UK
    }
    CREDIT_LEDGER {
        text id PK
        text user_id FK
        int amount "positivo ou negativo"
        text reason
        text delivery_id FK_UK
        text capiba_exchange_id FK
    }
    CAPIBA_EXCHANGES {
        text id PK
        text user_id FK
        int ecocoins
        int capibas
        text status "PENDENTE, CREDITADA, FALHOU"
        text protocol
        boolean simulated
        timestamptz settled_at
    }
    SESSIONS {
        text id PK
        text user_id FK
        timestamptz expires_at
        timestamptz revoked_at
    }
    RATE_EVENTS {
        text id PK
        text bucket
        timestamptz created_at
    }
    PHOTOS {
        text name PK
        text mime
        bytea bytes
    }
```

`RATE_EVENTS` (limite de tentativas por chave) e `PHOTOS` (arquivos das fotos) não têm chave estrangeira:
`rate_events.bucket` é um texto como `capiba:<usuário>`, e `reports.photo_before/photo_after` apontam para
`photos.name` por nome, sem FK, para a foto poder ficar em disco ou no banco conforme o ambiente.

## Decisões de modelagem

| Decisão | Por quê |
|---|---|
| **Saldo de EcoCoins = soma de `credit_ledger`** | Livro-razão só de acréscimos: nunca se edita um lançamento, só se cria outro (inclusive o estorno). O saldo é sempre auditável. |
| **`credit_ledger.delivery_id` único** | Uma entrega gera no máximo um crédito, mesmo se a tela enviar duas vezes. |
| **Índice único parcial `credit_ledger_capiba_debit_idx`** | Cada troca por Moeda Capiba debita uma vez só (`reason = 'TROCA_CAPIBA'`). |
| **`capiba_exchanges.status`** | Troca em duas etapas (PENDENTE → CREDITADA ou FALHOU). Se o crédito da Capiba falhar, o débito é estornado. |
| **`users.cpf_hash` em vez do CPF** | LGPD: o CPF não é guardado; só um hash com pimenta, para reconhecer a mesma pessoa. |
| **`users.deleted_at` e `consent_at`** | Exclusão de conta e registro do aceite do aviso de privacidade. |
| **`CHECK` nas colunas de estado** | O banco recusa valor fora da lista (`status`, `role`, `kind`, `unit`), mesmo se o código errar. |
| **`reports.recurrence_of`** | Auto-relacionamento: liga um novo registro ao anterior no mesmo local (reincidência). |
| **`collection_points.accepts text[]`** | Lista curta e fixa de materiais por ponto; evita uma tabela de ligação sem consulta que a justifique. |
| **Índices em `(lat, lng)`, `status`, `created_at`, `user_id`** | Consultas de ponto mais próximo, fila por situação e histórico por pessoa. |
| **Sem exclusão em cascata, exceto `report_confirmations`** | Registros, entregas e lançamentos são histórico e não somem junto com outra linha. |

Normalização: tabelas em 3FN. Os campos repetidos de propósito são `deliveries.points`, que guarda o valor
creditado no dia (a tabela de valores pode mudar depois), e `reports.neighborhood`, que guarda o bairro
calculado na hora do registro.

## Como reproduzir

```bash
createdb ecocredito
psql ecocredito -f database/schema.sql
psql ecocredito -f database/seed.sql
```

Para gerar os dois arquivos de novo (PowerShell): `$env:DATA_DIR=".data-export"; $env:DEMO_MODE="1"; npm run db:export`.
