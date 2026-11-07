// app_design 6.5: the route view. The panel and the map read it. It changes when a route view opens.
import { computed } from "@preact/signals";
import type { StopKey } from "../data/types";
import { routeView, type RouteView } from "../model/route";
import { core, view } from "./signals";

export interface Route extends RouteView {
  pins: StopKey[]; // the stops of the station of the context (app_design 6.5, "Context")
  stop: StopKey | null; // the stop of the context: the selected pin
}

export const route = computed((): Route | null => {
  const d = core.value;
  const v = view.value;
  if (!d || v.kind !== "route") return null;
  const r = routeView(d, v.line, v.dir, v.n, v.ctx);
  if (!r) return null;
  const pins = r.station ? (d.stationStops.get(r.station) ?? []) : [];
  return { ...r, pins, stop: r.ctx?.kind === "stop" ? r.ctx.key : null };
});
