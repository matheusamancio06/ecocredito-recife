export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const RECIFE_CENTER = { lat: -8.0476, lng: -34.877 };

// Tooltips do Leaflet interpretam strings como HTML; montamos o elemento com
// textContent para nunca injetar texto de terceiros como marcação.
export function textElement(text: string): HTMLElement {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}
