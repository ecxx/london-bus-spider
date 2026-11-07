// The indexes of export_format 6.1, and the lines (routes) from the patterns.
import type { LineId, LineInfo, PatternKey, Patterns, StationKey, Stops, StopKey } from "./types";

export interface Indexes {
  stopPatterns: Map<StopKey, PatternKey[]>; // each pattern that contains the stop, one time, in file order
  stationStops: Map<StationKey, StopKey[]>; // the stops of each station
  lines: Map<LineId, LineInfo>; // in file order
}

export function buildIndexes(stops: Stops, patterns: Patterns): Indexes {
  const stopPatterns = new Map<StopKey, PatternKey[]>();
  const lines = new Map<LineId, LineInfo>();
  for (const [pid, [lineId, name, dir, cls, keys]] of Object.entries(patterns)) {
    // export_format 4.4: the patterns of a line-direction are adjacent and in rank order. Thus the
    // first pattern of the line is a main pattern. In data_131026, the main patterns of the two
    // directions of a line have the same class.
    let line = lines.get(lineId);
    if (!line) lines.set(lineId, (line = { id: lineId, name, cls, dirs: { inbound: [], outbound: [] } }));
    line.dirs[dir].push(pid);
    // A stop can occur two times in a pattern (export_format 4.4).
    for (const k of new Set(keys)) {
      const list = stopPatterns.get(k);
      if (list) list.push(pid);
      else stopPatterns.set(k, [pid]);
    }
  }
  const stationStops = new Map<StationKey, StopKey[]>();
  for (const [k, [, , , , station]] of Object.entries(stops)) {
    const list = stationStops.get(station);
    if (list) list.push(k);
    else stationStops.set(station, [k]);
  }
  return { stopPatterns, stationStops, lines };
}
