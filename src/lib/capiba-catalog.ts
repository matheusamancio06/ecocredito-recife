/**
 * O que a Moeda Capiba real compra na "feirinha" do app Conecta Recife.
 * Só consta o que foi publicado pela imprensa e pela Prefeitura (fontes abaixo);
 * os preços em Capibas de cada item não são divulgados, então não aparecem aqui.
 * A lista é de 2024: a oferta muda, e o app é a fonte atual.
 */
export type CatalogGroup = { title: string; items: string[] };

export const CAPIBA_CATALOG: CatalogGroup[] = [
  { title: "Transporte", items: ["Créditos do VEM (ônibus)", "Créditos do BikePE (bicicletas)", "Cupom da 99", "Uber", "LadyDriver"] },
  { title: "Compras", items: ["Vale-compras em empresas parceiras (como o Assaí Atacadista)"] },
  { title: "Lazer e eventos", items: ["Ingressos para espetáculos", "Passeios de catamarã", "Camisas e ingressos de jogos do Sport"] },
  { title: "Sorteio", items: ["Bilhetes da Sorte do Capiba da Virada 2025 (1 bilhete = 10 Capibas)"] },
];

export const CAPIBA_SOURCES: { label: string; url: string }[] = [
  { label: "Conecta Recife — Moeda Capiba", url: "https://conecta.recife.pe.gov.br/servico/949" },
  { label: "Prefeitura do Recife — Sport parceiro", url: "https://www2.recife.pe.gov.br/noticias/12/04/2024/sport-vira-parceiro-da-prefeitura-na-moeda-social-capiba" },
  { label: "Diario de Pernambuco, 02/04/2024", url: "https://www.diariodepernambuco.com.br/noticia/vidaurbana/2024/04/conheca-a-moeda-digital-social-lancada-pelo-recife-e-saiba-como-ganhar.html" },
  { label: "Impacta Nordeste, 04/12/2024", url: "https://impactanordeste.com.br/capiba-a-moeda-social-gamificada-de-recife/" },
];
