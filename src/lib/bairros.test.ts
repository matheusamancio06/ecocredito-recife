import { describe, expect, it } from "vitest";
import { interiorPoint, listNeighborhoods, neighborhoodAt, randomPointIn } from "./bairros";

describe("bairros oficiais do Recife", () => {
  it("carrega os 94 bairros com RPA", () => {
    const all = listNeighborhoods();
    expect(all).toHaveLength(94);
    expect(all.every((n) => n.name.length > 0)).toBe(true);
    expect(all.filter((n) => n.rpa !== null).length).toBeGreaterThan(90);
  });

  it("resolve o bairro por ponto-em-polígono", () => {
    expect(neighborhoodAt({ lat: -8.1178, lng: -34.9006 })?.name).toBe("Boa Viagem");
  });

  it("devolve null para pontos no mar ou fora do município", () => {
    expect(neighborhoodAt({ lat: -8.1, lng: -34.8 })).toBeNull();
    expect(neighborhoodAt({ lat: -23.55, lng: -46.63 })).toBeNull();
  });

  it("gera pontos internos que pertencem ao próprio bairro", () => {
    for (const name of ["Ibura", "Casa Amarela", "Afogados", "Imbiribeira"]) {
      const inside = interiorPoint(name)!;
      expect(neighborhoodAt(inside)?.name).toBe(name);

      let seed = 42;
      const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const random = randomPointIn(name, rand)!;
      expect(neighborhoodAt(random)?.name).toBe(name);
    }
  });
});
