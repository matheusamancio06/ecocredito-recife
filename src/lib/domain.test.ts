import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATES,
  MATERIALS,
  MATERIAL_CATEGORY,
  POINT_CATEGORIES,
  STATUSES,
  STATUS_LABEL,
  isMaterial,
  isOpen,
  pointsFor,
} from "./domain";

describe("situação do registro de entulho", () => {
  it("só o registro aberto aguarda a gestão de coleta", () => {
    expect(isOpen("ABERTA")).toBe(true);
    expect(isOpen("BAIXADA")).toBe(false);
    expect(isOpen("IMPROCEDENTE")).toBe(false);
  });

  it("toda situação tem um rótulo para a tela", () => {
    for (const status of STATUSES) expect(STATUS_LABEL[status]).toBeTruthy();
  });
});

describe("EcoCoins por material", () => {
  it("cada material tem tabela e aponta para uma categoria de ponto usada no app", () => {
    for (const material of MATERIALS) {
      expect(DEFAULT_RATES[material].pointsPerUnit).toBeGreaterThan(0);
      expect(POINT_CATEGORIES).toContain(MATERIAL_CATEGORY[material]);
    }
  });

  it("arredonda para EcoCoins inteiros", () => {
    expect(pointsFor(2.5, 50)).toBe(125);
    expect(pointsFor(0.333, 30)).toBe(10);
  });

  it("reconhece só materiais conhecidos", () => {
    expect(isMaterial("VIDRO")).toBe(true);
    expect(isMaterial("OURO")).toBe(false);
    expect(isMaterial(42)).toBe(false);
  });
});
