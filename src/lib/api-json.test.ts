import { describe, expect, it } from "vitest";
import { parseNumber, serializeReport } from "./api-json";
import type { Report } from "./repo";

const report: Report = {
  id: "r1",
  code: "OC-2026-000001",
  reporterId: "segredo-do-usuario",
  status: "BAIXADA",
  lat: -8.05,
  lng: -34.9,
  neighborhood: "Boa Viagem",
  note: "Na calçada",
  photoBefore: "a b.jpg",
  photoAfter: null,
  recurrenceOf: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  closedAt: new Date("2026-10-03T10:00:00Z"),
  closingNote: "Removido",
  confirmations: 2,
};

describe("serializeReport", () => {
  it("não expõe quem registrou e transforma fotos em endereços da API", () => {
    const out = serializeReport(report);
    expect(JSON.stringify(out)).not.toContain("segredo-do-usuario");
    expect(out.fotoAntes).toBe("/api/fotos/a%20b.jpg");
    expect(out.fotoDepois).toBeNull();
    expect(out.criadoEm).toBe("2026-10-01T10:00:00.000Z");
    expect(out.baixadoEm).toBe("2026-10-03T10:00:00.000Z");
    expect(out.situacao).toBe("BAIXADA");
  });

  it("registro aberto não tem data de baixa", () => {
    expect(serializeReport({ ...report, status: "ABERTA", closedAt: null, closingNote: null }).baixadoEm).toBeNull();
  });
});

describe("parseNumber", () => {
  it("aceita número dentro da faixa e recusa o resto", () => {
    expect(parseNumber("-8.05", -90, 90)).toBe(-8.05);
    expect(parseNumber("0", -90, 90)).toBe(0);
    for (const bad of [null, "", "  ", "abc", "91", "-91", "NaN", "Infinity"]) expect(parseNumber(bad, -90, 90)).toBeNull();
  });
});
