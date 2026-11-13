// prod_design 5: the map. It reads the signals of state/ in effect functions. It makes no panel HTML.
import { effect } from "@preact/signals";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, LngLatLike, Map, PaddingOptions } from "maplibre-gl";
import { centre, fit, inFreeArea, ROUTE_FIT_MIN_ZOOM, STOP_VIEW_ZOOM, type Fit, type Viewport } from "../model/fit";
import type { LngLat } from "../model/geo";
import { MAX_ZOOM, MIN_ZOOM } from "../params";
import type { Core } from "../data/load";
import type { PatternKey, StopKey } from "../data/types";
import { mark, now, PERF_ON, sample, spanTouch, time } from "../perf";
import { core, cover, highlight, lines, reduceMotion, rowHover, scheme, view, wide, type Cover } from "../state/signals";
import { route } from "../state/route";
import { spider } from "../state/spider";
import { AttributionControl } from "./attributionControl";
import { readColors, type Colors } from "./colors";
import { EndLabels, StationNames, type PinBox } from "./endLabels";
import { homeSource } from "./home";
import { MapHover } from "./hover";
import { applyLayers, layerSpecs, SOURCES, type LayerState, type SourceId } from "./layers";
import { maplibregl } from "./maplibre";
import { overlayLayer } from "./overlay";
import { Pins } from "./pins";
import { routeMap, type RouteMap } from "./route";
import { spiderMap, type AfterSection, type SpiderMap } from "./spider";
import { stationsSource } from "./stations";
import { keepClientLayers, styleUrl, transformRequest } from "./style";

const START: { center: LngLatLike; zoom: number } = { center: [-0.1248, 51.5081], zoom: 12 }; // Charing Cross (app_design 5.2)
// The centre of the free area stays in this box: the stops of the network, with a small margin
// (app_design 5.2). Thus the map does not show areas far from the network, and it does not load
// their basemap tiles.
const CENTRE_BOX = { west: -0.6, south: 51.22, east: 0.33, north: 51.7 };
const FOLD_MS = 250; // the map move of a fold on a phone (app_design 4.2)
const foldEase = (t: number) => 1 - (1 - t) ** 5; // starts fast and stops slowly: near --fold-ease, the curve of the panel (app_design 4.2)
const SETTLE_MS = 150; // after a zoom, the end labels and the station names wait this time with no move (prod_design 5.8)
const WHEEL_END_MS = 120; // after a fit, the wheel is muted until no wheel event comes for this time (prod_design 5.8)
// prod_design 5.8: the zoom speed of the demo (160 px of wheel for one zoom level; a trackpad pinch: 90 px).
// MapLibre gives log2(2 / (1 + exp(-|px| x rate))) zoom levels for the px of one frame.
const WHEEL_ZOOM_RATE = 1 / 82; // a wheel step of 100 px gives 0.625 zoom levels, as in the demo
const TRACKPAD_ZOOM_RATE = 1 / 87; // small px: 120 px for one zoom level. MapLibre has one rate for a trackpad scroll and a pinch.
const PIN_PX = 20; // the diameter of a stop pin, and of the selected pin (app_design 3.4)
const PIN_SEL_PX = 36;
const HOME_CHUNK = 20; // the home lines that go to the map in one task (prod_design 5.3)

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

// prod_design 9, step 15: the main-thread time of a setData. MapLibre copies the data for its worker in
// a microtask after the call, point by point. Thus measure to the next task.
function measureSetData(name: string, f: () => void): void {
  if (!PERF_ON) return f();
  const t0 = now();
  f();
  setTimeout(() => sample(name, now() - t0));
}

// MapLibre GL JS 6 needs WebGL 2.
function hasWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

// app_design 5.2: the zoom range, and the centre in CENTRE_BOX. The centre is the middle of the free
// area (the map padding). This function replaces the MapLibre constrain, thus it also clamps the zoom.
function constrain(c: maplibregl.LngLat, zoom: number): { center: maplibregl.LngLat; zoom: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    center: new maplibregl.LngLat(clamp(c.lng, CENTRE_BOX.west, CENTRE_BOX.east), clamp(c.lat, CENTRE_BOX.south, CENTRE_BOX.north)),
    zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
  };
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
      transformConstrain: constrain,
    });
  } catch (err) {
    console.error(err);
    return noMap(container);
  }
  if (PERF_ON) window.__map = map;

  // prod_design 5.1: no rotation, no pitch.
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  map.scrollZoom.setWheelZoomRate(WHEEL_ZOOM_RATE);
  map.scrollZoom.setZoomRate(TRACKPAD_ZOOM_RATE);

  // prod_design 5.8: mute after a fit. A wheel event during easeTo stops the fit, and the tail of a
  // trackpad gesture continues for approximately 1 second. The listener is on the container, in the
  // capture phase, so that it comes before the listener of MapLibre on the canvas container.
  let muteTimer = 0; // not 0: the wheel is muted
  const muteWheel = () => {
    clearTimeout(muteTimer);
    muteTimer = window.setTimeout(() => (muteTimer = 0), WHEEL_END_MS);
  };
  container.addEventListener(
    "wheel",
    (e) => {
      if (!muteTimer) return;
      e.preventDefault();
      e.stopPropagation();
      muteWheel();
    },
    { capture: true, passive: false },
  );

  // The bottom controls: the last one added is at the top.
  map.addControl(new AttributionControl(), "bottom-right");
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  // prod_design 5.7: a fit. It comes in the next frame, after the panel has its height for the new view
  // (the map padding). refit: the fit in progress. A change of the cover that is not a fold (the sheet
  // gets a different height) does the fit again, because a change of the padding would stop it.
  let refit: (() => void) | null = null;
  let fitPending = false; // a fit waits for the next frame
  map.on("moveend", () => (refit = null));
  const moveTo = (calc: (v: Viewport) => Fit | null) => {
    const run = () => {
      fitPending = false;
      const c = cover.peek();
      const f = calc({ width: container.clientWidth, height: container.clientHeight, cover: c, wide: wide.peek() });
      if (!f) return;
      map.stop();
      muteWheel();
      refit = run;
      map.easeTo({ center: f.center, zoom: f.zoom, padding: padding(c), ...(reduceMotion.peek() ? { duration: 0 } : {}) });
    };
    fitPending = true;
    requestAnimationFrame(run);
  };
  if (PERF_ON) window.__fitBusy = () => fitPending || refit !== null;

  // prod_design 5.7: the map padding is the area that the panel covers. Thus START is at the middle of
  // the free area. After a fold on a phone, the centre stays at the middle of the new free area.
  map.setPadding(padding(cover.peek()));
  let applied = cover.peek();
  effect(() => {
    const c = cover.value;
    // Only the fold flag changed (the panel renders again during a fold): the padding is already set,
    // and a new easeTo would stop the move in progress.
    if (c.top === applied.top && c.right === applied.right && c.bottom === applied.bottom && c.left === applied.left) return;
    applied = c;
    if (refit) return refit();
    const animate = c.fold && !wide.peek() && !reduceMotion.peek();
    map.easeTo({ padding: padding(c), duration: animate ? FOLD_MS : 0, easing: foldEase });
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
    // A route view with a context: the stops of its station are pins, not a dot (app_design 6.5).
    const station = s?.station ?? route.peek()?.station ?? null;
    return { served: s ? [...s.served] : null, station, highlight: highlight.peek() };
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
      measureSetData("stationsSet", () => source("stations").setData(stationsSource(d)));
      stationsSet = true;
    }
    if (d && l && !homeSet) {
      homeSet = true;
      void addHome(time("homeBuild", () => homeSource(d, l)).features);
    }
  };
  // prod_design 5.3: the home lines go to the source in groups of HOME_CHUNK, one group at a time.
  // MapLibre copies the data for its worker on the main thread, point by point: one
  // setData of all the lines stops the page for approximately 1 s on the reference phone. Each group
  // waits for the one before it, because MapLibre joins the updates that wait into one copy. The layer
  // shows after the last group: a visible layer loads its tiles again after each group.
  let homeAdding = false;
  const addHome = async (features: FeatureCollection["features"]) => {
    let total = 0;
    homeAdding = true;
    setHomeVisibility();
    for (let i = 0; i < features.length; i += HOME_CHUNK) {
      await new Promise<void>((ok) => whenStyle(ok));
      const t0 = now();
      const done = source("home").updateData({ add: features.slice(i, i + HOME_CHUNK) });
      await new Promise((ok) => setTimeout(ok));
      sample("homeChunk", now() - t0); // prod_design 9, step 15
      total += now() - t0;
      await done; // the reply of the worker comes in a new task: the page can draw a frame before the next group
    }
    sample("homeSetData", total);
    homeAdding = false;
    setHomeVisibility();
    mark("homeSet");
  };
  effect(() => {
    void lines.value;
    if (core.value) whenStyle(syncData);
  });

  // The home lines show in the home view and the about view (app_design 6.1, 6.7).
  const setHomeVisibility = () => {
    if (!map.getLayer("home-lines")) return;
    const k = view.peek().kind;
    const show = !homeAdding && (k === "home" || k === "about");
    map.setLayoutProperty("home-lines", "visibility", show ? "visible" : "none");
  };
  effect(() => {
    void view.value;
    setHomeVisibility();
  });

  // The spider graph (app_design 6.4): the view source, the station dots, the pins, and one fit for
  // each spider graph, when its lines are loaded.
  let shown: SpiderMap | null = null;
  let sections: ReadonlyMap<PatternKey, AfterSection> | null = null;
  const hover = new MapHover(map, overlayLayer(), {
    core: () => core.peek(),
    sections: () => sections,
    ctx: () => spider.peek()?.ctx ?? null,
  });
  const pins = new Pins(map, { enter: (k, el) => hover.pinEnter(k, el), leave: () => hover.pinLeave() });
  const endLabels = new EndLabels(map);
  const names = new StationNames(map);

  // prod_design 5.8: the settle. After a move with a zoom, wait until no move starts for SETTLE_MS; after
  // a move with no zoom, at once. Then place the end labels and the station names. During a zoom, the
  // markers move with the map and do not change.
  const placeMarks = () => {
    const d = core.peek();
    if (!d) return;
    const s = spider.peek();
    const station = s?.station ?? route.peek()?.station ?? null;
    const boxes: PinBox[] = (s?.pins ?? []).map((k) => ({ at: [d.stops[k]![3], d.stops[k]![2]], size: k === s?.stop ? PIN_SEL_PX : PIN_PX }));
    endLabels.place(boxes);
    const placeNames = () => names.place(d, s ? s.served : null, station);
    placeNames();
    // The station names come from the rendered station dots: after a zoom, the tiles can still load.
    if (!map.loaded()) map.once("idle", placeNames);
  };
  let placedZoom = NaN;
  let settleTimer = 0;
  const settle = () => {
    clearTimeout(settleTimer);
    settleTimer = 0;
    placedZoom = map.getZoom();
    placeMarks();
  };
  if (PERF_ON) window.__settled = () => !settleTimer && placedZoom === map.getZoom() && !map.isMoving() && map.loaded();
  map.on("movestart", () => clearTimeout(settleTimer));
  map.on("moveend", () => {
    clearTimeout(settleTimer);
    if (map.getZoom() !== placedZoom) settleTimer = window.setTimeout(settle, SETTLE_MS);
    else settle();
  });
  let shownFor: unknown = null;
  let fitted: unknown = null;
  let routeShown: RouteMap | null = null;
  const at = (d: Core, k: StopKey): LngLat => [d.stops[k]![3], d.stops[k]![2]];
  const syncView = () => {
    const d = core.peek();
    const l = lines.peek();
    const s = spider.peek();
    const r = route.peek();
    const key = l ? (s ?? r) : null;
    if (key !== shownFor) {
      shownFor = key;
      shown = d && s && l ? spiderMap(d, l, s) : null;
      routeShown = d && r && l ? routeMap(d, l, r) : null;
      sections = shown && new globalThis.Map(shown.after.map((a) => [a.pid, a]));
      source("view").setData(shown?.data ?? routeShown?.data ?? EMPTY);
      source("route-stops").setData(routeShown?.stops ?? EMPTY);
      // app_design 6.4: the end-label groups of the stop view, then their placement at the zoom now.
      // The station view has no end labels.
      if (d && s && s.ctx.kind === "stop" && shown) endLabels.set(d, shown.after, s.selected.map((k) => at(d, k)), s.ctx);
      else endLabels.clear();
      settle();
      spanTouch("spider");
    }
    applyLayers(map, colors, layerState());
    if (d && s && shown && fitted !== s) {
      fitted = s;
      const focus = s.selected.map((k) => at(d, k));
      // app_design 5.7: if the selected stops are all in the free area, do not move the map. If not,
      // put their middle at the middle of the free area, at STOP_VIEW_ZOOM.
      moveTo((v) => (inFreeArea(v, focus.map((p) => map.project(p))) ? null : centre(focus, STOP_VIEW_ZOOM)));
    }
    // app_design 5.7: a route view fits the selected pattern, with the stop or the stops of the station
    // that opened it as the focus.
    if (d && r && routeShown && fitted !== r) {
      fitted = r;
      const bounds = routeShown.bounds;
      const focus = [...r.here].map((k) => at(d, k));
      moveTo((v) => fit(v, bounds, focus, ROUTE_FIT_MIN_ZOOM));
    }
  };
  effect(() => {
    const d = core.value;
    const s = spider.value;
    const r = route.value;
    void lines.value;
    if (d) pins.set(d, s?.pins ?? r?.pins ?? [], s?.stop ?? r?.stop ?? null);
    whenStyle(syncView);
  });

  // A new view closes the tooltip and the route menu.
  effect(() => {
    void view.value;
    hover.end();
    hover.menu.close();
  });

  // app_design 6.4: the highlighted routes (from the map hover, a list row or a row of the route menu).
  effect(() => {
    endLabels.mark(highlight.value);
    whenStyle(() => applyLayers(map, colors, layerState()));
  });

  // app_design 5.6: the hover ring at the stop or the station of the row under the pointer.
  const syncRing = () => {
    const d = core.peek();
    const r = rowHover.peek();
    const at = d && r ? (r.kind === "stop" ? d.stops[r.key] && [d.stops[r.key]![3], d.stops[r.key]![2]] : d.stations[r.key] && [d.stations[r.key]![2], d.stations[r.key]![1]]) : null;
    source("hover").setData(at ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: at } } : EMPTY);
  };
  effect(() => {
    void rowHover.value;
    whenStyle(syncRing);
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
