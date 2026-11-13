// prod_design 5.3 and 5.4: the sources and the layers of the client, from the bottom, above the basemap.
// layerSpecs gives each layer with its paint and filter for the current state. applyLayers sets them
// again: after a change of the colour scheme or of the view. (MapLibre ignores a value that did not change.)
import type { ExpressionSpecification, FilterSpecification, LayerSpecification, Map } from "maplibre-gl";
import type { Highlight } from "../model/hover";
import { lineColor, type Colors } from "./colors";

export const SOURCES = ["home", "view", "stations", "route-stops", "hover"] as const;
export type SourceId = (typeof SOURCES)[number];

const DASH_SPIDER = [1.5, 1.75]; // 6 px, 7 px at 4 px (app_design 3.6, in units of the line width)
const DASH_SPIDER_HIGH = [1, 7 / 6]; // the same 6 px, 7 px at the 6 px of the highlight layer
const DASH_ROUTE_OTHER = [2, 2.33]; // 6 px, 7 px at 3 px
const DASH_ROUTE_SELECTED = [1.6, 1.6]; // 8 px, 8 px at 5 px
const DIM = 0.12; // the opacity of the lines that are not highlighted (app_design 6.4)
const SOLID = [1, 0];
const STOP_ZOOM = 13; // the station dots start at this zoom (app_design 5.4)
const DIM_ZOOM = 14; // the station dots that a spider graph does not serve start at this zoom

// The state of the view that the paint and the filters use.
export interface LayerState {
  served: string[] | null; // a spider graph: the station keys of the red rings. null: no spider graph.
  station: string | null; // the selected station: its stops show as pins, not as a dot (app_design 5.5)
  highlight: Highlight | null; // the highlighted routes (app_design 6.4)
}

const dash = (d: number[]): ExpressionSpecification => ["match", ["get", "cls"], "limited", ["literal", d], ["literal", SOLID]];
const part = (p: string): ExpressionSpecification => ["==", ["get", "part"], p];
const ROUND = { "line-join": "round", "line-cap": "round" } as const;
const NONE: FilterSpecification = part("");

// The features of the highlighted routes: the lines, and the direction if the highlight has one.
function highlighted(h: Highlight): ExpressionSpecification {
  const lines: ExpressionSpecification = ["in", ["get", "line"], ["literal", h.lines]];
  return h.dir ? ["all", lines, ["==", ["get", "dir"], h.dir]] : lines;
}

// app_design 5.4 and 5.5. The demo (Leaflet) draws the stroke on the radius; MapLibre draws it outside
// the radius. Thus circle-radius is the radius of the table less half the stroke, and the dots have the
// same size as in the demo.
//   zoom 13 to 14: radius 3.5, stroke 1.5 (2.5 for a red ring). A dimmed dot is not shown.
//   zoom 14 to 16: radius 3.5, stroke 1.5 (2.5).
//   from zoom 16:  radius 6, stroke 2 (2.5).
// Only the dimmed dots of a spider graph have less opacity. With no spider graph (the home view), all
// the dots have full opacity.
function stationDots(c: Colors, s: LayerState): LayerSpecification {
  const on: ExpressionSpecification | null = s.served ? ["in", ["get", "k"], ["literal", s.served]] : null;
  const pick = (red: number, other: number) => (on ? (["case", on, red, other] as ExpressionSpecification) : other);
  const fade = (dim: number) => (on ? (["case", on, 1, dim] as ExpressionSpecification) : 1);
  const band = (r: number, w: number, hideDim: boolean) => ({
    radius: pick(r - 1.25, hideDim && on ? 0 : r - w / 2),
    width: pick(2.5, hideDim && on ? 0 : w),
  });
  const z13 = band(3.5, 1.5, true);
  const z14 = band(3.5, 1.5, false);
  const z16 = band(6, 2, false);
  const layer: LayerSpecification = {
    id: "station-dots",
    type: "circle",
    source: "stations",
    minzoom: STOP_ZOOM,
    paint: {
      "circle-radius": ["step", ["zoom"], z13.radius, DIM_ZOOM, z14.radius, 16, z16.radius] as ExpressionSpecification,
      "circle-stroke-width": ["step", ["zoom"], z13.width, DIM_ZOOM, z14.width, 16, z16.width] as ExpressionSpecification,
      "circle-color": c.stopFill,
      "circle-opacity": fade(0.5),
      "circle-stroke-color": on ? ["case", on, c.red, c.stopRing] : c.stopRing,
      "circle-stroke-opacity": fade(0.3),
    },
  };
  if (s.station) layer.filter = ["!=", ["get", "k"], s.station];
  return layer;
}

// app_design 5.4 and 6.5: the stop dots of the route view, at all zooms. Radius 3.5 px below zoom 12,
// 4.5 px to zoom 14, then 5.5 px; a 2 px ring below zoom 12, else 2.5 px. The first and the last stop
// (end) are 2 px larger, with a 3 px ring and the line colour fill. circle-radius is the radius less half
// the ring (see stationDots). A zoom expression must be the outer expression: thus step, then case.
function routeStops(c: Colors): LayerSpecification {
  const end: ExpressionSpecification = ["get", "end"];
  const band = (r: number, w: number) => ["case", end, r + 2 - 3 / 2, r - w / 2] as ExpressionSpecification;
  const ring = (w: number) => ["case", end, 3, w] as ExpressionSpecification;
  return {
    id: "route-stops",
    type: "circle",
    source: "route-stops",
    layout: { "circle-sort-key": ["case", end, 1, 0] },
    paint: {
      "circle-radius": ["step", ["zoom"], band(3.5, 2), 12, band(4.5, 2.5), 14, band(5.5, 2.5)] as ExpressionSpecification,
      "circle-stroke-width": ["step", ["zoom"], ring(2), 12, ring(2.5)] as ExpressionSpecification,
      "circle-color": ["case", end, lineColor(c), c.stopFill],
      "circle-stroke-color": lineColor(c),
    },
  };
}

export function layerSpecs(c: Colors, s: LayerState): LayerSpecification[] {
  return [
    {
      id: "home-lines",
      type: "line",
      source: "home",
      layout: ROUND,
      paint: { "line-color": lineColor(c), "line-width": 2, "line-opacity": 0.22 },
    },
    {
      // app_design 6.5: the other patterns of the line in the route view.
      id: "route-other",
      type: "line",
      source: "view",
      filter: part("other"),
      layout: ROUND,
      paint: { "line-color": lineColor(c), "line-width": 3, "line-opacity": 0.2, "line-dasharray": dash(DASH_ROUTE_OTHER) },
    },
    {
      id: "spider-behind",
      type: "line",
      source: "view",
      filter: part("behind"),
      layout: ROUND,
      paint: { "line-color": c.behind, "line-width": 3, "line-opacity": 0.55 },
    },
    {
      // The longest section is at the bottom: a short route that runs along a longer one is on top of it.
      id: "spider-after",
      type: "line",
      source: "view",
      filter: part("after"),
      layout: { ...ROUND, "line-sort-key": ["-", ["get", "len"]] },
      paint: {
        "line-color": lineColor(c),
        "line-width": 4,
        "line-opacity": s.highlight ? ["case", highlighted(s.highlight), 0.8, DIM] : 0.8,
        "line-dasharray": dash(DASH_SPIDER),
      },
    },
    {
      // app_design 6.5: the selected pattern of the route view.
      id: "route-selected",
      type: "line",
      source: "view",
      filter: part("selected"),
      layout: ROUND,
      paint: { "line-color": lineColor(c), "line-width": 5, "line-opacity": 0.95, "line-dasharray": dash(DASH_ROUTE_SELECTED) },
    },
    stationDots(c, s),
    routeStops(c),
    {
      // A copy of the highlighted sections after the stop: 2 px wider, opaque. Not interactive.
      id: "highlight",
      type: "line",
      source: "view",
      filter: s.highlight ? ["all", part("after"), highlighted(s.highlight)] : NONE,
      layout: { ...ROUND, "line-sort-key": ["-", ["get", "len"]] },
      paint: { "line-color": lineColor(c), "line-width": 6, "line-opacity": 1, "line-dasharray": dash(DASH_SPIDER_HIGH) },
    },
    {
      // app_design 5.6: radius 9 px and a 2.5 px --ink line, to the middle of the line (see stationDots).
      id: "hover-ring",
      type: "circle",
      source: "hover",
      paint: { "circle-radius": 9 - 1.25, "circle-opacity": 0, "circle-stroke-width": 2.5, "circle-stroke-color": c.ink },
    },
  ];
}

export const LAYERS = layerSpecs({ red: "", night: "", behind: "", stopFill: "", stopRing: "", ink: "" }, { served: null, station: null, highlight: null }).map((l) => l.id);

// Set the paint properties and the filters of each layer again.
export function applyLayers(map: Map, c: Colors, s: LayerState): void {
  for (const spec of layerSpecs(c, s)) {
    if (!map.getLayer(spec.id)) continue;
    for (const [k, v] of Object.entries(spec.paint ?? {})) map.setPaintProperty(spec.id, k as Parameters<Map["setPaintProperty"]>[1], v);
    map.setFilter(spec.id, "filter" in spec ? (spec.filter ?? null) : null);
  }
}
