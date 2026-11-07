// The encoded polyline of export_format 5 (precision 5, each point latitude then longitude).

// Decode to [lon0, lat0, lon1, lat1, ...]. The first pass counts the values: the last character of
// each value has a code less than 95 (no continuation bit).
export function decodePolyline(s: string): Float64Array {
  let values = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 95) values++;
  const out = new Float64Array(values);
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number => {
    let r = 0;
    let shift = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      r |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  for (let p = 0; p < values; p += 2) {
    lat += next();
    lon += next();
    out[p] = lon / 1e5;
    out[p + 1] = lat / 1e5;
  }
  return out;
}

// The number of points of decoded coordinates.
export const pointCount = (coords: Float64Array): number => coords.length / 2;

// The point i of decoded coordinates, as [lon, lat].
export const pointAt = (coords: Float64Array, i: number): [lon: number, lat: number] => [coords[2 * i]!, coords[2 * i + 1]!];

// The points from..to (inclusive) as GeoJSON positions.
export function positions(coords: Float64Array, from = 0, to = coords.length / 2 - 1): [number, number][] {
  const out: [number, number][] = new Array(Math.max(0, to - from + 1));
  for (let i = from; i <= to; i++) out[i - from] = [coords[2 * i]!, coords[2 * i + 1]!];
  return out;
}
