// prod_design 5.6: the stop pins. The stops of the selected station, as roundels (app_design 3.4).
// The selected stop is the large pin. A click opens the stop view. The pointer on a pin shows its tooltip.
import type { Map, Marker } from "maplibre-gl";
import type { Core } from "../data/load";
import type { StopKey } from "../data/types";
import { stopRoundel } from "../model/text";
import { viewHash } from "../model/url";
import { go } from "../state/router";
import { maplibregl } from "./maplibre";

export interface Pin {
  key: StopKey;
  el: HTMLElement;
  marker: Marker;
}

export class Pins {
  pins: Pin[] = [];
  private id = "";

  constructor(
    private map: Map,
    private hover: { enter: (k: StopKey, el: HTMLElement) => void; leave: () => void },
  ) {}

  set(d: Core, keys: StopKey[], selected: StopKey | null): void {
    const id = `${keys.join()}|${selected ?? ""}`;
    if (id === this.id) return;
    this.id = id;
    if (this.pins.some((p) => p.el.matches(":hover"))) this.hover.leave();
    for (const p of this.pins) p.marker.remove();
    this.pins = keys.map((key) => {
      const r = stopRoundel(d, key);
      const el = document.createElement("div");
      el.className = key === selected ? "pin sel" : "pin";
      el.dataset.stop = key;
      el.setAttribute("aria-hidden", "true"); // the stop chips of the panel have the same stops
      const roundel = document.createElement("span");
      roundel.className = r.stand ? "roundel stand" : "roundel";
      roundel.textContent = r.text;
      el.append(roundel);
      el.addEventListener("mouseenter", () => this.hover.enter(key, el));
      el.addEventListener("mouseleave", () => this.hover.leave());
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        go(viewHash({ kind: "stop", key }));
      });
      const [, , lat, lon] = d.stops[key]!;
      return { key, el, marker: new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(this.map) };
    });
  }
}
