// app_design 6.2, 6.3 and 6.4: the spider graph of the station view or the stop view. The panel and
// the map read it. It changes when a view opens and when the filter changes.
import { computed } from "@preact/signals";
import type { StationKey, StopKey } from "../data/types";
import type { RouteContext } from "../model/route";
import {
  applyFilter,
  filterCounts,
  servedStations,
  spiderPatterns,
  spiderRows,
  type Filter,
  type SpiderPattern,
  type SpiderRow,
} from "../model/spider";
import { stationOf } from "../model/text";
import { core, filter, view } from "./signals";

export interface Spider {
  ctx: RouteContext; // the stop or the station of the view: a route opens from it
  station: StationKey; // the selected station, or the station of the selected stop
  stop: StopKey | null; // the selected stop of a stop view
  selected: StopKey[]; // the stop, or the stops of the station
  pins: StopKey[]; // the stops of the station (app_design 5.5)
  rows: SpiderRow[]; // all the rows
  counts: Record<Filter, number>;
  filter: Filter; // the filter that applies: All if the selected filter has no rows
  shown: SpiderRow[]; // the rows of the filter
  patterns: SpiderPattern[]; // the patterns of the shown rows
  served: Set<StationKey>; // the stations that the shown patterns serve after the selected stops
}

const graph = computed(() => {
  const d = core.value;
  const v = view.value;
  if (!d || (v.kind !== "station" && v.kind !== "stop")) return null;
  const station = v.kind === "station" ? v.key : stationOf(d, v.key);
  const pins = d.stationStops.get(station) ?? [];
  const selected = v.kind === "station" ? pins : [v.key];
  const rows = spiderRows(d, selected, v.kind === "station");
  const ctx: RouteContext = { kind: v.kind, key: v.key };
  return { ctx, station, stop: v.kind === "stop" ? v.key : null, selected, pins, rows, counts: filterCounts(rows), all: spiderPatterns(d, selected) };
});

export const spider = computed((): Spider | null => {
  const g = graph.value;
  const d = core.value;
  if (!g || !d) return null;
  const { all, ...rest } = g;
  const { filter: f, rows: shown } = applyFilter(g.rows, filter.value);
  const pids = new Set(shown.flatMap((r) => r.pids));
  const patterns = all.filter((p) => pids.has(p.pid));
  const served = servedStations(d, patterns, new Set(shown.map((r) => r.line.id)));
  return { ...rest, filter: f, shown, patterns, served };
});
