// The records of the export (export_format 4), with a name for each position (prod_design 4.2).
// Other code gets a field with destructuring or with the position constants below, not with a number.

export type StopKey = string;
export type StationKey = string;
export type PatternKey = string;
export type LineId = string;

export type Direction = "inbound" | "outbound";
export type ServiceClass = "day" | "night" | "24-hour" | "limited";

// export_format 4.2
export type StopRecord = [name: string, indicator: string | null, lat: number, lon: number, station: StationKey];
export const STOP = { name: 0, indicator: 1, lat: 2, lon: 3, station: 4 } as const;

// export_format 4.3
export type StationRecord = [name: string, lat: number, lon: number];
export const STATION = { name: 0, lat: 1, lon: 2 } as const;

// export_format 4.4
export type PatternRecord = [lineId: LineId, lineName: string, direction: Direction, cls: ServiceClass, stops: StopKey[]];
export const PATTERN = { lineId: 0, lineName: 1, direction: 2, cls: 3, stops: 4 } as const;

// export_format 4.5
export type LineRecord = [polyline: string, stopPoints: (number | null)[]];
export const LINE = { polyline: 0, stopPoints: 1 } as const;

// export_format 4.1
export interface Manifest {
  format: number;
  dataset: string;
  files: { stops: string; stations: string; patterns: string; lines: string };
}

export type Stops = Record<StopKey, StopRecord>;
export type Stations = Record<StationKey, StationRecord>;
export type Patterns = Record<PatternKey, PatternRecord>;
export type Lines = Record<PatternKey, LineRecord>;

// The decoded line of a pattern. coords: [lon0, lat0, lon1, lat1, ...] (the GeoJSON order).
// stopPoints: for each stop of the pattern, the index of its point, or null (export_format 4.5).
export interface DecodedLine {
  coords: Float64Array;
  stopPoints: (number | null)[];
}

// A line (a route): its patterns, by direction, in rank order. The first pattern of a direction is the main pattern.
export interface LineInfo {
  id: LineId;
  name: string;
  cls: ServiceClass; // the class of the main pattern of the line (app_design 3.6)
  dirs: Record<Direction, PatternKey[]>;
}
