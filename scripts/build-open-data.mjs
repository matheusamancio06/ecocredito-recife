// Gera src/data/bairros.json e src/data/collection-points.json a partir dos
// dados abertos da Prefeitura do Recife (licença ODbL: exige atribuição).
//   node scripts/build-open-data.mjs
import fs from "node:fs";
import path from "node:path";

const SOURCES = {
  bairros:
    "https://dados.recife.pe.gov.br/dataset/1702c764-ec7a-4ef0-9861-8acd0e40c819/resource/5c67ce14-1799-40c4-a37c-9daa04d1761c/download/bairros-do-recife.geojson",
  pontos:
    "https://dados.recife.pe.gov.br/dataset/b666164e-b813-4ab7-9842-f3bbdcdda07e/resource/bab62397-be40-436a-bc9c-fe7c7bacc0c6/download/pontos-de-coleta.csv",
};

const OUT_DIR = path.join(process.cwd(), "src", "data");
fs.mkdirSync(OUT_DIR, { recursive: true });

const META = {
  license: "Open Data Commons Open Database License (ODbL)",
  attribution: "Portal de Dados Abertos da Prefeitura do Recife (dados.recife.pe.gov.br)",
  generatedAt: new Date().toISOString().slice(0, 10),
};

async function download(url, asText = true) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar ${url}: ${response.status}`);
  return asText ? response.text() : response.arrayBuffer();
}

const round = (n) => Math.round(n * 1e5) / 1e5;

function meters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------- bairros
function buildBairros(geojson) {
  const neighborhoods = geojson.features.map((feature) => {
    const p = feature.properties;
    const polygons =
      feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [feature.geometry.coordinates];
    return {
      name: (p.EBAIRRNOMEOF || p.EBAIRRNOME).trim(),
      rpa: p.CRPAAACODI ?? null,
      // [lng, lat], 5 casas decimais (~1 m)
      polygons: polygons.map((poly) => poly.map((ring) => ring.map(([lng, lat]) => [round(lng), round(lat)]))),
    };
  });
  return { ...META, source: SOURCES.bairros, neighborhoods };
}

// ---------------------------------------------------------------- pontos
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const headers = lines[0].split(";").map((h) => h.replace(/"/g, "").trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function kindOf(row) {
  const text = strip(`${row.observacao} ${row.endereco}`);
  if (/ecoestac/.test(text)) return "ECOESTACAO";
  if (/ecoponto/.test(text)) return "ECOPONTO";
  if (/pev/.test(text)) return "PEV";
  if (/cooperativa/.test(text)) return "COOPERATIVA";
  return "OUTRO";
}

const ACCEPT_RULES = [
  ["RECICLAVEL", /reciclav|metal|papel|plastic|pastico|vidro|isopor/],
  ["ELETRONICO", /eletro|eletron/],
  ["OLEO", /oleo/],
  ["ENTULHO", /constru|metralha|entulho/],
  ["VOLUMOSO", /movel|moveis|eletrodomestic|utensilio/],
  ["PODA", /poda/],
  ["ORGANICO", /organico/],
  ["PILHAS_BATERIAS", /pilha|bateria/],
  ["PNEU", /pneu/],
  ["MEDICAMENTO", /medicamento/],
  ["LAMPADA", /lampada/],
];

function acceptsOf(raw) {
  const text = strip(raw);
  return ACCEPT_RULES.filter(([, rx]) => rx.test(text)).map(([code]) => code);
}

function buildPoints(csvText) {
  // A mesma unidade aparece em várias linhas (uma por tipo de resíduo, às vezes
  // com coordenadas ligeiramente diferentes): unifica pontos do mesmo tipo a
  // menos de 40 m, somando o que cada linha aceita.
  const merged = [];
  for (const row of parseCsv(csvText)) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -8.2 || lat > -7.9 || lng < -35.05 || lng > -34.8) continue;

    const kind = kindOf(row);
    const accepts = acceptsOf(row.tiporesiduo);

    const existing = merged.find((p) => p.kind === kind && meters(p, { lat, lng }) <= 40);
    if (existing) {
      existing.accepts = [...new Set([...existing.accepts, ...accepts])];
      if (row.observacao.length > existing.name.length && !/^Ponto de coleta/.test(row.observacao)) {
        existing.name = row.observacao;
      }
      if (row.tiporesiduo && !existing.rawTypes.includes(row.tiporesiduo)) existing.rawTypes.push(row.tiporesiduo);
      continue;
    }

    merged.push({
      kind,
      name: row.observacao || (kind === "OUTRO" ? `Ponto de coleta (${row.tiporesiduo || "diversos"})` : kind),
      neighborhood: row.bairro || null,
      address: [row.endereco, row.complemento].filter(Boolean).join(", ") || null,
      lat: round(lat),
      lng: round(lng),
      accepts,
      rawTypes: row.tiporesiduo ? [row.tiporesiduo] : [],
    });
  }

  const points = merged.map((point, index) => ({ id: `pt-${index + 1}`, ...point }));
  return { ...META, source: SOURCES.pontos, points };
}

const bairros = buildBairros(JSON.parse(await download(SOURCES.bairros)));
fs.writeFileSync(path.join(OUT_DIR, "bairros.json"), JSON.stringify(bairros));

const pontos = buildPoints(await download(SOURCES.pontos));
fs.writeFileSync(path.join(OUT_DIR, "collection-points.json"), JSON.stringify(pontos, null, 1));

const kinds = pontos.points.reduce((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
console.log(`bairros: ${bairros.neighborhoods.length}`);
console.log(`pontos: ${pontos.points.length}`, kinds);
