// prod_design 6: the state that the panel and the map share. The components write the signals,
// the code in map/ reads them in effect functions.
import { computed, signal } from "@preact/signals";
import type { Core } from "../data/load";
import type { DecodedLine, PatternKey, StationKey, StopKey } from "../data/types";
import type { Highlight } from "../model/hover";
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
export const highlight = signal<Highlight | null>(null);
export const rowHover = signal<{ kind: "stop"; key: StopKey } | { kind: "station"; key: StationKey } | null>(null);
export const query = signal("");

// The colour scheme (app_design 3.1): ?theme=light or ?theme=dark, else the choice of the user, else the
// system setting. index.html reads the same URL parameter and storage key before the first paint.
export type Scheme = "light" | "dark";
const THEME_KEY = "theme"; // the localStorage key of the choice of the user
const asScheme = (v: string | null): Scheme | null => (v === "light" || v === "dark" ? v : null);
function savedScheme(): Scheme | null {
  try {
    return asScheme(localStorage.getItem(THEME_KEY));
  } catch {
    return null; // the browser blocks the storage
  }
}
export const chosenScheme = signal<Scheme | null>(asScheme(new URLSearchParams(location.search).get("theme")) ?? savedScheme());
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const systemScheme = signal<Scheme>(darkQuery.matches ? "dark" : "light");
darkQuery.addEventListener("change", (e) => (systemScheme.value = e.matches ? "dark" : "light"));
export const scheme = computed<Scheme>(() => chosenScheme.value ?? systemScheme.value);

// The control of the about view (app_design 6.7). null: follow the system setting.
export function chooseScheme(s: Scheme | null): void {
  chosenScheme.value = s;
  try {
    if (s) localStorage.setItem(THEME_KEY, s);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // The choice stays for this page only.
  }
}

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
