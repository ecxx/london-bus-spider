// prod_design 5.3: the stations source. One point for each station that has stops.
import type { FeatureCollection, Point } from "geojson";
import type { Core } from "../data/load";

export function stationsSource(d: Core): FeatureCollection<Point> {
  const features: FeatureCollection<Point>["features"] = [];
  for (const k of d.stationStops.keys()) {
    const [, lat, lon] = d.stations[k]!;
    features.push({ type: "Feature", properties: { k }, geometry: { type: "Point", coordinates: [lon, lat] } });
  }
  return { type: "FeatureCollection", features };
}
