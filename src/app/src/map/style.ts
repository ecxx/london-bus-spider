// prod_design 5.2: the basemap, the CARTO key, and the change of the colour scheme.
import type { RequestParameters, StyleSpecification } from "maplibre-gl";
import type { Scheme } from "../state/signals";
import { LAYERS, SOURCES } from "./layers";

const STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"; // Positron
const STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"; // Dark Matter

export const styleUrl = (s: Scheme): string => (s === "dark" ? STYLE_DARK : STYLE_LIGHT);

// The style, the tiles, the glyphs and the sprites are on basemaps.cartocdn.com and its subdomains.
const CARTO_HOST = /(^|\.)basemaps\.cartocdn\.com$/;

// Each request to CARTO has the key of the build (__CARTO_KEY__). The style from CARTO can contain a key
// in its URLs already: set the parameter, do not add a second one.
export function transformRequest(url: string): RequestParameters | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (!CARTO_HOST.test(u.hostname)) return undefined;
  u.searchParams.set("key", __CARTO_KEY__);
  return { url: u.toString() };
}

// A change of the colour scheme copies the sources and the layers of the client (map/layers.ts) into
// the new style, above the layers of the basemap.
export function keepClientLayers(prev: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!prev) return next;
  const sources = { ...next.sources };
  for (const id of SOURCES) if (prev.sources[id]) sources[id] = prev.sources[id];
  const layers = [...next.layers, ...prev.layers.filter((l) => LAYERS.includes(l.id))];
  return { ...next, sources, layers };
}
