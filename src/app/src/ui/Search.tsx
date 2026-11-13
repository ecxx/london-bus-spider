// app_design 6.6: the search field and its results.
//
// The field is a combobox: the keyboard focus stays in the field, and the Up and Down keys move the
// selection in the results (aria-activedescendant). Enter opens the selected result. Esc clears the field.
import type { RefObject } from "preact";
import { useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { Core } from "../data/load";
import { matchRange, search, searchIndex, stationResultText, stepSelection, type SearchIndex, type SearchResult } from "../model/search";
import { homeRouteRow, norm, stationRing } from "../model/text";
import { viewHash } from "../model/url";
import { go } from "../state/router";
import { query } from "../state/signals";
import { Badge, StationRing } from "./marks";

export const RESULTS_ID = "results";
const optionId = (i: number) => `sr-${i}`;

// The index sorts all the stations. Make it at the first search, not at the load.
const indexes = new WeakMap<Core, SearchIndex>();
function indexOf(d: Core): SearchIndex {
  let ix = indexes.get(d);
  if (!ix) indexes.set(d, (ix = searchIndex(d)));
  return ix;
}

const resultHash = (r: SearchResult): string =>
  viewHash(r.kind === "line" ? { kind: "route", line: r.line.id } : { kind: "station", key: r.key });

// A result always opens its view. The field is cleared, and the focus leaves it (the phone keyboard closes).
function pick(r: SearchResult | undefined): void {
  if (!r) return;
  query.value = "";
  document.querySelector<HTMLInputElement>("#q")?.blur();
  go(resultHash(r));
}

export interface SearchState {
  text: string; // the text of the field, in the search form
  results: SearchResult[];
  active: number; // the selected result
  onKeyDown: (e: KeyboardEvent) => void;
}

export function useSearch(d: Core | null): SearchState {
  const q = query.value;
  const text = norm(q);
  const results = useMemo(() => (d && text ? search(indexOf(d), text) : []), [d, text]);
  // The selection is of one text. A new text selects the first result.
  const [sel, setSel] = useState({ text: "", i: 0 });
  const active = sel.text === text && sel.i < results.length ? sel.i : 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); // the cursor stays in the text
      setSel({ text, i: stepSelection(active, results.length, e.key === "ArrowDown" ? 1 : -1) });
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      query.value = "";
      (e.currentTarget as HTMLInputElement).blur();
    }
  };
  return { text, results, active, onKeyDown };
}

// The ARIA properties of the field.
export const comboProps = (s: SearchState) => ({
  role: "combobox" as const, // a text input: ARIA in HTML allows a combobox on type=search only with a list
  "aria-autocomplete": "list" as const,
  "aria-controls": s.results.length ? RESULTS_ID : undefined,
  "aria-expanded": s.results.length > 0,
  "aria-activedescendant": s.results.length ? optionId(s.active) : undefined,
});

// The name of a station, with the matched text in --red-ink.
function Marked({ name, text }: { name: string; text: string }) {
  const m = matchRange(name, text);
  if (!m) return <>{name}</>;
  return (
    <>
      {name.slice(0, m[0])}
      <mark>{name.slice(m[0], m[1])}</mark>
      {name.slice(m[1])}
    </>
  );
}

function ResultRow({ d, r, i, active, text }: { d: Core; r: SearchResult; i: number; active: boolean; text: string }) {
  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // a new tab or window
    e.preventDefault();
    pick(r);
  };
  const common = {
    id: optionId(i),
    class: `row${active ? " is-active" : ""}`,
    href: resultHash(r),
    role: "option" as const,
    "aria-selected": active,
    tabIndex: -1, // the focus stays in the field (the combobox pattern)
    onClick,
  };
  if (r.kind === "line") {
    return (
      <li role="presentation">
        <a {...common}>
          <Badge line={r.line} />
          <span class="row-main">
            <span class="row-title">Route {r.line.name}</span>
            <span class="row-sub">{homeRouteRow(d, r.line).title}</span>
          </span>
        </a>
      </li>
    );
  }
  const ring = stationRing(d, r.key);
  return (
    <li role="presentation">
      <a {...common} data-station={r.key}>
        <StationRing text={ring.text} stand={ring.stand} long={ring.long} />
        <span class="row-main">
          <span class="row-title">
            <Marked name={r.name} text={text} />
          </span>
          <span class="row-sub">{stationResultText(d, r.key)}</span>
        </span>
      </a>
    </li>
  );
}

// The results, below the top part of the panel. Nothing when the field has no text.
export function SearchResults({ d, s, box }: { d: Core | null; s: SearchState; box: RefObject<HTMLDivElement | null> }) {
  // Keep the selected result in view.
  useLayoutEffect(() => {
    box.current?.querySelector(`#${optionId(s.active)}`)?.scrollIntoView({ block: "nearest" });
  }, [s.active, s.results]);

  if (!d || !s.text) return null;
  if (!s.results.length) {
    return (
      <div class="empty" role="status">
        No routes or stations match “{query.value.trim()}”.
      </div>
    );
  }
  return (
    <ul class="list" id={RESULTS_ID} role="listbox" aria-label="Search results">
      {s.results.map((r, i) => (
        <ResultRow key={r.kind === "line" ? `l${r.line.id}` : `s${r.key}`} d={d} r={r} i={i} active={i === s.active} text={s.text} />
      ))}
    </ul>
  );
}
