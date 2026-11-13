import { describe, expect, test } from "vitest";
import { ROUTE_FIT_MIN_ZOOM, STOP_VIEW_ZOOM, centre, fit, type Viewport } from "../../src/model/fit";
import { emptyBounds, extend, type Bounds, type LngLat } from "../../src/model/geo";

// An independent Web Mercator, 512 px tiles: world pixels at a zoom.
const world = ([lon, lat]: LngLat, z: number): [number, number] => {
  const s = 512 * 2 ** z;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [((lon + 180) / 360) * s, (0.5 - y / (2 * Math.PI)) * s];
};

// The window position of a point after the fit. The centre is at the middle of the free area.
function screen(v: Viewport, f: { center: LngLat; zoom: number }, p: LngLat): [number, number] {
  const c = world(f.center, f.zoom);
  const w = world(p, f.zoom);
  const mx = (v.cover.left + v.width - v.cover.right) / 2;
  const my = (v.cover.top + v.height - v.cover.bottom) / 2;
  return [w[0] - c[0] + mx, w[1] - c[1] + my];
}

const bounds = (...ps: LngLat[]): Bounds => ps.reduce(extend, emptyBounds());

// A wide window: the panel is 380 px wide at 16 px from the edges. Area: x 452..1144, y 64..760.
const WIDE: Viewport = { width: 1200, height: 800, cover: { top: 0, right: 0, bottom: 0, left: 412 }, wide: true };
// A phone: the sheet covers the bottom 58%. Area: x 40..350, y 64..(844 - 489.52 - 40).
const PHONE: Viewport = { width: 390, height: 844, cover: { top: 0, right: 0, bottom: 489.52, left: 0 }, wide: false };

const charingCross: LngLat = [-0.1248, 51.5081];

describe("fit (app_design 5.7)", () => {
  test("wide: the lines fill the area, and their middle is at the middle of the area", () => {
    const a: LngLat = [-0.2, 51.48];
    const b: LngLat = [-0.1, 51.53];
    const f = fit(WIDE, bounds(a, b), [], ROUTE_FIT_MIN_ZOOM)!;
    expect(f.zoom).toBeGreaterThan(10);
    expect(f.zoom).toBeLessThan(13);
    const [ax, ay] = screen(WIDE, f, a);
    const [bx, by] = screen(WIDE, f, b);
    // The largest zoom: one dimension fills the area exactly.
    const fillW = Math.abs(bx - ax) / (1144 - 452);
    const fillH = Math.abs(by - ay) / (760 - 64);
    expect(Math.max(fillW, fillH)).toBeCloseTo(1, 9);
    expect(Math.min(fillW, fillH)).toBeLessThanOrEqual(1);
    expect((ax + bx) / 2).toBeCloseTo((452 + 1144) / 2, 6);
    expect((ay + by) / 2).toBeCloseTo((64 + 760) / 2, 6);
  });

  test("one point: the maximum zoom 16, the point at the middle of the area", () => {
    const f = fit(WIDE, bounds(charingCross), [charingCross], 13)!;
    expect(f.zoom).toBe(16);
    const [x, y] = screen(WIDE, f, charingCross);
    expect(x).toBeCloseTo(798, 6);
    expect(y).toBeCloseTo(412, 6);
  });

  test("long lines: the minimum zoom, and the smallest move that puts the focus in the area", () => {
    const west: LngLat = [-0.5, 51.5];
    const east: LngLat = [0.3, 51.5];
    const focus: LngLat = [-0.45, 51.5]; // far from the middle of the lines
    const f = fit(WIDE, bounds(west, east), [focus], 13)!;
    expect(f.zoom).toBe(13);
    const [x, y] = screen(WIDE, f, focus);
    expect(x).toBeCloseTo(452, 6); // on the left edge of the area: the smallest move
    expect(y).toBeCloseTo(412, 6);
  });

  test("the zoom: 692 px for 0.1 degrees of longitude at 51.5 N", () => {
    const f = fit(WIDE, bounds([-0.2, 51.5], [-0.1, 51.5]), [], ROUTE_FIT_MIN_ZOOM)!;
    expect(f.zoom).toBeCloseTo(Math.log2(692 / ((0.1 / 360) * 512)), 9);
  });

  test("the minimum zoom: 13 for a station or a stop, 10 for a route", () => {
    const wide = bounds([-0.6, 51.3], [0.3, 51.7]); // approximately zoom 9.1
    expect(fit(WIDE, wide, [], ROUTE_FIT_MIN_ZOOM)!.zoom).toBe(10);
    expect(fit(WIDE, wide, [], 13)!.zoom).toBe(13);
  });

  test("phone: the area is above the sheet, with no space for the zoom buttons", () => {
    const a: LngLat = [-0.14, 51.5];
    const b: LngLat = [-0.11, 51.52];
    const f = fit(PHONE, bounds(a, b), [], ROUTE_FIT_MIN_ZOOM)!;
    const [ax, ay] = screen(PHONE, f, a);
    const [bx, by] = screen(PHONE, f, b);
    const fillW = Math.abs(bx - ax) / (350 - 40);
    const fillH = Math.abs(by - ay) / (844 - 489.52 - 40 - 64);
    expect(Math.max(fillW, fillH)).toBeCloseTo(1, 9);
    expect((ax + bx) / 2).toBeCloseTo(195, 6);
    expect((ay + by) / 2).toBeCloseTo((64 + 844 - 489.52 - 40) / 2, 6);
  });

  test("a small free area: 8 px at each edge", () => {
    const v: Viewport = { width: 700, height: 400, cover: { top: 0, right: 0, bottom: 0, left: 412 }, wide: true };
    // 700 - 452 - 56 = 192 px wide, 400 - 104 = 296 px high: the normal edges.
    const a: LngLat = [-0.2, 51.5];
    const b: LngLat = [-0.19, 51.5];
    let f = fit(v, bounds(a, b), [], 10)!;
    expect(screen(v, f, b)[0] - screen(v, f, a)[0]).toBeCloseTo(192, 6);
    // 560 - 452 - 56 = 52 px wide: less than 100. Then 560 - 420 - 24 = 116 px.
    const small = { ...v, width: 560 };
    f = fit(small, bounds(a, b), [], 10)!;
    expect(screen(small, f, b)[0] - screen(small, f, a)[0]).toBeCloseTo(116, 6);
  });

  test("no lines and no focus: no fit", () => {
    expect(fit(WIDE, emptyBounds(), [], 13)).toBe(null);
  });
});

describe("station view and stop view move (app_design 5.7)", () => {
  test("the middle of the selected stops at the middle of the free area, at STOP_VIEW_ZOOM", () => {
    const a: LngLat = [-0.126, 51.507];
    const b: LngLat = [-0.123, 51.509];
    const f = centre([a, b], STOP_VIEW_ZOOM)!;
    expect(f.zoom).toBe(14);
    const [ax, ay] = screen(WIDE, f, a);
    const [bx, by] = screen(WIDE, f, b);
    expect((ax + bx) / 2).toBeCloseTo((412 + 1200) / 2, 6);
    expect((ay + by) / 2).toBeCloseTo(400, 6);
  });

  test("no selected stops: no move", () => {
    expect(centre([], STOP_VIEW_ZOOM)).toBe(null);
  });
});
