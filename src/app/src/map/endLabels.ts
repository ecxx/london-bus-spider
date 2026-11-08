// prod_design 5.6: the end labels and the bubbles of a spider graph (app_design 6.4, 5.4), and the
// station names (app_design 5.4). DOM markers. The groups are made when a spider graph opens; the
// placement is at each settle (prod_design 5.8).
import type { Map, Marker } from "maplibre-gl";
import type { Core } from "../data/load";
import type { Direction, LineInfo, StationKey } from "../data/types";
import { hasEndLabel, isCircular } from "../model/circular";
import { endBadgeSize, endBadgesShown, endGroups, type End, type EndGroup } from "../model/endLabels";
import type { LngLat } from "../model/geo";
import { highlights, type Highlight } from "../model/hover";
import type { RouteContext } from "../model/route";
import { stationName } from "../model/text";
import { viewHash } from "../model/url";
import { go } from "../state/router";
import { highlight } from "../state/signals";
import { badge, el } from "./dom";
import { maplibregl } from "./maplibre";
import type { AfterSection } from "./spider";

const TERM_GAP = 2; // px kept between placed labels (app_design 6.4)
const TERM_KEEP = 40; // px kept free of labels around each selected stop
const LABEL_DY = 8; // px between the end and the bottom of its label (the .term-in CSS)
const NAME_ZOOM = 17; // the station names start at this zoom (app_design 5.4)

type Band = 0 | 1 | 2; // the zoom bands of app_design 5.4: below 12, 12 to 14, from 14
const bandOf = (z: number): Band => (z < 12 ? 0 : z < 14 ? 1 : 2);
const BAND_ZOOM = [11, 13, 15]; // a zoom in each band

interface Label {
  g: EndGroup;
  el: HTMLElement;
  inner: HTMLElement; // .term-in
  marker: Marker;
  made: (Node[] | undefined)[]; // the content of each band, made one time
  size: ({ w: number; h: number } | undefined)[]; // the size of .term-in in each band, measured one time
}

// A box in px of the map container: [left, top, right, bottom].
type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box): boolean =>
  a[0] < b[2] + TERM_GAP && a[2] > b[0] - TERM_GAP && a[1] < b[3] + TERM_GAP && a[3] > b[1] - TERM_GAP;

export interface PinBox {
  at: LngLat;
  size: number; // px: the diameter of the pin
}

export class EndLabels {
  private labels: Label[] = [];
  private band: Band | null = null;
  private ctx: RouteContext | null = null;
  private selected: LngLat[] = [];

  constructor(private map: Map) {}

  // The groups of a new spider graph. after: the sections after the stop. selected: the selected stops.
  set(d: Core, after: AfterSection[], selected: LngLat[], ctx: RouteContext | null): void {
    this.clear();
    this.ctx = ctx;
    this.selected = selected;
    const ends: End[] = after
      .filter((a) => hasEndLabel(isCircular(d, a.pid)))
      .map((a) => ({ at: a.end, line: d.lines.get(a.line)!, dir: a.dir }));
    for (const g of endGroups(ends, selected)) {
      const night = g.items.every((x) => x.line.cls === "night");
      const inner = el("div", "term-in");
      const e = el("div", "term", el("span", `term-dot ${g.items[0]!.line.cls === "night" ? "night" : ""}`), inner, el("div", `term-mini ${night ? "night" : ""}`, String(g.items.length)));
      e.setAttribute("aria-hidden", "true"); // the list of the panel has the same routes
      // A click on a label does not go to the map (prod_design 5.5).
      e.addEventListener("click", (ev) => ev.stopPropagation());
      const marker = new maplibregl.Marker({ element: e }).setLngLat(g.at).addTo(this.map);
      this.labels.push({ g, el: e, inner, marker, made: [], size: [] });
    }
    this.band = null;
  }

  clear(): void {
    for (const l of this.labels) l.marker.remove();
    this.labels = [];
  }

  // The badges of a label in a band: the first ones, then "+n" (the others show on hover).
  private content(l: Label, band: Band): Node[] {
    const z = BAND_ZOOM[band]!;
    const size = endBadgeSize(z);
    const max = endBadgesShown(z);
    const b = (x: { line: LineInfo; dirs: Direction[] }) => {
      const e = badge(x.line, size);
      e.dataset.line = x.line.id;
      e.dataset.dirs = x.dirs.join(" ");
      e.addEventListener("mouseenter", () => (highlight.value = { lines: [x.line.id], dir: null }));
      e.addEventListener("mouseleave", () => (highlight.value = null));
      e.addEventListener("click", () => go(viewHash({ kind: "route", line: x.line.id, dir: x.dirs[0]!, ...(this.ctx ? { ctx: this.ctx } : {}) })));
      return e;
    };
    const shown = l.g.items.slice(0, max).map(b);
    const rest = l.g.items.slice(max);
    if (!rest.length) return shown;
    return [...shown, el("span", "more", ...rest.map(b)), el("span", `count ${size}`, `+${rest.length}`)];
  }

  // Put the content of the band in each label, and measure the labels that are new in this band:
  // first all the writes, then all the reads (one layout).
  private setBand(band: Band): void {
    if (band === this.band) return;
    this.band = band;
    const xs = endBadgeSize(BAND_ZOOM[band]!) === "xs";
    for (const l of this.labels) {
      l.made[band] ??= this.content(l, band);
      l.inner.replaceChildren(...l.made[band]!);
      l.el.classList.toggle("xs", xs);
      // Measure the closed label: not a bubble (its label is hidden) and not open. place() sets them again.
      l.el.classList.remove("is-collapsed", "is-open");
    }
    for (const l of this.labels) l.size[band] ??= { w: l.inner.offsetWidth, h: l.inner.offsetHeight };
  }

  // app_design 6.4: put the labels in sequence from the end farthest from the selected stops. A label
  // that overlaps a placed label, a stop pin or the area of TERM_KEEP px around a selected stop is a bubble.
  place(pins: PinBox[]): void {
    if (!this.labels.length) return;
    const band = bandOf(this.map.getZoom());
    this.setBand(band);
    const placed: Box[] = [];
    for (const p of pins) {
      const q = this.map.project(p.at);
      placed.push([q.x - p.size / 2, q.y - p.size / 2, q.x + p.size / 2, q.y + p.size / 2]);
    }
    for (const s of this.selected) {
      const q = this.map.project(s);
      placed.push([q.x - TERM_KEEP, q.y - TERM_KEEP, q.x + TERM_KEEP, q.y + TERM_KEEP]);
    }
    for (const l of this.labels) {
      const q = this.map.project(l.g.at);
      const { w, h } = l.size[band]!;
      const box: Box = [q.x - w / 2, q.y - LABEL_DY - h, q.x + w / 2, q.y - LABEL_DY];
      const hit = placed.some((p) => overlaps(box, p));
      l.el.classList.toggle("is-collapsed", hit);
      if (!hit) placed.push(box);
    }
    this.mark(highlight.peek());
  }

  // app_design 6.4: a label opens when one of its routes is highlighted. The other badges are dimmed.
  // A label that the hover on the map lines opens takes no pointer events: it can open under the
  // pointer, and the pointer stays on the line (the tooltip, a click on the route).
  mark(h: Highlight | null): void {
    for (const l of this.labels) {
      let any = false;
      for (const b of l.inner.querySelectorAll<HTMLElement>(".badge")) {
        const on = !h || b.dataset.dirs!.split(" ").some((dir) => highlights(h, b.dataset.line!, dir as Direction));
        b.classList.toggle("is-dim", !on);
        any ||= on;
      }
      l.el.classList.toggle("is-dim", !any);
      l.el.classList.toggle("is-open", !!h && any);
      l.el.classList.toggle("is-passive", !!h?.map && any);
    }
  }
}

// app_design 5.4: the station names, from zoom 17, for the stations in view that are not dimmed.
export class StationNames {
  private markers = new globalThis.Map<StationKey, Marker>();

  constructor(private map: Map) {}

  // bright: the stations that are not dimmed (null: all). hidden: the selected station (it has pins).
  place(d: Core, bright: ReadonlySet<StationKey> | null, hidden: StationKey | null): void {
    const want = new Set<StationKey>();
    if (this.map.getZoom() >= NAME_ZOOM && this.map.getLayer("station-dots")) {
      for (const f of this.map.queryRenderedFeatures({ layers: ["station-dots"] })) {
        const k = f.properties.k as StationKey;
        if (k !== hidden && (!bright || bright.has(k))) want.add(k);
      }
    }
    for (const [k, m] of this.markers) {
      if (want.has(k)) continue;
      m.remove();
      this.markers.delete(k);
    }
    for (const k of want) {
      if (this.markers.has(k)) continue;
      const [, lat, lon] = d.stations[k]!;
      const e = el("div", "st-label", el("span", "", stationName(d, k)));
      e.setAttribute("aria-hidden", "true"); // the station list and the search of the panel have the same stations
      this.markers.set(k, new maplibregl.Marker({ element: e }).setLngLat([lon, lat]).addTo(this.map));
    }
  }
}
