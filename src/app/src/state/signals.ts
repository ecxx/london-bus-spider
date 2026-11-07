// prod_design 6: the state that the panel and the map share. The components write the signals,
// the code in map/ reads them in effect functions.
import { signal } from "@preact/signals";
import type { Core } from "../data/load";
import type { DecodedLine, Direction, LineId, PatternKey, StationKey, StopKey } from "../data/types";
import type { Filter } from "../model/spider";
import type { View } from "../model/url";
import { PHONE_MAX_PX } from "../params";

// The data (prod_design 4.1). core: after step 3 of the load. lines: after step 4.
export const core = signal<Core | null>(null);
export const lines = signal<Map<PatternKey, DecodedLine> | null>(null);
export const loadError = signal<string | null>(null);

export const view = signal<View>({ kind: "home" });
export const folded = signal(false);
export type HomeTab = "routes" | "stations";
export const homeTab = signal<HomeTab>("routes");
export const homeScroll = signal<Record<HomeTab, number>>({ routes: 0, stations: 0 });
export const filter = signal<Filter>("all");
export const highlight = signal<{ lines: LineId[]; dir: Direction | null } | null>(null);
export const rowHover = signal<{ kind: "stop"; key: StopKey } | { kind: "station"; key: StationKey } | null>(null);
export const query = signal("");

// The colour scheme: ?theme=light or ?theme=dark overrides the system setting (app_design 3.1).
export type Scheme = "light" | "dark";
const forced = new URLSearchParams(location.search).get("theme");
export const forcedScheme: Scheme | null = forced === "light" || forced === "dark" ? forced : null;
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
export const scheme = signal<Scheme>(forcedScheme ?? (darkQuery.matches ? "dark" : "light"));
if (!forcedScheme) darkQuery.addEventListener("change", (e) => (scheme.value = e.matches ? "dark" : "light"));

// The window layout (app_design 4.1).
const phoneQuery = matchMedia(`(max-width: ${PHONE_MAX_PX}px)`);
export const wide = signal(!phoneQuery.matches);
phoneQuery.addEventListener("change", (e) => (wide.value = !e.matches));

export const reduceMotion = signal(matchMedia("(prefers-reduced-motion: reduce)").matches);
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => (reduceMotion.value = e.matches));

// The part of the window that the panel covers, in px from each edge: the map padding (prod_design 5.7).
// It is the size at the end of a fold animation, not during it. fold: the change comes from a fold or an open.
export interface Cover {
  top: number;
  right: number;
  bottom: number;
  left: number;
  fold: boolean;
}
export const cover = signal<Cover>({ top: 0, right: 0, bottom: 0, left: 0, fold: false });
