"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { OSM_ATTRIBUTION, OSM_TILES, RECIFE_CENTER, textElement } from "./leafletShared";

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  color?: string;
  radius?: number;
}

const COLOR_POINT = "#23310d";

export function MapView({
  points = [],
  focus,
  zoom = 13,
  className = "h-96",
  label,
}: {
  points?: MapPoint[];
  focus?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    let observer: ResizeObserver | undefined;

    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current) return;

      const center = focus ?? RECIFE_CENTER;
      map = L.map(containerRef.current, { center: [center.lat, center.lng], zoom, scrollWheelZoom: false });
      L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);

      // O container pode ganhar tamanho depois da criação do mapa (layout, abas).
      observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(containerRef.current);

      const bounds = L.latLngBounds([]);

      for (const point of points) {
        L.circleMarker([point.lat, point.lng], {
          radius: point.radius ?? 6,
          color: "#ffffff",
          weight: 2,
          fillColor: point.color ?? COLOR_POINT,
          fillOpacity: 0.9,
        })
          .bindTooltip(textElement(point.label))
          .addTo(map);
        bounds.extend([point.lat, point.lng]);
      }

      if (!focus && bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
    };
  }, [points, focus, zoom]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={label}
      className={`w-full overflow-hidden rounded-2xl border border-line ${className}`}
    />
  );
}
