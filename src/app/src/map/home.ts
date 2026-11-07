// prod_design 5.3: the home source. One line for each line-direction: its main pattern (app_design 6.1).
import type { FeatureCollection, LineString } from "geojson";
import type { Core } from "../data/load";
import { positions } from "../data/polyline";
import type { DecodedLine, PatternKey } from "../data/types";

export function homeSource(d: Core, lines: Map<PatternKey, DecodedLine>): FeatureCollection<LineString> {
  const features: FeatureCollection<LineString>["features"] = [];
  for (const line of d.lines.values()) {
    for (const dir of ["outbound", "inbound"] as const) {
      const pid = line.dirs[dir][0];
      const l = pid && lines.get(pid);
      if (!pid || !l) continue;
      features.push({
        type: "Feature",
        properties: { pid, line: line.id, dir, cls: d.patterns[pid]![3], lcls: line.cls },
        geometry: { type: "LineString", coordinates: positions(l.coords) },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
