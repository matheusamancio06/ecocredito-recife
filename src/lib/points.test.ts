// Os dados abertos trazem onze categorias de ponto; o app usa quatro. Nada pode vazar para as telas.
import { beforeEach, describe, expect, it } from "vitest";
import { setDbForTests } from "./db";
import { freshDb } from "./test-db";
import { POINT_CATEGORIES, POINT_CATEGORY_LABEL } from "./domain";
import { findPointByKind, getPoint, listPoints, nearestPoints } from "./points";
import { seedReferenceData } from "./reference";

describe("pontos de descarte e entrega", () => {
  beforeEach(async () => {
    const db = await freshDb();
    setDbForTests(db);
    await seedReferenceData(db);
  });

  it("só lista pontos que servem a alguma categoria do app, com rótulo para cada uma", async () => {
    const points = await listPoints();
    expect(points.length).toBeGreaterThan(200);
    for (const p of points) {
      expect(p.accepts.length).toBeGreaterThan(0);
      for (const category of p.accepts) {
        expect(POINT_CATEGORIES).toContain(category);
        expect(POINT_CATEGORY_LABEL[category]).toBeTruthy();
      }
    }
  });

  it("um ponto com atendente que aceita poda e volumosos mostra só o que o app usa", async () => {
    const eco = (await findPointByKind("ECOESTACAO"))!;
    expect(eco.staffed).toBe(true);
    expect(eco.accepts.every((a) => POINT_CATEGORIES.includes(a))).toBe(true);

    const same = (await getPoint(eco.id))!;
    expect(same.accepts).toEqual(eco.accepts);
  });

  it("acha os três pontos de entulho mais próximos, do mais perto para o mais longe", async () => {
    const points = await listPoints();
    const near = nearestPoints(points, { lat: -8.0476, lng: -34.877 }, "ENTULHO", 3);
    expect(near).toHaveLength(3);
    expect(near.every((p) => p.accepts.includes("ENTULHO"))).toBe(true);
    expect(near[0].distanceMeters).toBeLessThanOrEqual(near[1].distanceMeters);
    expect(near[1].distanceMeters).toBeLessThanOrEqual(near[2].distanceMeters);
  });
});
