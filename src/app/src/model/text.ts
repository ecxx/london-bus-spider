// The texts and the badges of the panel: app_design 3.3, 3.4, 3.6, 6.1.
import type { Core } from "../data/load";
import type { LineInfo, PatternKey, ServiceClass, StationKey, StopKey } from "../data/types";
import { parseIndicator, roundelText, stopLabel as labelOf } from "./stopCode";

// Single spaces, and " / " between the parts of a name (as in the design demo).
export const tidy = (s: string): string => s.replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ").trim();

// app_design 6.6: the form for a search. Lower case, no apostrophes, single spaces.
export const norm = (s: string): string => tidy(s).toLowerCase().replace(/[’']/g, "");

// app_design 3.6
export const CLASS_TEXT: Record<ServiceClass, string> = {
  day: "Day",
  "24-hour": "24 Hours",
  night: "Night",
  limited: "Limited service",
};

export type BadgeStyle = "red" | "night" | "limited";

// app_design 3.3: the badge of a line, from the class of its main pattern.
// D6: the Superloop lines (SL) have the same badge as the other lines of their class.
export function badgeStyle(line: LineInfo): BadgeStyle {
  return line.cls === "night" ? "night" : line.cls === "limited" ? "limited" : "red";
}

// prod_design 5.4: the line colour token, from the class of the main pattern of the line.
export const lineColorToken = (cls: ServiceClass): "--night" | "--red" => (cls === "night" ? "--night" : "--red");

export const routesText = (n: number): string => (n === 1 ? "1 route" : `${n} routes`);

export const stopName = (d: Core, k: StopKey): string => tidy(d.stops[k]![0]);
export const stationName = (d: Core, k: StationKey): string => tidy(d.stations[k]![0]);
export const stationOf = (d: Core, k: StopKey): StationKey => d.stops[k]![4];
export const stopCode = (d: Core, k: StopKey) => parseIndicator(d.stops[k]![1], d.stops[k]![5]);
export const stopLabel = (d: Core, k: StopKey): string => labelOf(stopCode(d, k), stopName(d, k));
export const firstStopName = (d: Core, pid: PatternKey): string => stopName(d, d.patterns[pid]![4][0]!);
export const lastStopName = (d: Core, pid: PatternKey): string => stopName(d, d.patterns[pid]![4].at(-1)!);
export const patternClass = (d: Core, pid: PatternKey): ServiceClass => d.patterns[pid]![3];
export const isLimited = (d: Core, pid: PatternKey): boolean => d.patterns[pid]![3] === "limited";

// app_design 3.4 and 6.1: the ring of a station in the home list. A station with one stop that has
// a code shows the code, else the number of its stops. A stand has an --ink-2 ring. A code of more
// than 2 characters has a smaller text.
export interface StationRing {
  text: string;
  stand: boolean;
  long: boolean;
}

export function stationRing(d: Core, st: StationKey): StationRing {
  const ks = d.stationStops.get(st) ?? [];
  const c = ks.length === 1 ? stopCode(d, ks[0]!) : null;
  if (c?.code) return { text: c.code, stand: c.kind === "stand", long: c.code.length > 2 };
  return { text: String(ks.length), stand: false, long: false };
}

// app_design 6.1: the stop codes after the name, for a station with two or more stops.
export function stationCodes(d: Core, st: StationKey): string {
  const ks = d.stationStops.get(st) ?? [];
  if (ks.length < 2) return "";
  return ks.map((k) => stopCode(d, k).code).filter(Boolean).join(" ");
}

// The roundel of a stop (app_design 3.4).
export function stopRoundel(d: Core, k: StopKey): { text: string; stand: boolean } {
  const c = stopCode(d, k);
  return { text: roundelText(c), stand: c.kind === "stand" };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// app_design 6.7: the date of the bus data, from the dataset name. "data_131026" gives "13 October 2026".
export function datasetDate(dataset: string): string | null {
  const m = /^data_(\d\d)(\d\d)(\d\d)$/.exec(dataset);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month || Number(m[1]) < 1 || Number(m[1]) > 31) return null;
  return `${Number(m[1])} ${month} 20${m[3]}`;
}

// The main pattern of a line for the home list and the search: outbound first (app_design 6.5).
export const mainPattern = (line: LineInfo): PatternKey => (line.dirs.outbound[0] ?? line.dirs.inbound[0])!;

// app_design 6.1: a row of the routes list.
export function homeRouteRow(d: Core, line: LineInfo): { title: string; sub: string } {
  const pid = mainPattern(line);
  const limited = line.cls !== "limited" && [...line.dirs.inbound, ...line.dirs.outbound].some((p) => isLimited(d, p));
  return {
    title: `${firstStopName(d, pid)} – ${lastStopName(d, pid)}`,
    sub: CLASS_TEXT[line.cls] + (limited ? " · limited variants" : ""),
  };
}
