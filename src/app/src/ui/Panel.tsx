// app_design 4.1 and 4.2: the panel, and the fold.
//
// The panel has an explicit height in px, so that a CSS transition animates the fold (prod_design 6).
// The height is the height at the end of the animation:
//   - wide, open: the window height less 2 x 16 px;
//   - phone, open: the height of the content, at most 58% of the window (46% for the home view);
//   - folded: the top part, the search results and the copy of the header.
// The same value gives the cover signal: the part of the window that the panel covers (the map padding).
import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";
import { viewHash } from "../model/url";
import { core, cover, folded, loadError, query, reduceMotion, rowHover, view, wide, type Cover } from "../state/signals";
import { ViewHeader } from "./headers";
import { BusIcon, ChevronUp, SearchIcon } from "./marks";
import { redScroll, ScrollContext, scrollToRed } from "./scroll";
import { comboProps, SearchResults, useSearch } from "./Search";
import { ViewContent } from "./ViewContent";

const SWIPE_PX = 24; // a vertical move on the handle of more than this is a swipe (app_design 4.2)
const FOLD_MS = 250; // the time of the fold animation (also --fold-ms in tokens.css)
const EDGE = 16; // px between the wide panel and the window edges
const PHONE_MAX = 0.58; // the maximum height of the sheet, as a part of the window height
const PHONE_HOME_MAX = 0.46;

const sameCover = (a: Cover, b: Cover) =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left && a.fold === b.fold;

// app_design 5.6: the stop or the station of the row under the pointer, for the hover ring.
function onRowOver(e: MouseEvent): void {
  const r = (e.target as Element).closest?.<HTMLElement>(".row[data-stop], .row[data-station]");
  const next = r?.dataset.stop ? { kind: "stop" as const, key: r.dataset.stop } : r?.dataset.station ? { kind: "station" as const, key: r.dataset.station } : null;
  const now = rowHover.peek();
  if (next?.key !== now?.key || next?.kind !== now?.kind) rowHover.value = next;
}
const onRowLeave = () => (rowHover.value = null);

function setFolded(on: boolean, setFolding: (v: boolean) => void): void {
  if (on === folded.peek()) return;
  setFolding(on && !reduceMotion.peek());
  folded.value = on;
}

export function Panel() {
  const d = core.value;
  const v = view.value;
  const isFolded = folded.value;
  const isWide = wide.value;
  const [folding, setFolding] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const contentRef = useContext(ScrollContext);
  const innerRef = useRef<HTMLDivElement>(null);
  const lastFolded = useRef(isFolded);
  const swipeY = useRef<number | null>(null);
  const swiped = useRef(false);
  const s = useSearch(d);

  // The height of the panel and the cover of the map. fold: the call comes from a fold or an open.
  const layout = () => {
    const el = panelRef.current;
    if (!el) return;
    const fold = lastFolded.current !== folded.peek();
    lastFolded.current = folded.peek();
    const fixed = topRef.current!.offsetHeight + resultsRef.current!.offsetHeight;
    let h: number;
    if (folded.peek()) {
      const head = innerRef.current?.querySelector<HTMLElement>(":scope > .head");
      h = fixed + (head ? head.offsetHeight + 1 : 0); // + the border of the copy of the header
    } else if (wide.peek()) {
      h = innerHeight - 2 * EDGE;
    } else {
      const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const max = innerHeight * (view.peek().kind === "home" ? PHONE_HOME_MAX : PHONE_MAX);
      h = Math.min(max, fixed + 1 + (innerRef.current?.offsetHeight ?? 0) + pad);
    }
    h = Math.round(h);
    if (Math.abs(el.offsetHeight - h) < 1) setFolding(false); // no animation: no transitionend
    el.style.height = `${h}px`;
    // app_design 6.5: a route view scrolls to its first red stop when the panel is open. During the height
    // transition, the parts of the panel other than the scroll area have their final height.
    const area = contentRef.current;
    if (redScroll.pending && !folded.peek() && area) {
      redScroll.pending = false;
      scrollToRed(area, h - (el.offsetHeight - area.clientHeight));
    }
    const c: Cover = wide.peek()
      ? { top: 0, right: 0, bottom: 0, left: EDGE + el.offsetWidth, fold }
      : { top: 0, right: 0, bottom: h, left: 0, fold };
    if (!sameCover(c, cover.peek())) cover.value = c;
  };

  // After each render: the view, the fold, the data or the layout changed.
  useLayoutEffect(layout);

  // The content and the top part change their size without a render: the station list, the search results, a resize.
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => layout());
    for (const r of [topRef, resultsRef, innerRef]) if (r.current) ro.observe(r.current);
    addEventListener("resize", layout);
    return () => {
      ro.disconnect();
      removeEventListener("resize", layout);
    };
  }, [d]);

  // While the panel folds, the content stays in it. The copy of the header shows at the end.
  useLayoutEffect(() => {
    if (!folding) return;
    const t = setTimeout(() => setFolding(false), FOLD_MS + 100);
    return () => clearTimeout(t);
  }, [folding]);

  // The hidden content of the folded panel cannot get the keyboard focus (app_design 4.2).
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.inert = isFolded;
  }, [isFolded]);

  const fold = (on: boolean) => setFolded(on, setFolding);
  const label = isFolded ? "Show the list" : "Hide the list";
  const cls = ["panel", v.kind === "home" ? "is-home" : "", isFolded && !folding ? "is-folded" : "", isFolded && folding ? "is-folding" : ""];

  return (
    <aside
      class={cls.join(" ")}
      ref={panelRef}
      aria-label="Bus routes"
      onTransitionEnd={(e) => {
        if (e.target === panelRef.current && e.propertyName === "height") setFolding(false);
      }}
    >
      <div class="top" ref={topRef}>
        <button
          class="fold"
          type="button"
          aria-controls="panel-content"
          aria-expanded={!isFolded}
          aria-label={label}
          title={label}
          onClick={() => {
            if (swiped.current) swiped.current = false;
            else fold(!folded.peek());
          }}
          onPointerDown={(e) => {
            swiped.current = false;
            if (isWide) return;
            swipeY.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (swipeY.current === null) return;
            const dy = e.clientY - swipeY.current;
            swipeY.current = null;
            if (Math.abs(dy) > SWIPE_PX) {
              swiped.current = true;
              fold(dy > 0);
            }
          }}
          onPointerCancel={() => (swipeY.current = null)}
        >
          <ChevronUp />
        </button>
        <header class="brand">
          <a class="mark" href="#/" aria-label="Home" title="Home">
            <BusIcon />
          </a>
          <div class="brand-text">
            <a class="brand-name" href="#/">
              Bus Router
            </a>
            <div class="brand-sub">
              London · <a href={viewHash({ kind: "about" })}>About</a>
            </div>
          </div>
        </header>
        <div class="search" role="search">
          <SearchIcon />
          <input
            id="q"
            type="text"
            enterKeyHint="search"
            placeholder="Route, stop or station"
            autocomplete="off"
            spellcheck={false}
            aria-label="Search for a route or a station"
            {...comboProps(s)}
            value={query.value}
            onInput={(e) => (query.value = e.currentTarget.value)}
            onKeyDown={s.onKeyDown}
          />
          <kbd>/</kbd>
        </div>
      </div>
      <div class="results" ref={resultsRef} onMouseOver={onRowOver} onMouseLeave={onRowLeave}>
        <SearchResults d={d} s={s} box={resultsRef} />
      </div>
      <div
        class="peek"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("button, a")) fold(false);
        }}
      >
        {d && isFolded && !folding && <ViewHeader d={d} view={v} />}
      </div>
      <div class="scroll" id="panel-content" ref={contentRef} onMouseOver={onRowOver} onMouseLeave={onRowLeave}>
        <div ref={innerRef}>
          {d ? (
            <ViewContent d={d} view={v} />
          ) : (
            <div class="loading" role="status">
              {loadError.value ?? "Loading bus data…"}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
