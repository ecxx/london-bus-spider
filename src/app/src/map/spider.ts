// prod_design 5.3: the view source of a spider graph. For each shown pattern, the section before the
// cut point (part "behind") and the section after it (part "after"). app_design 6.4, "Lines".
import type { Feature, FeatureCollection, LineString } from "geojson";
import type { Core } from "../data/load";
import { pointCount, positions } from "../data/polyline";
import type { DecodedLine, Direction, LineId, PatternKey } from "../data/types";
import { sections } from "../model/cut";
import { emptyBounds, extendCoords, lengthM, type Bounds, type LngLat } from "../model/geo";
import type { Spider } from "../state/spider";

// The section after the stop of a pattern: for the hit test (prod_design 5.5) and the end labels (5.6).
export interface AfterSection {
  pid: PatternKey;
  line: LineId;
  dir: Direction;
  coords: Float64Array; // the decoded points of the pattern
  from: number; // the points from..to (inclusive) are the section
  to: number;
  end: LngLat; // the last point
}

export interface SpiderMap {
  data: FeatureCollection<LineString>;
  bounds: Bounds; // the sections after the stop (app_design 5.7)
  after: AfterSection[];
}

export function spiderMap(d: Core, lines: Map<PatternKey, DecodedLine>, s: Spider): SpiderMap {
  const features: Feature<LineString>[] = [];
  const bounds = emptyBounds();
  const after: AfterSection[] = [];
  for (const p of s.patterns) {
    const l = lines.get(p.pid);
    if (!l) continue;
    const [lineId, , dir, cls] = d.patterns[p.pid]!;
    const lcls = d.lines.get(lineId)!.cls;
    const sec = sections(pointCount(l.coords), l.stopPoints, p.i);
    const feature = (part: "behind" | "after", [from, to]: [number, number]): Feature<LineString> => ({
      type: "Feature",
      properties: { pid: p.pid, line: lineId, dir, cls, lcls, part, len: lengthM(l.coords, from, to) },
      geometry: { type: "LineString", coordinates: positions(l.coords, from, to) },
    });
    if (sec.behind) features.push(feature("behind", sec.behind));
    if (sec.after) {
      features.push(feature("after", sec.after));
      extendCoords(bounds, l.coords, ...sec.after);
      const [from, to] = sec.after;
      after.push({ pid: p.pid, line: lineId, dir, coords: l.coords, from, to, end: [l.coords[2 * to]!, l.coords[2 * to + 1]!] });
    }
  }
  return { data: { type: "FeatureCollection", features }, bounds, after };
}
