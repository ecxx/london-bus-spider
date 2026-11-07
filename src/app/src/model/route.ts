// app_design 6.5: the route view.
import type { Core } from "../data/load";
import type { Direction, LineInfo, PatternKey, StationKey, StopKey } from "../data/types";
import { isCircular, patternTitle } from "./circular";
import { CLASS_TEXT, firstStopName, isLimited, lastStopName, patternClass, stationOf } from "./text";

// The stop or the station that opened the route view.
export interface RouteContext {
  kind: "stop" | "station";
  key: string;
}

export interface RouteView {
  line: LineInfo;
  dirs: Direction[]; // the directions that have patterns, outbound first
  dir: Direction;
  pids: PatternKey[]; // the patterns of the direction
  n: number; // the selected pattern, from 1 (1 is the main pattern)
  pid: PatternKey;
  ctx: RouteContext | null; // null if the context is not in the data
  station: StationKey | null; // the station of the context
  here: Set<StopKey>; // red and bold: the stop, or all the stops of the station
  near: Set<StopKey>; // red: the stops of the station
  firstRed: number; // the index of the first red stop of the pattern, or -1
}

const calls = (d: Core, pid: PatternKey, keys: ReadonlySet<StopKey>): boolean => d.patterns[pid]![4].some((s) => keys.has(s));

// The route view of a URL. dir and n are the parts of the URL, if any. null if the line is not in the data.
export function routeView(d: Core, lineId: string, dir?: string, n?: string, ctx?: RouteContext | null): RouteView | null {
  const line = d.lines.get(lineId);
  if (!line) return null;
  const valid = ctx && (ctx.kind === "stop" ? d.stops[ctx.key] : d.stationStops.has(ctx.key)) ? ctx : null;
  const station = valid ? (valid.kind === "stop" ? stationOf(d, valid.key) : valid.key) : null;
  const near = new Set(station ? d.stationStops.get(station) : []);
  const here = valid?.kind === "stop" ? new Set([valid.key]) : near;

  const dirs = (["outbound", "inbound"] as const).filter((x) => line.dirs[x].length);
  // The direction of the URL, else the direction that calls at the station, else the first.
  const dr: Direction = dirs.find((x) => x === dir) ?? dirs.find((x) => line.dirs[x].some((p) => calls(d, p, near))) ?? dirs[0]!;
  const pids = line.dirs[dr];
  let i: number;
  if (n !== undefined) {
    // The pattern of the URL. A value out of the range gives the nearest pattern; a value that is not a number gives 1.
    i = Math.min(Math.max(0, Number.parseInt(n, 10) - 1 || 0), pids.length - 1);
  } else {
    // The first variant that calls at the stop, else at the station, else the main pattern.
    i = Math.max(0, pids.findIndex((p) => calls(d, p, here)));
    if (!calls(d, pids[i]!, here)) i = Math.max(0, pids.findIndex((p) => calls(d, p, near)));
  }
  const pid = pids[i]!;
  const firstRed = d.patterns[pid]![4].findIndex((s) => near.has(s));
  return { line, dirs, dir: dr, pids, n: i + 1, pid, ctx: valid, station, here, near, firstRed };
}

// The header: "first stop – last stop" and "class text · n stops" of the selected pattern.
export function routeHeader(d: Core, pid: PatternKey): { title: string; sub: string } {
  const stops = d.patterns[pid]![4];
  return {
    title: patternTitle(firstStopName(d, pid), lastStopName(d, pid), isCircular(d, pid)),
    sub: `${CLASS_TEXT[patternClass(d, pid)]} · ${stops.length} stops`,
  };
}

// The tab of a direction: "To" + the last stop of its main pattern.
export const directionTab = (d: Core, line: LineInfo, dir: Direction): string => `To ${lastStopName(d, line.dirs[dir][0]!)}`;

// The variants of a direction, if it has two or more patterns.
export interface Variant {
  title: string; // "Main route" or "Variant n"
  limited: boolean; // the Limited tag
  sub: string; // "n stops · from X · to Y"
}

export function variants(d: Core, pids: PatternKey[]): Variant[] {
  if (pids.length < 2) return [];
  const main = pids[0]!;
  return pids.map((p, i) => {
    const sub = [`${d.patterns[p]![4].length} stops`];
    if (firstStopName(d, p) !== firstStopName(d, main)) sub.push(`from ${firstStopName(d, p)}`);
    if (lastStopName(d, p) !== lastStopName(d, main)) sub.push(`to ${lastStopName(d, p)}`);
    return { title: i ? `Variant ${i + 1}` : "Main route", limited: isLimited(d, p), sub: sub.join(" · ") };
  });
}

// The class of a stop row of the stop list: red and bold, red, or none.
export function stopMark(view: RouteView, k: StopKey): "here" | "near" | null {
  return view.here.has(k) ? "here" : view.near.has(k) ? "near" : null;
}
