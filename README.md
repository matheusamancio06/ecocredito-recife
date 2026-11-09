# EcoCrédito Recife (PWA)

Protótipo acadêmico para o desafio **Gestão digital de resíduos sólidos urbanos** (Banco de Oportunidades da Prefeitura do Recife). O app faz **duas coisas**, de propósito:

1. **Registrar entulho** jogado na rua: o cidadão manda uma foto e marca o ponto no mapa; a **gestão de coleta** vê a fila, remove e **dá baixa**.
2. **Reciclar para acumular EcoCoins**: o cidadão entrega recicláveis numa cooperativa ou ecoestação, mostra o QR Code, o operador pesa e os EcoCoins entram no saldo. Os EcoCoins podem ser **trocados por Moeda Capiba**, a moeda social digital da Prefeitura do Recife.

Não substitui o Conecta Recife/156. Uma versão maior (triagem por equipes, painel de pontos críticos, catálogo de resgate de benefícios, avisos, integração com o 156, análise de foto por IA) foi construída antes e depois **retirada de propósito**, para o app ficar fácil de usar e de explicar. Ela está guardada na pasta `ecocredito-pwa-versao-completa`.

## Equipe e papéis (AV2)

Equipe de 3 integrantes, ADS · Uninassau Recife Graças · Prof. Breno Holanda.

| Integrante | Papel | Responsabilidades |
| --- | --- | --- |
| Matheus Amancio | Líder técnico e desenvolvedor full-stack | Participou de todo o projeto: arquitetura, back-end (rotas e regras), banco de dados (modelagem, scripts), integração com o front-end, publicação e a troca por Moeda Capiba |
| Rômulo César | Testes / QA | Testes do fluxo completo (registro de entulho, reciclagem e troca por Capiba), conferência dos perfis e das regras, relato de falhas |
| Cauã Tavares | Front-end e apresentação | Telas e usabilidade no celular, e a apresentação e o pitch da entrega final |

## Perfis (login gov.br simulado no modo demonstração)

| Perfil | O que vê e faz |
| --- | --- |
| Cidadão | Três abas: **Registrar entulho** (foto + mapa, inclusive sem internet), **Meus registros** (aberto ou baixado, com antes e depois) e **Reciclar** (saldo, **troca por Moeda Capiba**, saldo de Capibas e lista do que a Capiba compra, QR Code, histórico) |
| Gestão de coleta | Uma tela: resumo de 4 números, mapa e fila dos registros abertos (mais antigos primeiro) com **Dar baixa**, e a lista dos que já tiveram baixa |
| Operador de ponto | Em cooperativa ou ecoestação: confere o QR Code do cidadão, pesa e credita EcoCoins |

## Regras que sustentam o fluxo

**Registro de entulho**
- **Deduplicação (30 m)**: se já existe registro aberto no ponto, a segunda pessoa apenas confirma. A confirmação sobe a prioridade e o registro aparece também em "Meus registros" dela.
- **Reincidência (60 dias)**: se o ponto teve baixa recentemente e o entulho voltou, o novo registro é marcado; a gestão vê o selo.
- **Baixa**: só a gestão de coleta dá baixa, uma vez por registro. Resultado: *entulho removido* ou *não procedente* (com motivo). A foto do "depois" é opcional.
- **Fila offline**: sem internet, o registro e a foto ficam guardados no aparelho (IndexedDB) e são enviados sozinhos quando a conexão volta, com a data da captura preservada.
- O cidadão vê, na página do registro, os três pontos de descarte de entulho mais próximos (dados abertos).

**EcoCrédito**
- Código de uso único (10 caracteres, 120 s, invalidado ao gerar outro; ganha 10 min depois de conferido pelo operador), entrega pesada por operador de ponto com atendente, livro-razão só de acréscimos, limite diário por pessoa, e cada ponto só aceita os materiais que recebe.
- **Troca por Moeda Capiba**: o cidadão troca EcoCoins por Capibas (100 EcoCoins = 1 Capiba, **taxa de exemplo**; de 1 a 50 por troca, até 10 trocas por hora). A Capiba é emitida pela Prefeitura e vive no app Conecta Recife; por isso o crédito passa por um *gateway* (`src/lib/capiba.ts`). A troca é feita em duas etapas: o débito e o registro (PENDENTE) numa transação que trava a pessoa, e depois o pedido de crédito. Se o crédito falhar, o débito é **estornado uma única vez**. Duas trocas ao mesmo tempo não gastam o mesmo saldo.
- **A integração é simulada.** Só existe o gateway de demonstração (ativo com `DEMO_MODE=1`): ele devolve um protocolo `SIM-…` e a tela avisa que é simulação. Sem ele, a troca fica indisponível. Creditar Capiba de verdade exige acordo com a Prefeitura e uma API do Conecta Recife, que este protótipo não tem; trocar o gateway não mexe no resto.
- **Suas Capibas e o que dá para trocar.** A carteira mostra o saldo de Capibas recebidas por aqui (soma das trocas creditadas; simulado) e a lista do que a Capiba real compra na "feirinha" do Conecta Recife (`src/lib/capiba-catalog.ts`). Só consta o que a Prefeitura e a imprensa publicaram, em 2024:

  | Categoria | Itens |
  |---|---|
  | Transporte | créditos do VEM, créditos do BikePE, cupom da 99, Uber, LadyDriver |
  | Compras | vale-compras em empresas parceiras (como o Assaí Atacadista) |
  | Lazer e eventos | ingressos para espetáculos, passeios de catamarã, camisas e ingressos de jogos do Sport |
  | Sorteio | Bilhetes da Sorte do Capiba da Virada 2025 (1 bilhete = 10 Capibas) |

  O preço dos demais itens em Capibas não é divulgado, então não aparece. A oferta muda: o app (Destaques > Moeda Capiba > feirinha) é a fonte atual. **Não dá para gastar Capibas neste aplicativo**; o gasto é no Conecta Recife. Fontes: [página oficial](https://conecta.recife.pe.gov.br/servico/949), [Prefeitura, parceria com o Sport](https://www2.recife.pe.gov.br/noticias/12/04/2024/sport-vira-parceiro-da-prefeitura-na-moeda-social-capiba), [Diário de Pernambuco, 02/04/2024](https://www.diariodepernambuco.com.br/noticia/vidaurbana/2024/04/conheca-a-moeda-digital-social-lancada-pelo-recife-e-saiba-como-ganhar.html), [Impacta Nordeste, 04/12/2024](https://impactanordeste.com.br/capiba-a-moeda-social-gamificada-de-recife/) e [Blog do Finfa, 30/12/2024](https://blogdofinfa.com.br/2024/12/capiba-da-virada-2025-usuarios-da-moeda-digital-do-recife-podem-concorrer-a-premios.html), que reproduz a nota da Prefeitura sobre o sorteio.
- Quem não trocou continua com o saldo guardado, sem validade.

## Banco de dados (AV2)

- Modelagem lógica, diagrama e decisões: [`docs/modelagem-banco.md`](docs/modelagem-banco.md).
- Criação das tabelas: [`database/schema.sql`](database/schema.sql). Dados de demonstração simulados: [`database/seed.sql`](database/seed.sql). Os dois são gerados com `npm run db:export` a partir das migrações do app.

## Dados reais (Portal de Dados Abertos da Prefeitura do Recife, licença ODbL)

- **94 bairros com polígonos oficiais** (`src/data/bairros.json`): o bairro de cada registro vem de ponto-em-polígono.
- **229 pontos de descarte e coleta** (16 cooperativas, 11 ecoestações, 55 PEVs, 49 ecopontos e outros) em `src/data/collection-points.json`. O app lista os que aceitam entulho, recicláveis, eletrônicos ou óleo (219 dos 229); as demais categorias (poda, pneus, lâmpadas etc.) ficam no banco, mas não aparecem nas telas.
- Para atualizar as bases: `node scripts/build-open-data.mjs`.

## Privacidade e segurança

- Fotos reduzidas no aparelho e normalizadas no servidor: a rotação do EXIF é aplicada aos pixels e todos os metadados (inclusive o GPS da câmera) são descartados. **Nenhuma análise automática é feita na foto**: o app pede para não fotografar pessoas e placas, e só a gestão de coleta, quem registrou e quem confirmou o ponto veem a imagem.
- Aviso de privacidade com aceite versionado, exportação dos próprios dados (JSON) e encerramento de conta com anonimização.
- Sessões registradas no servidor: dá para encerrar um aparelho ou todos.
- Limite de tentativas (códigos de EcoCoins, envios por hora), CPF guardado só como HMAC com chave própria, cabeçalhos de segurança e política de conteúdo em produção.

## Produção

- **Postgres gerenciado**: defina `DATABASE_URL` e o app usa o `pg` no lugar do banco embutido (as migrações rodam sozinhas na primeira requisição). Sem ela, continua no PGlite em disco.
- **Fotos**: com `DATABASE_URL` definida, as fotos passam a ser guardadas no próprio banco (`PHOTO_STORAGE=db`), porque hospedagem serverless não tem disco que sobreviva ao deploy. Force com `PHOTO_STORAGE=fs|db`.
- **Saúde**: `GET /api/saude` responde 503 se o banco não atende ou se as migrações estão atrás do código.
- **Obrigatórios**: `SESSION_SECRET` e `IDENTITY_PEPPER` (este nunca deve mudar depois de ter usuários — é o que mantém a identidade de cada pessoa).
- Câmera, localização e instalação do PWA exigem HTTPS (ou `localhost`).
- **Login gov.br real** (`GOVBR_*`, ver `.env.example`): fluxo OIDC com código e PKCE conforme o roteiro oficial. **Ainda não foi exercitado no gov.br**: as credenciais só podem ser solicitadas por um órgão público. Novos usuários entram como cidadãos; os perfis de gestão de coleta e de operador são concedidos pela Prefeitura.

## O que depende da Prefeitura

- **Moeda Capiba**: acordo com a Prefeitura/Porto Digital, API para creditar Capibas no Conecta Recife, a taxa de conversão e o limite de emissão. A Capiba tem a Prefeitura como emissora; este sistema só pede o crédito.
- **Identificação na troca**: para creditar a pessoa certa no Conecta Recife seria preciso um identificador comum (hoje o sistema guarda só um código derivado do CPF). Isso exige base legal e ajuste do aviso de privacidade.
- **Quem é gestão de coleta e quem é operador**: hoje só existem no modo demonstração; no ambiente real, a concessão desses perfis precisa de um processo definido pelo órgão.
- **Credenciais**: gov.br (órgão público).
- **LGPD**: controlador, Encarregado de Dados (DPO) e Relatório de Impacto (RIPD) do serviço. Enquanto for protótipo acadêmico, não envie dados reais.
- Valores de EcoCoins por material e limites de uso são de exemplo (`src/lib/domain.ts`).

## Fontes

- [Bairros do Recife](https://dados.recife.pe.gov.br/pt_BR/dataset/area-urbana/resource/5c67ce14-1799-40c4-a37c-9daa04d1761c) e [Pontos de coleta seletiva e resíduos](https://dados.recife.pe.gov.br/dataset/pontos-de-coleta-seletiva), Portal de Dados Abertos da Prefeitura do Recife (ODbL).
- [Moeda Capiba, moeda social digital da Prefeitura do Recife no app Conecta Recife](https://movimentoeconomico.com.br/tecnologia/2024/04/02/conheca-a-capiba-a-moeda-social-digital-criada-no-recife-e-pioneira-no-pais/) (reportagem de abril de 2024; a página oficial e as regras vigentes devem ser conferidas com a Prefeitura).
- [Solicitar remoção de entulhos](https://conecta.recife.pe.gov.br/servico/245), Emlurb.
- [Roteiro técnico do Login Único gov.br](https://acesso.gov.br/roteiro-tecnico/iniciarintegracao.html).
