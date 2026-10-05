import { describe, expect, it } from "vitest";
import { haversineMeters, isWithinRecifeArea } from "./geo";

describe("haversineMeters", () => {
  it("é zero para o mesmo ponto", () => {
    expect(haversineMeters({ lat: -8.05, lng: -34.88 }, { lat: -8.05, lng: -34.88 })).toBe(0);
  });

  it("calcula ~111 m para 0,001 grau de latitude", () => {
    const d = haversineMeters({ lat: -8.05, lng: -34.88 }, { lat: -8.049, lng: -34.88 });
    expect(d).toBeGreaterThan(108);
    expect(d).toBeLessThan(114);
  });
});

describe("isWithinRecifeArea", () => {
  it("aceita o centro do Recife e rejeita coordenadas de outro lugar", () => {
    expect(isWithinRecifeArea({ lat: -8.0476, lng: -34.877 })).toBe(true);
    expect(isWithinRecifeArea({ lat: -23.55, lng: -46.63 })).toBe(false);
    expect(isWithinRecifeArea({ lat: 0, lng: 0 })).toBe(false);
  });
});
