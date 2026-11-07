// prod_design 5.5: hover and click on the map. The routes at the pointer (at most one time each frame),
// the tooltips, the highlight and the route menu (app_design 6.4). The tooltips and the clicks of the
// station dots (app_design 5.5), of the stop dots of the route view (app_design 6.5) and of the stop pins.
import type { Map, MapGeoJSONFeature, MapMouseEvent, PointLike } from "maplibre-gl";
import type { Core } from "../data/load";
import type { PatternKey, StopKey } from "../data/types";
import { mercX, mercY } from "../model/geo";
import { distanceToLine, hoverItems, type Highlight, type HoverItem } from "../model/hover";
import type { RouteContext } from "../model/route";
import { stopsText } from "../model/stopCode";
import { stationName, stopCode, stopName } from "../model/text";
import { viewHash } from "../model/url";
import { go } from "../state/router";
import { cover, highlight } from "../state/signals";
import { nameTip, RouteMenu, routesTip, Tooltip } from "./overlay";
import type { AfterSection } from "./spider";

const HIT_PX = 5; // a route 5 px or less from the pointer is at the pointer (app_design 6.4)
const TILE = 512; // MapLibre: one world unit is TILE * 2^zoom px
const LINE_DY = 8; // px between the pointer and a route tooltip
const DOT_DY = 10; // px between a station dot and its tooltip
const PIN_DY = 4; // px between a stop pin and its tooltip

const onMarker = (e: MapMouseEvent): boolean => !!(e.originalEvent.target as Element | null)?.closest?.(".maplibregl-marker");

export interface HoverSource {
  core: () => Core | null;
  sections: () => ReadonlyMap<PatternKey, AfterSection> | null; // the sections after the stop of the view
  ctx: () => RouteContext | null; // the stop or the station that a route opens from
}

export class MapHover {
  readonly tip: Tooltip;
  readonly menu: RouteMenu;
  private pt: { x: number; y: number } | null = null;
  private frame = 0;
  private key = ""; // the items of the tooltip now
  private lit: Highlight | null = null; // the highlight that the map hover wrote
  private onPin = false;

  constructor(
    private map: Map,
    layer: HTMLElement,
    private src: HoverSource,
  ) {
    this.tip = new Tooltip(layer, () => cover.peek());
    this.menu = new RouteMenu(map, layer, () => cover.peek(), (h) => (highlight.value = h));
    map.on("mousemove", (e) => {
      // A marker (an end label, a pin, a station name) is above the lines: no route at the pointer.
      if (onMarker(e)) return this.end();
      this.pt = e.point;
      if (!this.frame) this.frame = requestAnimationFrame(() => this.update());
    });
    map.on("mouseout", () => this.end());
    map.on("click", (e) => this.click(e));
  }

  // The routes at a point of the map: step 1 finds the candidates in the tiles, step 2 keeps the
  // patterns whose decoded line is HIT_PX or less from the point.
  routesAt(p: { x: number; y: number }): HoverItem[] {
    const d = this.src.core();
    const sections = this.src.sections();
    if (!d || !sections || !this.map.getLayer("spider-after")) return [];
    const box: [PointLike, PointLike] = [
      [p.x - HIT_PX, p.y - HIT_PX],
      [p.x + HIT_PX, p.y + HIT_PX],
    ];
    const pids = new Set(this.map.queryRenderedFeatures(box, { layers: ["spider-after"] }).map((f) => f.properties.pid as PatternKey));
    if (!pids.size) return [];
    const ll = this.map.unproject([p.x, p.y]);
    const x = mercX(ll.lng);
    const y = mercY(ll.lat);
    const tol = HIT_PX / (TILE * 2 ** this.map.getZoom());
    const near = [...pids].filter((pid) => {
      const s = sections.get(pid);
      if (!s || x < s.box[0] - tol || x > s.box[2] + tol || y < s.box[1] - tol || y > s.box[3] + tol) return false;
      return distanceToLine(s.merc, x, y) <= tol;
    });
    return hoverItems(d, near);
  }

  // The dot at a point: a stop dot of the route view, else a station dot (the stop dots are above).
  private dotAt(p: { x: number; y: number }): { kind: "stop" | "station"; k: string; f: MapGeoJSONFeature } | undefined {
    for (const [layer, kind] of [
      ["route-stops", "stop"],
      ["station-dots", "station"],
    ] as const) {
      if (!this.map.getLayer(layer)) continue;
      const f = this.map.queryRenderedFeatures([p.x, p.y], { layers: [layer] })[0];
      if (f) return { kind, k: f.properties.k as string, f };
    }
    return undefined;
  }

  private href(i: HoverItem): string {
    return viewHash({ kind: "route", line: i.line.id, dir: i.dir, ...(this.src.ctx() ? { ctx: this.src.ctx()! } : {}) });
  }

  private setHighlight(h: Highlight | null): void {
    this.lit = h;
    highlight.value = h;
  }

  private update(): void {
    this.frame = 0;
    const d = this.src.core();
    if (!this.pt || !d || this.onPin) return;
    const box = this.map.getContainer().getBoundingClientRect();
    const x = box.left + this.pt.x;
    const y = box.top + this.pt.y;

    // The dots are above the lines (prod_design 5.4).
    const dot = this.dotAt(this.pt);
    if (dot) {
      const { kind, k } = dot;
      if (this.key !== `${kind}|${k}`) {
        this.clearRoutes();
        this.key = `${kind}|${k}`;
        const [lon, lat] = (dot.f.geometry as GeoJSON.Point).coordinates as [number, number];
        const at = this.map.project([lon, lat]);
        this.tip.show(kind === "stop" ? stopTip(d, k) : stationTip(d, k), box.left + at.x, box.top + at.y, DOT_DY);
      }
      this.map.getCanvas().style.cursor = "pointer";
      return;
    }

    const items = this.routesAt(this.pt);
    if (!items.length) return this.end();
    const key = items.map((i) => `${i.line.id}|${i.to}`).join();
    if (key !== this.key) {
      this.key = key;
      this.tip.show(routesTip(items), x, y, LINE_DY);
      this.setHighlight({ lines: [...new Set(items.map((i) => i.line.id))], dir: null, map: true });
    } else this.tip.move(x, y, LINE_DY);
    this.map.getCanvas().style.cursor = "pointer";
  }

  private clearRoutes(): void {
    if (this.lit && highlight.peek() === this.lit) highlight.value = null;
    this.lit = null;
  }

  // The pointer is on no line and no dot: stop the hover and close the tooltip.
  end(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.clearRoutes();
    if (!this.onPin) this.tip.hide();
    this.key = "";
    this.map.getCanvas().style.cursor = "";
  }

  private click(e: MapMouseEvent): void {
    const d = this.src.core();
    if (!d || onMarker(e)) return;
    const dot = this.dotAt(e.point);
    if (dot) {
      this.menu.close();
      return go(viewHash({ kind: dot.kind, key: dot.k }));
    }
    const items = this.routesAt(e.point);
    if (items.length === 1) {
      this.menu.close();
      return go(this.href(items[0]!));
    }
    if (items.length > 1) {
      this.end();
      this.menu.open(items, [e.lngLat.lng, e.lngLat.lat], (i) => this.href(i));
      return;
    }
    this.menu.close();
  }

  // The tooltip of a stop pin: the stop name and its text form (app_design 3.5).
  pinEnter(k: StopKey, el: HTMLElement): void {
    const d = this.src.core();
    if (!d) return;
    this.end();
    this.onPin = true;
    const r = el.firstElementChild!.getBoundingClientRect();
    this.tip.show(stopTip(d, k), r.left + r.width / 2, r.top + r.height / 2, r.height / 2 + PIN_DY);
  }

  pinLeave(): void {
    this.onPin = false;
    this.tip.hide();
  }
}

// The tooltip of a station dot: the name and its stops (app_design 3.5, 5.5).
function stationTip(d: Core, k: string): (Node | string)[] {
  const ks = d.stationStops.get(k) ?? [];
  const sub = stopsText(ks.map((s) => ({ indicator: d.stops[s]![1], heading: d.stops[s]![5], name: stopName(d, s) })));
  return nameTip(stationName(d, k), sub, true);
}

// The tooltip of a stop pin or a stop dot: the stop name and its text form (app_design 3.5).
const stopTip = (d: Core, k: StopKey): (Node | string)[] => nameTip(stopName(d, k), stopCode(d, k).text, false);
