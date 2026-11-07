// app_design 6.2, 6.3 and 6.4: the body of the station view and of the stop view, under the header.
// The stop chips, the filter chips and the list of routes.
import type { Core } from "../data/load";
import type { StopKey } from "../data/types";
import { highlights } from "../model/hover";
import type { Filter } from "../model/spider";
import { stopLabel, stopRoundel } from "../model/text";
import { viewHash } from "../model/url";
import { filter, highlight } from "../state/signals";
import type { Spider } from "../state/spider";
import { Badge, ChevronRight, Roundel } from "./marks";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["day", "Day"],
  ["night", "Night"],
];

function StopChip({ d, k, current }: { d: Core; k: StopKey; current: boolean }) {
  const r = stopRoundel(d, k);
  return (
    <a class="chip stop" href={viewHash({ kind: "stop", key: k })} aria-current={current ? "true" : undefined} data-stop={k}>
      <Roundel text={r.text} stand={r.stand} />
      {stopLabel(d, k)}
    </a>
  );
}

// The station view: one chip for each stop. The stop view: the chips if the station has two or more
// stops (the current stop is selected), and "All n", which opens the station view.
function StopChips({ d, s }: { d: Core; s: Spider }) {
  if (s.stop && s.pins.length < 2) return null;
  return (
    <div class="toolbar">
      <div class="chip-row" role="group" aria-label="Stops">
        {s.pins.map((k) => (
          <StopChip key={k} d={d} k={k} current={k === s.stop} />
        ))}
        {s.stop && (
          <a class="chip" href={viewHash({ kind: "station", key: s.station })}>
            All {s.pins.length}
          </a>
        )}
      </div>
    </div>
  );
}

// app_design 6.4: the pointer on a row highlights that direction of the route. The rows of the
// highlighted routes are marked, and the other rows are dimmed.
export function SpiderView({ d, s }: { d: Core; s: Spider }) {
  const h = highlight.value;
  return (
    <>
      <StopChips d={d} s={s} />
      <div class="toolbar">
        <div class="chip-row" role="group" aria-label="Filter">
          {FILTERS.map(([f, label]) => (
            <button key={f} class="chip" type="button" aria-pressed={s.filter === f} onClick={() => (filter.value = f)}>
              {label} <span class="n">{s.counts[f]}</span>
            </button>
          ))}
        </div>
      </div>
      {s.shown.length ? (
        <ul class={h ? "list services has-hot" : "list services"} onMouseLeave={() => (highlight.value = null)}>
          {s.shown.map((r) => (
            <li key={`${r.line.id}|${r.dir}`}>
              <a
                class={highlights(h, r.line.id, r.dir) ? "row is-hot" : "row"}
                href={viewHash({ kind: "route", line: r.line.id, dir: r.dir, ctx: s.ctx })}
                data-line={r.line.id}
                data-dir={r.dir}
                onMouseEnter={() => (highlight.value = { lines: [r.line.id], dir: r.dir })}
              >
                <Badge line={r.line} />
                <span class="row-main">
                  <span class="row-title">
                    <span class="to">{r.to ? "to" : "from"}</span>
                    {r.title}
                  </span>
                  <span class="row-sub">{r.sub}</span>
                </span>
                <ChevronRight />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div class="empty">No buses call here.</div>
      )}
    </>
  );
}
