// app_design 6.6: the search of the routes and the stations.
import type { Core } from "../data/load";
import type { LineInfo, StationKey } from "../data/types";
import { compareLines } from "./order";
import { stopsText } from "./stopCode";
import { norm, routesText, stationName, stopName } from "./text";

const MAX_ROUTES = 8;
const MAX_STATIONS = 20;

export type SearchResult = { kind: "line"; line: LineInfo } | { kind: "station"; key: StationKey; name: string };

export interface SearchIndex {
  lines: { line: LineInfo; name: string }[]; // in the route order, with the name in lower case
  stations: { key: StationKey; name: string; norm: string }[]; // in the order of the station list
}

// The station list order (app_design 6.1): case and accents ignored, numbers in numeric order.
export const stationCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function searchIndex(d: Core): SearchIndex {
  const lines = [...d.lines.values()].sort(compareLines).map((line) => ({ line, name: line.name.toLowerCase() }));
  const stations = [...d.stationStops.keys()]
    .map((key) => ({ key, name: stationName(d, key) }))
    .sort((a, b) => stationCollator.compare(a.name, b.name))
    .map((s) => ({ ...s, norm: norm(s.name) }));
  return { lines, stations };
}

// 0: the name starts with the text. 1: a word of the name starts with it. 2: the name contains it.
// at: the first position of the text in the name. A word starts after a character that is not a letter or a digit.
function rank(name: string, s: string, at: number): number {
  if (at === 0) return 0;
  for (let i = at; i > 0; i = name.indexOf(s, i + 1)) if (!/[\p{L}\p{N}]/u.test(name[i - 1]!)) return 1;
  return 2;
}

export function search(index: SearchIndex, text: string): SearchResult[] {
  const s = norm(text);
  if (!s) return [];
  const routes: SearchResult[] = [];
  for (const { line, name } of index.lines) {
    if (routes.length === MAX_ROUTES) break;
    if (name.startsWith(s) || name === "n" + s) routes.push({ kind: "line", line });
  }
  // The stations are in the list order. Thus a stable sort by rank keeps the names in order.
  const found: { key: StationKey; name: string; r: number }[] = [];
  for (const st of index.stations) {
    const at = st.norm.indexOf(s);
    if (at >= 0) found.push({ key: st.key, name: st.name, r: rank(st.norm, s, at) });
  }
  found.sort((a, b) => a.r - b.r);
  return [...routes, ...found.slice(0, MAX_STATIONS).map(({ key, name }): SearchResult => ({ kind: "station", key, name }))];
}

// The Up (-1) and Down (+1) keys: the next selected result of n. After the last result, the first.
export const stepSelection = (active: number, n: number, step: 1 | -1): number => (n ? (active + step + n) % n : 0);

// The matched part of a name, for the --red-ink text: [start, end) in the name, or null.
// The search form removes apostrophes, so the positions are mapped back to the name.
export function matchRange(name: string, text: string): [number, number] | null {
  const s = norm(text);
  if (!s) return null;
  let n = "";
  const pos: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const c = name[i]!;
    if (c === "'" || c === "’") continue;
    if (/\s/.test(c) && (n.endsWith(" ") || n === "")) continue;
    n += /\s/.test(c) ? " " : c.toLowerCase();
    pos.push(i);
  }
  const at = n.indexOf(s);
  if (at < 0) return null;
  return [pos[at]!, pos[at + s.length - 1]! + 1];
}

// The second line of a station result: "stops · n routes".
export function stationResultText(d: Core, key: StationKey): string {
  const ks = d.stationStops.get(key) ?? [];
  const lines = new Set(ks.flatMap((k) => (d.stopPatterns.get(k) ?? []).map((p) => d.patterns[p]![0])));
  return `${stopsText(ks.map((k) => ({ indicator: d.stops[k]![1], heading: d.stops[k]![5], name: stopName(d, k) })))} · ${routesText(lines.size)}`;
}
