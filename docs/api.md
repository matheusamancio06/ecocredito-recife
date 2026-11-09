# Arquitetura e endpoints

EcoCrédito Recife · Checkpoints 2 e 3 da AV2.

## Visão geral

O aplicativo é um **Next.js** (App Router) com **PostgreSQL**. Front-end e back-end vivem no mesmo projeto, mas em
camadas separadas:

```
 Navegador (PWA)                         Servidor (Next.js)                        Banco
 ───────────────                         ──────────────────                        ─────
 componentes React  ── formulário ──►  server actions  ─┐
 (src/components)   ── fetch POST ──►  rotas /api/*    ─┼─► regras (src/lib) ──► PostgreSQL
 páginas            ◄── HTML/JSON ───  páginas (leitura)┘     repo.ts, credits.ts      (Supabase)
```

| Camada | Pasta | Papel |
|---|---|---|
| Interface | `src/components`, `src/app/**/page.tsx` | Telas, formulários, mapa, fila offline |
| Entrada (API) | `src/app/api/*`, `src/app/actions.ts`, `src/app/wallet-actions.ts` | Valida a sessão e o perfil, limita tentativas, chama as regras |
| Regras de negócio | `src/lib/*.ts` | Registro de entulho, EcoCoins, troca por Capiba, privacidade |
| Persistência | `src/lib/db.ts`, `src/lib/sql.ts`, `database/*.sql` | Conexão, migrações, scripts |

**Como o front-end consome o back-end.** De três jeitos, todos passando pela camada de entrada, que confere login e perfil:
1. **Rotas REST** (`/api/...`), chamadas por `fetch`. Usadas onde é preciso um endereço fixo (envio de registro,
   inclusive o que ficou na fila offline do aparelho, fotos, exportação de dados, saúde).
2. **Server actions**: cada ação abaixo vira uma requisição POST feita pelo Next.js quando o formulário é enviado.
3. **Leitura de dados nas páginas**: as páginas rodam no servidor e chamam as funções de `src/lib` direto, sem
   uma requisição HTTP extra. Por isso não há `GET /api/registros`: a lista chega pronta na página.

## Rotas REST

| Método e caminho | Quem pode | O que faz | Respostas |
|---|---|---|---|
| `POST /api/ocorrencias` | Cidadão com o aviso de privacidade aceito | Cria um registro de entulho. Corpo `multipart/form-data`: `lat`, `lng`, `photo`, `note` (opcional). Se já há registro aberto perto, o envio é tratado como confirmação. | 200 `{ok, reportId, url}` · 400 envio inválido · 401 sem sessão · 403 outro perfil ou sem consentimento |
| `GET /api/fotos/{nome}` | Quem estiver logado e puder ver aquela foto (dono, gestão) | Devolve a imagem | 200 · 401 · 404 |
| `GET /api/minha-conta/dados` | Qualquer usuário logado | Baixa todos os dados da própria conta em JSON (LGPD), inclusive trocas por Capiba | 200 · 401 |
| `GET /api/saude` | Público | Confere o banco e a versão das migrações | 200 `{ok, banco, migracao}` · 503 |
| `GET /api/auth/govbr/login` e `/callback` | Público | Login Único gov.br (só onde há credenciais) | redireciona · 503 sem configuração |
| `POST /api/demo/login` | Público, **só com `DEMO_MODE=1`** | Login simulado (usado pelo teste de fumaça) | 200 · 400 · 404 em produção |

## Server actions

| Ação | Perfil | O que faz |
|---|---|---|
| `loginAsPersona`, `logout`, `logoutEverywhere` | todos | Entrar (demonstração), sair e encerrar todas as sessões |
| `acceptConsentAction` | logado | Registra o aceite do aviso de privacidade |
| `deleteAccountAction` | logado | Exclui a conta (anonimiza os dados) |
| `closeReportAction` | Gestão de coleta | Dá baixa em um registro (`BAIXADA` ou `IMPROCEDENTE`), com foto e nota opcionais |
| `issueQrAction` | Cidadão | Gera o código de uso único (QR Code), válido por 2 minutos, até 20 por 10 min |
| `lookupCodeAction` | Operador | Confere o código sem consumi-lo e mostra quem é o cidadão |
| `registerDeliveryAction` | Operador | Registra a entrega (material e peso) e credita os EcoCoins no livro-razão |
| `exchangeCapibaAction` | Cidadão | Troca EcoCoins por Moeda Capiba (simulada): débito, crédito e estorno se falhar. Até 10 por hora |

## Páginas por perfil

| Perfil | Páginas |
|---|---|
| Público | `/`, `/login`, `/onde-descartar`, `/privacidade` |
| Cidadão | `/reportar`, `/minhas-ocorrencias`, `/ocorrencias/{id}`, `/carteira`, `/minha-conta`, `/consentimento` |
| Operador | `/operador` |
| Gestão de coleta | `/gestor` |

## Segurança aplicada em toda entrada

- Sessão no servidor (tabela `sessions`), cookie assinado; perfil conferido em cada rota e ação.
- Limites: tentativas de código QR e troca por Capiba (tabela `rate_events`) e número de registros por hora.
- Validação dos dados com `zod` e restrições `CHECK` no banco.
- Cabeçalhos de segurança e política de conteúdo (conferidos pelo teste de fumaça).

## Como testar

`npm test` roda os 107 testes das regras contra um Postgres embutido. Com o app no ar,
`node scripts/smoke.mjs <url>` confere as rotas, a permissão por perfil e os cabeçalhos num servidor de verdade.
