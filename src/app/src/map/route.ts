// prod_design 5.3: the view source and the route-stops source of a route view (app_design 6.5, "Map").
// Each pattern of the line: the selected pattern (part "selected") and the other patterns (part "other").
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Core } from "../data/load";
import { positions } from "../data/polyline";
import type { DecodedLine, PatternKey } from "../data/types";
import { emptyBounds, extendCoords, lengthM, type Bounds } from "../model/geo";
import type { Route } from "../state/route";

export interface RouteMap {
  data: FeatureCollection<LineString>;
  stops: FeatureCollection<Point>; // the stop dots of the selected pattern
  bounds: Bounds; // the selected pattern (app_design 5.7)
}

export function routeMap(d: Core, lines: Map<PatternKey, DecodedLine>, r: Route): RouteMap {
  const lcls = r.line.cls;
  const features: Feature<LineString>[] = [];
  const bounds = emptyBounds();
  for (const dir of r.dirs) {
    for (const pid of r.line.dirs[dir]) {
      const l = lines.get(pid);
      if (!l) continue;
      const part = pid === r.pid ? "selected" : "other";
      features.push({
        type: "Feature",
        properties: { pid, line: r.line.id, dir, cls: d.patterns[pid]![3], lcls, part, len: lengthM(l.coords) },
        geometry: { type: "LineString", coordinates: positions(l.coords) },
      });
      if (part === "selected") extendCoords(bounds, l.coords);
    }
  }

  // The stops of the selected pattern. The stops of the station of the context are pins (prod_design 5.6),
  // not dots. A stop that occurs two times in the pattern has one dot; it is an end if one of its
  // occurrences is the first or the last stop.
  const keys = d.patterns[r.pid]![4];
  const pins = new Set(r.pins);
  const dots = new Map<string, boolean>();
  keys.forEach((k, i) => {
    if (pins.has(k)) return;
    dots.set(k, (dots.get(k) ?? false) || i === 0 || i === keys.length - 1);
  });
  const stops: Feature<Point>[] = [...dots].map(([k, end]) => ({
    type: "Feature",
    properties: { k, end, lcls },
    geometry: { type: "Point", coordinates: [d.stops[k]![3], d.stops[k]![2]] },
  }));
  return { data: { type: "FeatureCollection", features }, stops: { type: "FeatureCollection", features: stops }, bounds };
}
