import raw from "../data/bairros.json";
import type { LatLng } from "./geo";

// Polígonos oficiais dos bairros do Recife (dados abertos da Prefeitura, ODbL).
// Cada polígono é uma lista de anéis [lng, lat]; o primeiro é o contorno e os
// demais são buracos.
type Ring = [number, number][];
type Polygon = Ring[];

interface RawNeighborhood {
  name: string;
  rpa: number | null;
  polygons: Polygon[];
}

interface PreparedPolygon {
  rings: Polygon;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface Neighborhood {
  name: string;
  rpa: number | null;
}

interface Prepared extends Neighborhood {
  polygons: PreparedPolygon[];
}

export const BAIRROS_ATTRIBUTION = (raw as unknown as { attribution: string }).attribution;

let cache: Prepared[] | undefined;

function prepared(): Prepared[] {
  cache ??= (raw as unknown as { neighborhoods: RawNeighborhood[] }).neighborhoods.map((n) => ({
    name: n.name,
    rpa: n.rpa,
    polygons: n.polygons.map((rings) => {
      const outer = rings[0];
      let minLng = Infinity;
      let minLat = Infinity;
      let maxLng = -Infinity;
      let maxLat = -Infinity;
      for (const [lng, lat] of outer) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      return { rings, minLng, minLat, maxLng, maxLat };
    }),
  }));
  return cache;
}

// Ray casting: conta quantas vezes um raio horizontal cruza as arestas.
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, polygon: PreparedPolygon): boolean {
  if (lng < polygon.minLng || lng > polygon.maxLng || lat < polygon.minLat || lat > polygon.maxLat) return false;
  const [outer, ...holes] = polygon.rings;
  return inRing(lng, lat, outer) && !holes.some((hole) => inRing(lng, lat, hole));
}

/** Bairro que contém o ponto, ou null (ex.: no mar, no rio ou fora do município). */
export function neighborhoodAt(point: LatLng): Neighborhood | null {
  for (const n of prepared()) {
    if (n.polygons.some((polygon) => inPolygon(point.lng, point.lat, polygon))) {
      return { name: n.name, rpa: n.rpa };
    }
  }
  return null;
}

export function listNeighborhoods(): Neighborhood[] {
  return prepared().map(({ name, rpa }) => ({ name, rpa }));
}

function largestPolygon(name: string): PreparedPolygon | null {
  const found = prepared().find((n) => n.name === name);
  if (!found) return null;
  const area = (p: PreparedPolygon) => (p.maxLng - p.minLng) * (p.maxLat - p.minLat);
  return found.polygons.reduce((best, p) => (area(p) > area(best) ? p : best));
}

/** Um ponto dentro do bairro, o mais próximo possível do centro da sua caixa. */
export function interiorPoint(name: string): LatLng | null {
  const polygon = largestPolygon(name);
  if (!polygon) return null;
  const centerLng = (polygon.minLng + polygon.maxLng) / 2;
  const centerLat = (polygon.minLat + polygon.maxLat) / 2;
  let best: LatLng | null = null;
  let bestDistance = Infinity;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lng = polygon.minLng + ((polygon.maxLng - polygon.minLng) * i) / steps;
      const lat = polygon.minLat + ((polygon.maxLat - polygon.minLat) * j) / steps;
      if (!inPolygon(lng, lat, polygon)) continue;
      const d = (lng - centerLng) ** 2 + (lat - centerLat) ** 2;
      if (d < bestDistance) {
        best = { lat, lng };
        bestDistance = d;
      }
    }
  }
  return best;
}

/** Ponto aleatório dentro de um bairro (amostragem por rejeição). */
export function randomPointIn(name: string, rand: () => number): LatLng | null {
  const polygon = largestPolygon(name);
  if (!polygon) return null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const lng = polygon.minLng + rand() * (polygon.maxLng - polygon.minLng);
    const lat = polygon.minLat + rand() * (polygon.maxLat - polygon.minLat);
    if (inPolygon(lng, lat, polygon)) return { lat, lng };
  }
  return interiorPoint(name);
}
