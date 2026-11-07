// prod_design 5.2: the basemap, the CARTO key, and the change of the colour scheme.
import type { RequestParameters, StyleSpecification } from "maplibre-gl";
import type { Scheme } from "../state/signals";

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

// The sources and the layers of the client, from the bottom (prod_design 5.3, 5.4). A change of the
// colour scheme copies them into the new style.
export const CLIENT_SOURCES = ["home"];
export const CLIENT_LAYERS = ["home-lines"];

export function keepClientLayers(prev: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!prev) return next;
  const sources = { ...next.sources };
  for (const id of CLIENT_SOURCES) if (prev.sources[id]) sources[id] = prev.sources[id];
  const layers = [...next.layers, ...prev.layers.filter((l) => CLIENT_LAYERS.includes(l.id))];
  return { ...next, sources, layers };
}
