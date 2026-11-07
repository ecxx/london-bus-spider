// prod_design 5: the map. It reads the signals of state/ in effect functions. It makes no panel HTML.
import { effect } from "@preact/signals";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, LngLatLike, Map, PaddingOptions } from "maplibre-gl";
import { fit, FIT_MIN_ZOOM } from "../model/fit";
import type { Bounds, LngLat } from "../model/geo";
import { MAX_ZOOM, MIN_ZOOM } from "../params";
import { core, cover, lines, reduceMotion, scheme, view, wide, type Cover } from "../state/signals";
import { spider } from "../state/spider";
import { AttributionControl } from "./attributionControl";
import { readColors, type Colors } from "./colors";
import { homeSource } from "./home";
import { applyLayers, layerSpecs, SOURCES, type LayerState, type SourceId } from "./layers";
import { maplibregl } from "./maplibre";
import { Pins } from "./pins";
import { spiderMap, type SpiderMap } from "./spider";
import { stationsSource } from "./stations";
import { keepClientLayers, styleUrl, transformRequest } from "./style";

const START: { center: LngLatLike; zoom: number } = { center: [-0.1248, 51.5081], zoom: 12 }; // Charing Cross (app_design 5.2)
const FOLD_MS = 250; // the map move of a fold on a phone (app_design 4.2)

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

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

const padding = (c: Cover): PaddingOptions => ({ top: c.top, right: c.right, bottom: c.bottom, left: c.left });

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

  // prod_design 5.7: a fit. It comes in the next frame, after the panel has its height for the new view
  // (the map padding). refit: the fit in progress. A change of the cover that is not a fold (the sheet
  // gets a different height) does the fit again, because a change of the padding would stop it.
  let refit: (() => void) | null = null;
  let fitPending = false; // a fit waits for the next frame
  map.on("moveend", () => (refit = null));
  const fitTo = (bounds: Bounds, focus: LngLat[], minZoom: number) => {
    const run = () => {
      fitPending = false;
      const c = cover.peek();
      const f = fit({ width: container.clientWidth, height: container.clientHeight, cover: c, wide: wide.peek() }, bounds, focus, minZoom);
      if (!f) return;
      map.stop();
      refit = run;
      map.easeTo({ center: f.center, zoom: f.zoom, padding: padding(c), ...(reduceMotion.peek() ? { duration: 0 } : {}) });
    };
    fitPending = true;
    requestAnimationFrame(run);
  };
  if (import.meta.env.DEV) window.__fitBusy = () => fitPending || refit !== null;

  // prod_design 5.7: the map padding is the area that the panel covers. Thus START is at the middle of
  // the free area. After a fold on a phone, the centre stays at the middle of the new free area.
  map.setPadding(padding(cover.peek()));
  effect(() => {
    const c = cover.value;
    if (!c.fold && refit) return refit();
    const animate = c.fold && !wide.peek() && !reduceMotion.peek();
    map.easeTo({ padding: padding(c), duration: animate ? FOLD_MS : 0 });
  });

  let colors: Colors = readColors();
  // The client can add sources and layers after "style.load". (isStyleLoaded() can be false after it,
  // while the sprites load, and then "style.load" does not come again.)
  let styleReady = false;
  const pending = new Set<() => void>();
  const whenStyle = (f: () => void) => (styleReady ? f() : pending.add(f));
  const source = (id: SourceId) => map.getSource<GeoJSONSource>(id)!;
  const layerState = (): LayerState => {
    const s = spider.peek();
    return { served: s ? [...s.served] : null, station: s?.station ?? null };
  };

  // The sources, empty, and the layers in the order of layers.ts. After a change of the colour scheme,
  // keepClientLayers has copied them, with their data.
  map.on("style.load", () => {
    styleReady = true;
    for (const id of SOURCES) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY });
    for (const spec of layerSpecs(colors, layerState())) if (!map.getLayer(spec.id)) map.addLayer(spec);
    setHomeVisibility();
    const fs = [...pending];
    pending.clear();
    for (const f of fs) f();
  });

  // The data that does not change: the stations, then the home lines (prod_design 5.3).
  let stationsSet = false;
  let homeSet = false;
  const syncData = () => {
    const d = core.peek();
    const l = lines.peek();
    if (d && !stationsSet) {
      source("stations").setData(stationsSource(d));
      stationsSet = true;
    }
    if (d && l && !homeSet) {
      source("home").setData(homeSource(d, l));
      homeSet = true;
    }
  };
  effect(() => {
    void lines.value;
    if (core.value) whenStyle(syncData);
  });

  // The home lines show in the home view and the about view (app_design 6.1, 6.7).
  const setHomeVisibility = () => {
    if (!map.getLayer("home-lines")) return;
    const k = view.peek().kind;
    map.setLayoutProperty("home-lines", "visibility", k === "home" || k === "about" ? "visible" : "none");
  };
  effect(() => {
    void view.value;
    setHomeVisibility();
  });

  // The spider graph (app_design 6.4): the view source, the station dots, the pins, and one fit for
  // each spider graph, when its lines are loaded.
  const pins = new Pins(map);
  let shown: SpiderMap | null = null;
  let shownFor: unknown = null;
  let fitted: unknown = null;
  const syncView = () => {
    const d = core.peek();
    const l = lines.peek();
    const s = spider.peek();
    const key = s && l ? s : null;
    if (key !== shownFor) {
      shownFor = key;
      shown = d && s && l ? spiderMap(d, l, s) : null;
      source("view").setData(shown?.data ?? EMPTY);
    }
    applyLayers(map, colors, layerState());
    if (d && s && shown && fitted !== s) {
      fitted = s;
      const focus = s.selected.map((k): LngLat => [d.stops[k]![3], d.stops[k]![2]]);
      fitTo(shown.bounds, focus, FIT_MIN_ZOOM);
    }
  };
  effect(() => {
    const d = core.value;
    const s = spider.value;
    void lines.value;
    if (d) pins.set(d, s?.pins ?? [], s?.stop ?? null);
    whenStyle(syncView);
  });

  // prod_design 5.2: a change of the colour scheme changes the basemap and keeps the layers of the client.
  const applyColors = () => {
    colors = readColors();
    applyLayers(map, colors, layerState());
  };
  let first = true;
  effect(() => {
    const s = scheme.value;
    if (first) {
      first = false;
      return;
    }
    styleReady = false;
    pending.add(applyColors);
    // diff: false. The two styles have the same layer ids, so a diff would give no "style.load".
    map.setStyle(styleUrl(s), { diff: false, transformStyle: keepClientLayers });
  });
}
