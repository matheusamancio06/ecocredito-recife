import { describe, expect, it } from "vitest";
import { formatAge, formatDate, formatNumber } from "./format";

describe("formatNumber", () => {
  it("usa ponto nos milhares e vírgula nos decimais, como no Brasil", () => {
    expect(formatNumber(3582)).toBe("3.582");
    expect(formatNumber(4.5, 1)).toBe("4,5");
  });
});

describe("formatDate", () => {
  it("usa o fuso de Recife (UTC-3)", () => {
    expect(formatDate(new Date("2026-10-01T02:00:00Z"))).toBe("30/09/2026");
  });
});

describe("formatAge", () => {
  const base = new Date("2026-10-01T12:00:00Z");

  it('diz "hoje" quando é a mesma data', () => {
    expect(formatAge(base, base)).toBe("hoje");
  });

  it('diz "há 1 dia" no singular', () => {
    const umDiaDepois = new Date("2026-10-02T12:00:00Z");
    expect(formatAge(base, umDiaDepois)).toBe("há 1 dia");
  });

  it("diz há N dias no plural", () => {
    const dozeDiasDepois = new Date("2026-10-13T12:00:00Z");
    expect(formatAge(base, dozeDiasDepois)).toBe("há 12 dias");
  });
});
