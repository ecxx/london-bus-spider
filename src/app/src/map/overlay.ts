// prod_design 5.5: the tooltips and the route menu. DOM elements in a layer above the map and below
// the panel (app_design 5.3). The layer covers the map and takes no pointer events; the menu takes them.
// Thus the events on the menu do not go to the map.
import type { Map } from "maplibre-gl";
import type { Direction, LineId } from "../data/types";
import type { HoverItem } from "../model/hover";
import type { LngLat } from "../model/geo";
import { badge, el } from "./dom";

const EDGE = 8; // px: a tooltip or the menu stays this far in from the edges of the free area

// The part of the window that the panel covers (state/signals.ts, cover).
export type Area = () => { top: number; right: number; bottom: number; left: number };

export function overlayLayer(): HTMLElement {
  const layer = el("div", "map-layer");
  document.body.append(layer);
  return layer;
}

// Put an element above the point (x, y), dy px higher, in the free area (not under the panel).
function place(e: HTMLElement, w: number, h: number, x: number, y: number, dy: number, c: ReturnType<Area>): void {
  const left = Math.max(c.left + EDGE, Math.min(innerWidth - c.right - EDGE - w, x - w / 2));
  let top = y - dy - h;
  if (top < c.top + EDGE) top = Math.min(y + dy, innerHeight - c.bottom - EDGE - h); // no space above: below the point
  e.style.left = `${Math.round(left)}px`;
  e.style.top = `${Math.round(Math.max(c.top + EDGE, top))}px`;
}

export class Tooltip {
  readonly el = el("div", "tip");
  private w = 0;
  private h = 0;

  constructor(
    layer: HTMLElement,
    private area: Area,
  ) {
    this.el.hidden = true;
    this.el.setAttribute("role", "tooltip");
    layer.append(this.el);
  }

  // New content: measure it one time. Then move() puts it at each position with no layout.
  show(content: (Node | string)[], x: number, y: number, dy: number): void {
    this.el.replaceChildren(...content);
    this.el.hidden = false;
    this.w = this.el.offsetWidth;
    this.h = this.el.offsetHeight;
    this.move(x, y, dy);
  }

  move(x: number, y: number, dy: number): void {
    if (!this.el.hidden) place(this.el, this.w, this.h, x, y, dy, this.area());
  }

  hide(): void {
    this.el.hidden = true;
  }
}

// The tooltip of the routes at the pointer (app_design 6.4): "88 to Parliament Hill Fields". If there
// is more than one route: a list, and "Click to choose".
export function routesTip(items: HoverItem[]): (Node | string)[] {
  const limited = (i: HoverItem) => (i.limited ? " · limited" : "");
  if (items.length === 1) {
    const i = items[0]!;
    return [el("b", "", i.line.name), " ", el("span", "muted", `to ${i.to}${limited(i)}`)];
  }
  return [
    el(
      "div",
      "tip-list",
      ...items.map((i) => el("div", "", badge(i.line, "xs"), " ", el("span", "muted", "to"), ` ${i.to}`, i.limited && el("span", "muted", " · limited"))),
    ),
    el("div", "muted tip-hint", "Click to choose"),
  ];
}

// The tooltip of a station dot or a stop pin: the name, and a second text.
export const nameTip = (name: string, sub: string, block: boolean): (Node | string)[] =>
  sub ? [el("b", "", name), block ? el("br", "") : " ", el("span", "muted", sub)] : [el("b", "", name)];

// app_design 6.4: the route menu, "n routes here", at the point of the click. It moves with the map.
export class RouteMenu {
  readonly el = el("div", "pick");
  private at: LngLat | null = null;

  constructor(
    private map: Map,
    layer: HTMLElement,
    private area: Area,
    private onHighlight: (h: { lines: LineId[]; dir: Direction } | null) => void,
  ) {
    this.el.hidden = true;
    this.el.setAttribute("role", "menu");
    this.el.addEventListener("mouseleave", () => this.onHighlight(null));
    layer.append(this.el);
    map.on("move", () => this.place());
  }

  get isOpen(): boolean {
    return this.at !== null;
  }

  open(items: HoverItem[], at: LngLat, href: (i: HoverItem) => string): void {
    const rows = items.map((i) => {
      const a = el(
        "a",
        "row",
        badge(i.line, "sm"),
        el("span", "row-main", el("span", "row-title", el("span", "to", "to"), i.to), i.limited && el("span", "row-sub", "Limited service")),
      );
      a.href = href(i);
      a.setAttribute("role", "menuitem");
      a.addEventListener("mouseenter", () => this.onHighlight({ lines: [i.line.id], dir: i.dir }));
      a.addEventListener("click", () => this.close());
      return a;
    });
    this.el.replaceChildren(el("div", "pick-head", `${items.length} routes here`), ...rows);
    this.el.hidden = false;
    this.at = at;
    this.place();
  }

  close(): void {
    if (!this.at) return;
    this.at = null;
    this.el.hidden = true;
    this.onHighlight(null);
  }

  private place(): void {
    if (!this.at) return;
    const p = this.map.project(this.at);
    const box = this.map.getContainer().getBoundingClientRect();
    place(this.el, this.el.offsetWidth, this.el.offsetHeight, box.left + p.x, box.top + p.y, 4, this.area());
  }
}
