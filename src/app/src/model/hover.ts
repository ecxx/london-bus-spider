// app_design 6.4, "Hover on the map": the routes at the pointer, and the highlight.
import type { Core } from "../data/load";
import type { Direction, LineId, LineInfo, PatternKey } from "../data/types";
import { mercX, mercY } from "./geo";
import { compareLines } from "./order";
import { isLimited, lastStopName } from "./text";

// The highlighted routes: line IDs, and one direction (a list row) or all directions (dir null).
// map: the highlight comes from the hover on the map lines.
export interface Highlight {
  lines: LineId[];
  dir: Direction | null;
  map?: boolean;
}

export const highlights = (h: Highlight | null, line: LineId, dir: Direction): boolean =>
  !!h && h.lines.includes(line) && (h.dir === null || h.dir === dir);

// One item for each line and last stop, in the route order (app_design 3.7), then by direction.
export interface HoverItem {
  line: LineInfo;
  dir: Direction;
  pid: PatternKey; // the first pattern of the item
  to: string; // the last stop name
  limited: boolean;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function hoverItems(d: Core, pids: PatternKey[]): HoverItem[] {
  const items = new Map<string, HoverItem>();
  for (const pid of pids) {
    const [lineId, , dir] = d.patterns[pid]!;
    const to = lastStopName(d, pid);
    const k = `${lineId}|${to}`;
    if (!items.has(k)) items.set(k, { line: d.lines.get(lineId)!, dir, pid, to, limited: isLimited(d, pid) });
  }
  return [...items.values()].sort((a, b) => compareLines(a.line, b.line) || cmp(a.dir, b.dir) || cmp(a.to, b.to));
}

// prod_design 5.5: the hit test uses the decoded points of the pattern, not the geometry of the tile.
// The points in Web Mercator, as a fraction of the world: [x0, y0, x1, y1, ...]. Make them one time
// for each spider graph. At zoom z, one world unit is 512 * 2^z px.
export function mercator(coords: Float64Array, from: number, to: number): Float64Array {
  const out = new Float64Array(2 * (to - from + 1));
  for (let i = from; i <= to; i++) {
    out[2 * (i - from)] = mercX(coords[2 * i]!);
    out[2 * (i - from) + 1] = mercY(coords[2 * i + 1]!);
  }
  return out;
}

// The bounds of Mercator points: [minX, minY, maxX, maxY].
export function mercBounds(m: Float64Array): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.length; i += 2) {
    if (m[i]! < b[0]) b[0] = m[i]!;
    if (m[i + 1]! < b[1]) b[1] = m[i + 1]!;
    if (m[i]! > b[2]) b[2] = m[i]!;
    if (m[i + 1]! > b[3]) b[3] = m[i + 1]!;
  }
  return b;
}

// The distance from the point (x, y) to the line through the points, in the units of the points.
// Infinity if the line has no point.
export function distanceToLine(m: Float64Array, x: number, y: number): number {
  let best = Infinity;
  if (m.length === 2) return Math.hypot(m[0]! - x, m[1]! - y);
  for (let i = 2; i < m.length; i += 2) {
    const ax = m[i - 2]!;
    const ay = m[i - 1]!;
    const dx = m[i]! - ax;
    const dy = m[i + 1]! - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
    if (d < best) best = d;
  }
  return best;
}
