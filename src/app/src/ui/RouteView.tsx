// app_design 6.5: the body of the route view, under the header. The direction tabs, the variants and
// the stop list. The scroll to the first red stop is in Panel.tsx (it needs the height of the panel).
import type { Core } from "../data/load";
import { directionTab, stopMark, variants } from "../model/route";
import { isLimited, stopCode, stopName } from "../model/text";
import { viewHash, type View } from "../model/url";
import type { Route } from "../state/route";

// The URL of a direction or a variant, from the same stop or station.
function routeHash(r: Route, dir: string, n?: number): string {
  const v: View = { kind: "route", line: r.line.id, dir };
  if (n !== undefined) v.n = String(n);
  if (r.ctx) v.ctx = r.ctx;
  return viewHash(v);
}

// One tab for each direction that has patterns, outbound first: "To" + the last stop of its main pattern.
function Directions({ d, r }: { d: Core; r: Route }) {
  if (r.dirs.length < 2) return null;
  return (
    <div class="tabs" role="group" aria-label="Directions">
      {r.dirs.map((x) => (
        <a key={x} class="tab" href={routeHash(r, x)} aria-current={x === r.dir ? "true" : undefined} data-dir={x}>
          {directionTab(d, r.line, x)}
        </a>
      ))}
    </div>
  );
}

// The patterns of the direction, if it has two or more.
function Variants({ d, r }: { d: Core; r: Route }) {
  const vs = variants(d, r.pids);
  if (!vs.length) return null;
  return (
    <div class="variants" role="group" aria-label="Variants">
      {vs.map((v, i) => (
        <a key={r.pids[i]} class="variant" href={routeHash(r, r.dir, i + 1)} aria-current={i + 1 === r.n ? "true" : undefined}>
          <span class="v-title">
            {v.title}
            {v.limited && <span class="tag">Limited</span>}
          </span>
          <span class="v-sub">{v.sub}</span>
        </a>
      ))}
    </div>
  );
}

// One row for each stop, on a rail in the line colour (dashed for a limited pattern). The first and the
// last stop have a filled dot. The stops of the context are red (app_design 6.5, "Context").
function StopList({ d, r }: { d: Core; r: Route }) {
  const stops = d.patterns[r.pid]![4];
  const last = stops.length - 1;
  const cls = ["tl", r.line.cls === "night" ? "night" : "", isLimited(d, r.pid) ? "limited" : ""].join(" ");
  return (
    <ol class={cls} aria-label="Stops">
      {stops.map((k, i) => {
        const code = stopCode(d, k).code;
        return (
          // A stop can occur two times in a pattern (export_format 4.4): the key is the index.
          <li key={i} class={[stopMark(r, k) ?? "", i === 0 || i === last ? "end" : ""].join(" ")}>
            <a class="row" href={viewHash({ kind: "stop", key: k })} data-stop={k}>
              <span class="row-main">
                <span class="row-title">
                  {stopName(d, k)}
                  {code && <span class="ind">{code}</span>}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export function RouteView({ d, r }: { d: Core; r: Route }) {
  const tabs = r.dirs.length > 1 || r.pids.length > 1;
  return (
    <>
      {tabs && (
        <div class="toolbar">
          <Directions d={d} r={r} />
          <Variants d={d} r={r} />
        </div>
      )}
      <StopList d={d} r={r} />
    </>
  );
}
