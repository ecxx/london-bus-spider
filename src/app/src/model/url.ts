// app_design 4.3: the URL (hash) of each view.
import type { Core } from "../data/load";
import type { RouteContext } from "./route";

export type View =
  | { kind: "home" }
  | { kind: "about" }
  | { kind: "station"; key: string }
  | { kind: "stop"; key: string }
  | { kind: "route"; line: string; dir?: string; n?: string; ctx?: RouteContext };

const HOME: View = { kind: "home" };

function parts(hash: string): string[] | null {
  try {
    return hash.replace(/^#/, "").split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // a bad % sequence
  }
}

// The view of a hash. A hash that is not in the table of 4.3 gives the home view.
export function parseHash(hash: string): View {
  const p = parts(hash);
  if (!p) return HOME;
  const [a, b, c, d, e, f, ...rest] = p;
  if (rest.length) return HOME;
  if (a === undefined) return HOME;
  if (a === "about" && b === undefined) return { kind: "about" };
  if (a === "line" && b !== undefined && f === undefined && e === undefined) return route(b, c, d);
  if ((a === "station" || a === "stop") && b !== undefined) {
    if (c === undefined) return { kind: a, key: b };
    if (c === "line" && d !== undefined) return route(d, e, f, { kind: a, key: b });
  }
  return HOME;
}

function route(line: string, dir?: string, n?: string, ctx?: RouteContext): View {
  const v: View = { kind: "route", line };
  if (dir !== undefined) v.dir = dir;
  if (n !== undefined) v.n = n;
  if (ctx) v.ctx = ctx;
  return v;
}

const enc = encodeURIComponent;

export function viewHash(v: View): string {
  switch (v.kind) {
    case "home":
      return "#/";
    case "about":
      return "#/about";
    case "station":
    case "stop":
      return `#/${v.kind}/${enc(v.key)}`;
    case "route": {
      const base = v.ctx ? `#/${v.ctx.kind}/${enc(v.ctx.key)}` : "#";
      return `${base}/line/${enc(v.line)}${v.dir !== undefined ? `/${enc(v.dir)}` : ""}${v.n !== undefined ? `/${enc(v.n)}` : ""}`;
    }
  }
}

// D12: a URL with a key that the data does not contain. Current rule (the rule of the design demo):
// open the home view, and replace the history entry. A route with a line that is not in the data
// opens its stop or station, if that is in the data. A route with a stop or station that is not in
// the data opens with no context.
export function resolveView(d: Core, v: View): View {
  const has = (c: RouteContext) => (c.kind === "stop" ? d.stops[c.key] !== undefined : d.stationStops.has(c.key));
  switch (v.kind) {
    case "station":
      return d.stationStops.has(v.key) ? v : HOME;
    case "stop":
      return d.stops[v.key] ? v : HOME;
    case "route": {
      const ctx = v.ctx && has(v.ctx) ? v.ctx : undefined;
      if (!d.lines.has(v.line)) return ctx ? { kind: ctx.kind, key: ctx.key } : HOME;
      if (v.ctx && !ctx) {
        const { ctx: _, ...rest } = v;
        return rest;
      }
      return v;
    }
    default:
      return v;
  }
}

// app_design 4.3: one level up. Route -> the stop or station that opened it -> the station of the stop -> home.
export function upView(d: Core, v: View): View {
  switch (v.kind) {
    case "route":
      return v.ctx ? { kind: v.ctx.kind, key: v.ctx.key } : HOME;
    case "stop": {
      const s = d.stops[v.key];
      return s ? { kind: "station", key: s[4] } : HOME;
    }
    default:
      return HOME;
  }
}
