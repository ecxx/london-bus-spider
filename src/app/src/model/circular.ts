// D7: circular patterns. The first stop and the last stop of a circular pattern are at the same station.
// Current rule: the client shows them as other patterns. These functions hold the rule.
import type { Core } from "../data/load";
import type { PatternKey } from "../data/types";

export function isCircular(d: Core, pid: PatternKey): boolean {
  const stops = d.patterns[pid]![4];
  return d.stops[stops[0]!]![4] === d.stops[stops.at(-1)!]![4];
}

// D7: the "first stop – last stop" text of a pattern (the route view header, app_design 6.5).
export function patternTitle(first: string, last: string, _circular: boolean): string {
  return `${first} – ${last}`;
}

// D7: a circular pattern has an end label in a spider graph (app_design 6.4), as the other patterns.
export function hasEndLabel(_circular: boolean): boolean {
  return true;
}
