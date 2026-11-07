// app_design 3.5: the stop code, from the indicator of the stop (position 1 of stops).

export type StopCodeKind = "letter" | "heading" | "stand" | "none";

export interface StopCode {
  kind: StopCodeKind;
  code: string; // the text in the roundel. "" if the stop has no code: the roundel shows "•".
  text: string; // the text form. "" if the stop has no code: use the stop name.
}

const NONE: StopCode = { kind: "none", code: "", text: "" };

const ARROWS: Record<string, string> = { N: "↑", NE: "↗", E: "→", SE: "↘", S: "↓", SW: "↙", W: "←", NW: "↖" };

const LETTER = /^(?:Stop\s+)?([A-Z0-9]{1,3})$/; // "Stop RC", or a bare code "C"
const STAND = /^Stand(?:\s+([A-Z0-9]{1,3}))?$/; // "Stand GF", or "Stand" with no code
const HEADING = /^(?:->\s*([NSEW]{1,2})(\d*)|([NSEW]{1,2})-bound)$/; // "->NW", "->W1", "NW-bound"

export function parseIndicator(ind: string | null): StopCode {
  if (!ind) return NONE;
  let m = LETTER.exec(ind);
  if (m) return { kind: "letter", code: m[1]!, text: `Stop ${m[1]}` };
  m = STAND.exec(ind);
  if (m) return m[1] ? { kind: "stand", code: m[1], text: `Stand ${m[1]}` } : { kind: "stand", code: "", text: "Stand" };
  m = HEADING.exec(ind);
  const dir = m && (m[1] ?? m[3]);
  if (m && dir && ARROWS[dir]) {
    const n = m[2] ?? "";
    return { kind: "heading", code: ARROWS[dir] + n, text: `${dir}-bound${n ? " " + n : ""}` };
  }
  return otherIndicator(ind);
}

// D18: an indicator that is not in the table of app_design 3.5, for example "opp", "adj",
// "Northbound" or "Stop ->E". Current rule (the rule of the design demo): the stop has no code.
// The roundel shows "•" and the text form is the stop name.
export function otherIndicator(_ind: string): StopCode {
  return NONE;
}

// The text in the roundel (app_design 3.4).
export const roundelText = (c: StopCode): string => c.code || "•";

// The text form of a stop: "Stop RC", "NW-bound", "Stand GF", or the stop name.
export const stopLabel = (c: StopCode, name: string): string => c.text || name;

// app_design 3.5: the stops of a station. "Stops A, B" if all stops have a letter, else the text forms.
export function stopsText(stops: { indicator: string | null; name: string }[]): string {
  const codes = stops.map((s) => parseIndicator(s.indicator));
  if (codes.length && codes.every((c) => c.kind === "letter")) {
    return (codes.length === 1 ? "Stop " : "Stops ") + codes.map((c) => c.code).join(", ");
  }
  return stops.map((s, i) => stopLabel(codes[i]!, s.name)).join(", ");
}

// The order of the stops of a station (the stop chips, the pins): by code, then by key, as in the design demo.
export function compareStopCodes(a: { key: string; code: string }, b: { key: string; code: string }): number {
  return a.code.localeCompare(b.code) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
