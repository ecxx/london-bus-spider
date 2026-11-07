// app_design 6.2 and 6.4: the patterns, the rows and the filter of a spider graph.
import type { Core } from "../data/load";
import type { Direction, LineInfo, PatternKey, StationKey, StopKey } from "../data/types";
import { cutIndex } from "./cut";
import { compareLines } from "./order";
import { stopsText } from "./stopCode";
import { CLASS_TEXT, firstStopName, isLimited, lastStopName, patternClass, stationOf, stopName } from "./text";

// A pattern of a spider graph, and the index of its cut stop (app_design 6.4, cut point step 1).
export interface SpiderPattern {
  pid: PatternKey;
  i: number;
  last: boolean; // the cut stop is the last stop: the pattern ends at the selected stops
}

// The patterns that contain a selected stop: for each selected stop, its patterns in file order.
export function spiderPatterns(d: Core, selected: StopKey[]): SpiderPattern[] {
  const at = new Set(selected);
  const seen = new Set<PatternKey>();
  const out: SpiderPattern[] = [];
  for (const k of selected) {
    for (const pid of d.stopPatterns.get(k) ?? []) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const stops = d.patterns[pid]![4];
      const i = cutIndex(stops, at);
      out.push({ pid, i, last: i === stops.length - 1 });
    }
  }
  return out;
}

export interface SpiderRow {
  line: LineInfo;
  dir: Direction;
  pids: PatternKey[];
  stops: StopKey[]; // the cut stops of the patterns of the row, in the order of the station
  to: boolean; // true: "to" + title. false: "from" + title (all the patterns end here)
  title: string;
  sub: string;
}

// One row for each line-direction, in the route order, then by direction.
// station: the rows of a station view. Their second line starts with the stops of the row.
export function spiderRows(d: Core, selected: StopKey[], station: boolean): SpiderRow[] {
  const groups = new Map<string, SpiderPattern[]>();
  for (const p of spiderPatterns(d, selected)) {
    const [lineId, , dir] = d.patterns[p.pid]!;
    const key = `${lineId}|${dir}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const rows: SpiderRow[] = [];
  for (const pats of groups.values()) {
    const [lineId, , dir] = d.patterns[pats[0]!.pid]!;
    const pids = pats.map((p) => p.pid);
    const cutStops = new Set(pats.map((p) => d.patterns[p.pid]![4][p.i]!));
    const stops = selected.filter((k) => cutStops.has(k));
    const dests = [...new Set(pats.filter((p) => !p.last).map((p) => lastStopName(d, p.pid)))];
    const ends = pats.length - pats.filter((p) => !p.last).length;

    const sub: string[] = [];
    if (station) sub.push(stopsText(stops.map((k) => ({ indicator: d.stops[k]![1], heading: d.stops[k]![5], name: stopName(d, k) }))));
    if (!dests.length) sub.push("Ends here");
    else if (ends) sub.push("Some buses end here");
    const regular = pids.filter((p) => !isLimited(d, p));
    const limited = pids.length - regular.length;
    if (!regular.length) sub.push(CLASS_TEXT.limited);
    else {
      sub.push(CLASS_TEXT[patternClass(d, regular[0]!)]);
      if (regular.length > 1) sub.push(`${regular.length} variants`);
      if (limited) sub.push(limited === 1 ? "1 limited variant" : `${limited} limited variants`);
    }
    rows.push({
      line: d.lines.get(lineId)!,
      dir,
      pids,
      stops,
      to: dests.length > 0,
      title: dests.length ? dests.join(" / ") : firstStopName(d, pids[0]!),
      sub: sub.join(" · "),
    });
  }
  return rows.sort((a, b) => compareLines(a.line, b.line) || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

// app_design 6.2: the filter chips.
export type Filter = "all" | "day" | "night";

const inFilter = (line: LineInfo, f: Filter): boolean =>
  f === "all" || (f === "day" ? line.cls !== "night" : line.cls === "night" || line.cls === "24-hour");

export function filterCounts(rows: SpiderRow[]): Record<Filter, number> {
  return {
    all: rows.length,
    day: rows.filter((r) => inFilter(r.line, "day")).length,
    night: rows.filter((r) => inFilter(r.line, "night")).length,
  };
}

// The rows of a filter. If the filter has no rows, use All.
export function applyFilter(rows: SpiderRow[], f: Filter): { filter: Filter; rows: SpiderRow[] } {
  const shown = rows.filter((r) => inFilter(r.line, f));
  return shown.length || f === "all" ? { filter: f, rows: shown } : { filter: "all", rows };
}

// app_design 5.5: the stations that the shown patterns serve after the selected stops.
export function servedStations(d: Core, pats: SpiderPattern[], lines: ReadonlySet<string>): Set<StationKey> {
  const out = new Set<StationKey>();
  for (const p of pats) {
    const [lineId, , , , stops] = d.patterns[p.pid]!;
    if (!lines.has(lineId)) continue;
    for (let i = p.i + 1; i < stops.length; i++) out.add(stationOf(d, stops[i]!));
  }
  return out;
}
