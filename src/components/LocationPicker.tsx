"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { OSM_ATTRIBUTION, OSM_TILES, RECIFE_CENTER } from "./leafletShared";

const PIN_SVG =
  '<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="#3F6B12"/>' +
  '<circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>';

interface Position {
  lat: number;
  lng: number;
}

export function LocationPicker() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const placeRef = useRef<((lat: number, lng: number, zoom?: number) => void) | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;

    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, { center: [RECIFE_CENTER.lat, RECIFE_CENTER.lng], zoom: 13 });
      L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);

      observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(containerRef.current);

      const icon = L.divIcon({ className: "", html: PIN_SVG, iconSize: [28, 36], iconAnchor: [14, 36] });
      let marker: Marker | undefined;

      const place = (lat: number, lng: number, zoom?: number) => {
        if (!map) return;
        if (!marker) {
          marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
          marker.on("dragend", () => {
            const p = marker!.getLatLng();
            setPosition({ lat: p.lat, lng: p.lng });
          });
        } else {
          marker.setLatLng([lat, lng]);
        }
        if (zoom) map.setView([lat, lng], zoom);
        setPosition({ lat, lng });
      };

      map.on("click", (event) => place(event.latlng.lat, event.latlng.lng));
      mapRef.current = map;
      placeRef.current = place;
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      placeRef.current = null;
    };
  }, []);

  function locateMe() {
    setMessage(null);
    if (!("geolocation" in navigator)) {
      setMessage("Este aparelho não informa a localização. Toque no mapa para marcar o local.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (result) => placeRef.current?.(result.coords.latitude, result.coords.longitude, 18),
      () => setMessage("Não foi possível obter a localização. Toque no mapa para marcar o local."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-base font-semibold">Onde está o entulho?</span>
        <button
          type="button"
          onClick={locateMe}
          className="min-h-11 rounded-xl border border-brand-strong px-4 text-sm font-bold text-brand-strong hover:bg-brand-soft"
        >
          Usar minha localização
        </button>
      </div>

      <div
        ref={containerRef}
        role="application"
        aria-label="Mapa para marcar o local do entulho"
        className="h-72 w-full overflow-hidden rounded-2xl border border-line"
      />

      <input type="hidden" name="lat" value={position ? position.lat.toFixed(6) : ""} />
      <input type="hidden" name="lng" value={position ? position.lng.toFixed(6) : ""} />

      <p className="mt-2 text-sm text-ink-muted" aria-live="polite">
        {position
          ? `Local marcado (${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}). Arraste o pino para ajustar.`
          : "Toque no mapa para marcar o local exato."}
      </p>
      {message && (
        <p role="alert" className="mt-1 text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
