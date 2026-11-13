// app_design 5.7 and prod_design 5.7: the centre and the zoom of a fit (route view) and of the move of a
// station view or a stop view. Web Mercator with 512 px tiles.
import { extend, isEmpty, latOf, lonOf, mercX, mercY, type Bounds, type LngLat } from "./geo";

const FIT_EDGE = 40; // px kept free at the left, right and bottom edges of the free area
const FIT_TOP = 64; // px kept free at the top edge (the end labels are above the end of their line)
const FIT_BUTTONS = 16; // px more at the right edge on a wide screen, for the zoom buttons
const FIT_SMALL = 100; // px: if the area is less than this, keep only FIT_TIGHT at each edge
const FIT_TIGHT = 8;
const FIT_MAX_ZOOM = 16;
export const STOP_VIEW_ZOOM = 14; // the zoom of the move of a station view or a stop view
export const ROUTE_FIT_MIN_ZOOM = 10; // the minimum zoom of the fit of a route view
const TILE = 512;

// The window, and the part of it that the panel covers (the map padding, prod_design 5.7).
export interface Viewport {
  width: number;
  height: number;
  cover: { top: number; right: number; bottom: number; left: number };
  wide: boolean; // wider than 640 px
}

export interface Fit {
  center: LngLat; // the point at the middle of the free area: give it to easeTo with the map padding
  zoom: number;
}

// lines: the bounds of the lines of the view. focus: the selected stops, always in the area.
export function fit(v: Viewport, lines: Bounds, focus: LngLat[], minZoom: number): Fit | null {
  const all: Bounds = [...lines];
  for (const p of focus) extend(all, p);
  if (isEmpty(all)) return null;

  // Step 1: the area. The free area, with space at each edge for the marks on the lines.
  const { width: W, height: H, cover } = v;
  let left = cover.left + FIT_EDGE;
  let right = cover.right + FIT_EDGE + (v.wide ? FIT_BUTTONS : 0);
  let top = cover.top + FIT_TOP;
  let bottom = cover.bottom + FIT_EDGE;
  if (W - left - right < FIT_SMALL || H - top - bottom < FIT_SMALL) {
    left = cover.left + FIT_TIGHT;
    right = cover.right + FIT_TIGHT + (v.wide ? FIT_BUTTONS : 0);
    top = cover.top + FIT_TIGHT;
    bottom = cover.bottom + FIT_TIGHT;
  }
  const areaW = Math.max(1, W - left - right);
  const areaH = Math.max(1, H - top - bottom);

  // Step 2: the largest zoom that shows the lines and the focus in the area, from minZoom to 16.
  const x0 = mercX(all[0]);
  const x1 = mercX(all[2]);
  const y0 = mercY(all[3]); // north: the smaller y
  const y1 = mercY(all[1]);
  const fitZoom = Math.log2(Math.min(areaW / ((x1 - x0) * TILE), areaH / ((y1 - y0) * TILE)));
  const zoom = Math.min(FIT_MAX_ZOOM, Math.max(minZoom, fitZoom));
  const world = TILE * 2 ** zoom;

  // Step 3: the middle of the lines and the focus at the middle of the area (in world pixels)...
  let cx = ((x0 + x1) / 2) * world;
  let cy = ((y0 + y1) / 2) * world;
  const ax = (left + W - right) / 2; // the middle of the area, in window pixels
  const ay = (top + H - bottom) / 2;
  // ...then the smallest move that puts the focus in the area. A world point p is at p - c + a in the window.
  if (focus.length) {
    const fx0 = Math.min(...focus.map((p) => mercX(p[0]))) * world;
    const fx1 = Math.max(...focus.map((p) => mercX(p[0]))) * world;
    const fy0 = Math.min(...focus.map((p) => mercY(p[1]))) * world;
    const fy1 = Math.max(...focus.map((p) => mercY(p[1]))) * world;
    cx = clamp(cx, fx1 + ax - (W - right), fx0 + ax - left);
    cy = clamp(cy, fy1 + ay - (H - bottom), fy0 + ay - top);
  }

  // The world point at the middle of the free area.
  const fx = cx + (cover.left + W - cover.right) / 2 - ax;
  const fy = cy + (cover.top + H - cover.bottom) / 2 - ay;
  return { center: [lonOf(fx / world), latOf(fy / world)], zoom };
}

// The value in [lo, hi]. If lo > hi (the focus is larger than the area), the middle.
const clamp = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

// app_design 5.7: the move of a station view or a stop view. The middle of the selected stops goes to the
// middle of the free area, at the given zoom. Give the centre to easeTo with the map padding.
export function centre(focus: LngLat[], zoom: number): Fit | null {
  if (!focus.length) return null;
  const xs = focus.map((p) => mercX(p[0]));
  const ys = focus.map((p) => mercY(p[1]));
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { center: [lonOf(x), latOf(y)], zoom };
}
