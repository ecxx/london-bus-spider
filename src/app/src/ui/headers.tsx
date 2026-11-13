// The header of each view (app_design 6.2, 6.3, 6.5, 6.7). The folded panel shows a copy (app_design 4.2).
import type { Core } from "../data/load";
import { routeHeader } from "../model/route";
import { stationName, stationOf, stopCode, stopName, stopRoundel } from "../model/text";
import { viewHash, type View } from "../model/url";
import { route } from "../state/route";
import { goUp } from "../state/router";
import { Badge, CloseIcon, Roundel, StationRing } from "./marks";

const Close = () => (
  <button class="close" type="button" aria-label="Close" title="Close" onClick={goUp}>
    <CloseIcon />
  </button>
);

export function ViewHeader({ d, view }: { d: Core; view: View }) {
  switch (view.kind) {
    case "station": {
      const n = d.stationStops.get(view.key)!.length;
      return (
        <div class="head center">
          <StationRing text={String(n)} size="lg" />
          <div class="head-main">
            <h1 tabIndex={-1}>{stationName(d, view.key)}</h1>
          </div>
          <Close />
        </div>
      );
    }
    case "stop": {
      const st = stationOf(d, view.key);
      const r = stopRoundel(d, view.key);
      const text = stopCode(d, view.key).text;
      return (
        <div class="head">
          <Roundel text={r.text} stand={r.stand} size="lg" />
          <div class="head-main">
            <h1 tabIndex={-1}>{stopName(d, view.key)}</h1>
            <p class="one-line">
              {text && <span>{text} ·&nbsp;</span>}
              <a class="link" href={viewHash({ kind: "station", key: st })} title={stationName(d, st)}>
                {stationName(d, st)}
              </a>
            </p>
          </div>
          <Close />
        </div>
      );
    }
    case "route": {
      const r = route.value;
      if (!r) return null;
      const h = routeHeader(d, r.pid);
      return (
        <div class="head">
          <Badge line={r.line} size="lg" />
          <div class="head-main">
            <h1 tabIndex={-1}>{h.title}</h1>
            <p>{h.sub}</p>
          </div>
          <Close />
        </div>
      );
    }
    case "about":
      return (
        <div class="head center">
          <div class="head-main">
            <h1 tabIndex={-1}>About</h1>
          </div>
          <Close />
        </div>
      );
    default:
      return null;
  }
}
