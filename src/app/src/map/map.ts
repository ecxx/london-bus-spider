// prod_design 5: the map. It reads the signals of state/ in effect functions. It makes no panel HTML.
import { effect } from "@preact/signals";
import type { GeoJSONSource, LngLatLike, Map } from "maplibre-gl";
import { MAX_ZOOM, MIN_ZOOM } from "../params";
import { core, cover, lines, reduceMotion, scheme, view, wide } from "../state/signals";
import { AttributionControl } from "./attributionControl";
import { lineColor, readColors, type Colors } from "./colors";
import { homeSource } from "./home";
import { maplibregl } from "./maplibre";
import { keepClientLayers, styleUrl, transformRequest } from "./style";

const START: { center: LngLatLike; zoom: number } = { center: [-0.1248, 51.5081], zoom: 12 }; // Charing Cross (app_design 5.2)
const FOLD_MS = 250; // the map move of a fold on a phone (app_design 4.2)

// MapLibre GL JS 6 needs WebGL 2.
function hasWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

// prod_design 5.1: with no WebGL, no map. The panel operates with no map.
function noMap(container: HTMLElement): void {
  container.replaceChildren();
  const msg = document.createElement("div");
  msg.className = "no-map";
  msg.setAttribute("role", "status");
  msg.textContent = "This browser cannot show the map.";
  container.append(msg);
}

export function startMap(container: HTMLElement): void {
  // The free area for the CSS of the map: the attribution, the message with no WebGL.
  effect(() => {
    container.style.setProperty("--cover-left", `${cover.value.left}px`);
    container.style.setProperty("--cover-bottom", `${cover.value.bottom}px`);
  });

  if (!hasWebGL2()) return noMap(container);
  let map: Map;
  try {
    map = new maplibregl.Map({
      container,
      style: styleUrl(scheme.peek()),
      transformRequest,
      center: START.center,
      zoom: START.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxPitch: 0,
      attributionControl: false,
      renderWorldCopies: false,
    });
  } catch (err) {
    console.error(err);
    return noMap(container);
  }
  if (import.meta.env.DEV) window.__map = map;

  // prod_design 5.1: no rotation, no pitch.
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  // The bottom controls: the last one added is at the top.
  map.addControl(new AttributionControl(), "bottom-right");
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  // prod_design 5.7: the map padding is the area that the panel covers. Thus START is at the middle of
  // the free area. After a fold on a phone, the centre stays at the middle of the new free area.
  map.setPadding(cover.peek());
  effect(() => {
    const c = cover.value;
    const animate = c.fold && !wide.peek() && !reduceMotion.peek();
    map.easeTo({ padding: { top: c.top, right: c.right, bottom: c.bottom, left: c.left }, duration: animate ? FOLD_MS : 0 });
  });

  let colors: Colors = readColors();
  // The client can add sources and layers after "style.load". (isStyleLoaded() can be false after it,
  // while the sprites load, and then "style.load" does not come again.)
  let styleReady = false;
  let pending: (() => void)[] = [];
  map.on("style.load", () => {
    styleReady = true;
    const fs = pending;
    pending = [];
    for (const f of fs) f();
  });
  const whenStyle = (f: () => void) => (styleReady ? f() : pending.push(f));

  // The home lines (prod_design 5.3, 5.4): after the lines load. Shown in the home view and the about view.
  const addHome = () => {
    const d = core.peek();
    const l = lines.peek();
    if (!d || !l || map.getSource("home")) return;
    map.addSource("home", { type: "geojson", data: homeSource(d, l) });
    map.addLayer({
      id: "home-lines",
      type: "line",
      source: "home",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": lineColor(colors), "line-width": 2, "line-opacity": 0.22 },
    });
    setHomeVisibility();
  };
  const setHomeVisibility = () => {
    if (!map.getLayer("home-lines")) return;
    const k = view.peek().kind;
    map.setLayoutProperty("home-lines", "visibility", k === "home" || k === "about" ? "visible" : "none");
  };
  effect(() => {
    if (core.value && lines.value) whenStyle(addHome);
  });
  effect(() => {
    void view.value;
    setHomeVisibility();
  });

  // prod_design 5.2: a change of the colour scheme changes the basemap and keeps the layers of the client.
  const applyColors = () => {
    colors = readColors();
    if (map.getLayer("home-lines")) map.setPaintProperty("home-lines", "line-color", lineColor(colors));
  };
  let first = true;
  effect(() => {
    const s = scheme.value;
    if (first) {
      first = false;
      return;
    }
    styleReady = false;
    pending.push(applyColors);
    // diff: false. The two styles have the same layer ids, so a diff would give no "style.load".
    map.setStyle(styleUrl(s), { diff: false, transformStyle: keepClientLayers });
  });
}
