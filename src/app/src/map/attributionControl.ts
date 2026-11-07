// app_design 5.1: the attribution control. On a wide screen, the full text at all times (CSS).
// On a phone: the full text when the map opens. After a move of the map by the user, or after
// ATTRIB_MS, an (i) button. The button opens the full text in a popup with a close button.
import type { IControl, Map } from "maplibre-gl";
import { ABOUT, CARTO, GEOMNI, OS, OSM, TFL } from "./attribution";

const ATTRIB_MS = 5000;

function link(item: { text: string; href: string }, external: boolean): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = item.href;
  a.textContent = item.text;
  if (external) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  return a;
}

function span(...children: (Node | string)[]): HTMLSpanElement {
  const s = document.createElement("span");
  s.append(...children);
  return s;
}

export class AttributionControl implements IControl {
  private el = document.createElement("div");
  private button = document.createElement("button");
  private timer = 0;
  private map: Map | null = null;

  private onMove = (e: { originalEvent?: unknown }) => {
    if (e.originalEvent) this.collapse(); // a move by the user, not a fit
  };

  onAdd(map: Map): HTMLElement {
    this.map = map;
    const full = document.createElement("div");
    full.className = "attrib-full";
    full.id = "attrib-text";
    full.append(span(link(OSM, true), " ", link(CARTO, true)), span(TFL), span(OS), span(GEOMNI), span(link(ABOUT, false)));
    this.button.type = "button";
    this.button.className = "attrib-i";
    this.button.textContent = "i";
    this.button.setAttribute("aria-label", "Map data sources");
    this.button.setAttribute("aria-controls", "attrib-text");
    this.button.setAttribute("aria-expanded", "false");
    this.button.addEventListener("click", () => this.setOpen(true));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "attrib-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => this.setOpen(false));
    this.el.className = "maplibregl-ctrl attrib";
    this.el.append(full, close, this.button);
    this.timer = window.setTimeout(() => this.collapse(), ATTRIB_MS);
    map.on("movestart", this.onMove);
    return this.el;
  }

  onRemove(): void {
    clearTimeout(this.timer);
    this.map?.off("movestart", this.onMove);
    this.el.remove();
  }

  private collapse(): void {
    clearTimeout(this.timer);
    this.el.classList.add("is-collapsed");
    this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    this.el.classList.toggle("is-open", open);
    this.button.setAttribute("aria-expanded", String(open));
  }
}
