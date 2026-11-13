// Distances on the ground and the Web Mercator projection. A position is [lon, lat].

export type LngLat = [lon: number, lat: number];
// [minLon, minLat, maxLon, maxLat]
export type Bounds = [number, number, number, number];

const EARTH_M = 6_371_008.8; // the mean radius of the Earth
const RAD = Math.PI / 180;

// The great-circle distance in metres.
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The length in metres of the points from..to of decoded coordinates (prod_design 5.3, the property len).
export function lengthM(coords: Float64Array, from = 0, to = coords.length / 2 - 1): number {
  let m = 0;
  for (let i = from + 1; i <= to; i++) {
    m += distanceM([coords[2 * i - 2]!, coords[2 * i - 1]!], [coords[2 * i]!, coords[2 * i + 1]!]);
  }
  return m;
}

export const emptyBounds = (): Bounds => [Infinity, Infinity, -Infinity, -Infinity];

export function extend(b: Bounds, p: LngLat): Bounds {
  if (p[0] < b[0]) b[0] = p[0];
  if (p[1] < b[1]) b[1] = p[1];
  if (p[0] > b[2]) b[2] = p[0];
  if (p[1] > b[3]) b[3] = p[1];
  return b;
}

// Add the points from..to of decoded coordinates to the bounds.
export function extendCoords(b: Bounds, coords: Float64Array, from = 0, to = coords.length / 2 - 1): Bounds {
  for (let i = from; i <= to; i++) extend(b, [coords[2 * i]!, coords[2 * i + 1]!]);
  return b;
}

export const isEmpty = (b: Bounds): boolean => b[0] > b[2];

// Web Mercator, as a fraction of the world: x from 0 (180° W) to 1, y from 0 (north) to 1.
export const mercX = (lon: number): number => (lon + 180) / 360;
export const mercY = (lat: number): number => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / Math.PI) / 2;
export const lonOf = (x: number): number => x * 360 - 180;
export const latOf = (y: number): number => (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - Math.PI / 2) / RAD;
