// app_design 6.1: the home view. Two tabs, Routes and Stations. Each tab keeps its scroll position.
import type { VNode } from "preact";
import { useContext, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Core } from "../data/load";
import type { LineInfo } from "../data/types";
import { compareLines } from "../model/order";
import { stationList, windowRange, type ListItem, type StationList } from "../model/stationList";
import { homeRouteRow, stationCodes, stationName, stationRing } from "../model/text";
import { viewHash } from "../model/url";
import { afterPaint, mark, now, PERF_ON, sample } from "../perf";
import { homeScroll, homeTab, type HomeTab } from "../state/signals";
import { Badge, ChevronRight, StationRing } from "./marks";
import { ScrollContext } from "./scroll";

const OVERSCAN = 600; // px of rows drawn above and below the view (app_design 7)

const count = (n: number) => n.toLocaleString("en-GB");

// Keep the scroll position of a tab while it shows.
function useSaveScroll(tab: HomeTab) {
  const scroll = useContext(ScrollContext);
  useLayoutEffect(() => {
    const el = scroll.current!;
    const save = () => (homeScroll.value = { ...homeScroll.peek(), [tab]: el.scrollTop });
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, [tab]);
}

export function HomeView({ d }: { d: Core }) {
  const tab = homeTab.value;
  const routes = useMemo(() => [...d.lines.values()].sort(compareLines), [d]);
  const stations = useMemo(() => stationList(d), [d]);
  useSaveScroll(tab);
  // prod_design 9, step 15: the home lists are in the document, then painted.
  useLayoutEffect(() => {
    mark("lists");
    afterPaint(() => mark("listsPaint"));
  }, []);
  const tabButton = (t: HomeTab, label: string, n: number) => (
    <button
      class="tab"
      type="button"
      role="tab"
      id={`tab-${t}`}
      aria-selected={tab === t}
      aria-controls="home-list"
      onClick={() => (homeTab.value = t)}
    >
      {label} <span class="muted">{count(n)}</span>
    </button>
  );
  return (
    <>
      <div class="home-tabs">
        <div class="tabs" role="tablist" aria-label="Lists">
          {tabButton("routes", "Routes", routes.length)}
          {tabButton("stations", "Stations", stations.stations)}
        </div>
      </div>
      <div id="home-list" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "routes" ? <RoutesList d={d} routes={routes} /> : <StationListView d={d} list={stations} />}
      </div>
    </>
  );
}

function RoutesList({ d, routes }: { d: Core; routes: LineInfo[] }) {
  const scroll = useContext(ScrollContext);
  useLayoutEffect(() => {
    scroll.current!.scrollTop = homeScroll.peek().routes;
  }, []);
  const rows = useMemo(
    () =>
      routes.map((line) => {
        const r = homeRouteRow(d, line);
        return (
          <li key={line.id}>
            <a class="row" href={viewHash({ kind: "route", line: line.id })}>
              <Badge line={line} />
              <span class="row-main">
                <span class="row-title">{r.title}</span>
                <span class="row-sub">{r.sub}</span>
              </span>
              <ChevronRight />
            </a>
          </li>
        );
      }),
    [d, routes],
  );
  return <ul class="list">{rows}</ul>;
}

// The station list draws only the rows in view and OVERSCAN px above and below, at most one time each
// frame, and only when the rows in view change. Each row is made one time (app_design 7).
// Preact 11 does not add "px" to a number in a style: give the unit.
function StationListView({ d, list }: { d: Core; list: StationList }) {
  const scroll = useContext(ScrollContext);
  const listRef = useRef<HTMLDivElement>(null);
  const cache = useMemo(() => new Map<ListItem, VNode>(), [list]);
  const [win, setWin] = useState({ lo: 0, to: 0, letter: "" });
  // prod_design 9, step 15: one frame of the list, from the scroll frame to the new rows with their
  // layout. The read of a row box forces the layout that the frame does after the script.
  const frameT0 = useRef(0);
  useLayoutEffect(() => {
    if (!frameT0.current) return;
    void listRef.current!.lastElementChild?.getBoundingClientRect();
    sample("listFrame", now() - frameT0.current);
    frameT0.current = 0;
  }, [win]);

  useLayoutEffect(() => {
    const el = scroll.current!;
    el.scrollTop = homeScroll.peek().stations;
    let frame = 0;
    const update = () => {
      frame = 0;
      const t0 = now();
      const w = windowRange(list.items, el.scrollTop - listRef.current!.offsetTop, el.clientHeight, OVERSCAN);
      setWin((p) => {
        if (p.lo === w.lo && p.to === w.to && p.letter === w.letter) return p;
        if (PERF_ON) frameT0.current = t0;
        return w;
      });
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", queue, { passive: true });
    const ro = new ResizeObserver(queue);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", queue);
      ro.disconnect();
    };
  }, [list]);

  const row = (it: ListItem): VNode => {
    let v = cache.get(it);
    if (v) return v;
    if (it.letter !== undefined) {
      v = (
        <div key={it.y} class="vitem vhead" style={{ top: `${it.y}px`, height: `${it.h}px` }} aria-hidden="true">
          {it.letter}
        </div>
      );
    } else {
      const ring = stationRing(d, it.key);
      const codes = stationCodes(d, it.key);
      v = (
        <a key={it.y} class="vitem row" style={{ top: `${it.y}px` }} href={viewHash({ kind: "station", key: it.key })} data-station={it.key}>
          <StationRing text={ring.text} stand={ring.stand} long={ring.long} />
          <span class="row-main">
            <span class="row-title">
              {stationName(d, it.key)}
              {codes && " "}
              {codes && <span class="ind">{codes}</span>}
            </span>
          </span>
          <ChevronRight />
        </a>
      );
    }
    cache.set(it, v);
    return v;
  };

  return (
    <>
      <div class="vstick" aria-hidden="true">
        {win.letter}
      </div>
      <div class="vlist" ref={listRef} style={{ height: `${list.height}px` }}>
        {list.items.slice(win.lo, win.to).map(row)}
      </div>
    </>
  );
}
