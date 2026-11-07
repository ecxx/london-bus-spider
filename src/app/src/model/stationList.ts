// app_design 6.1 and 7: the station list of the home view. All rows have a fixed height, so the
// position of each row is known, and the list draws only the rows in view.
import type { Core } from "../data/load";
import type { StationKey } from "../data/types";
import { HEAD_H, ROW_H } from "../params";
import { stationCollator } from "./search";
import { stationName } from "./text";

export type ListItem = { y: number; h: number; letter: string; key?: undefined } | { y: number; h: number; key: StationKey; letter?: undefined };

export interface StationList {
  items: ListItem[];
  height: number;
  stations: number;
}

// The first letter of a name, with no accent. "#" for a name that does not start with a letter.
export function letterOf(name: string): string {
  const c = name.normalize("NFD").charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

// All the stations, A to Z (case and accents ignored, numbers in numeric order), with a header before each first letter.
export function stationList(d: Core): StationList {
  const named = [...d.stationStops.keys()].map((key) => ({ key, name: stationName(d, key) }));
  named.sort((a, b) => stationCollator.compare(a.name, b.name));
  const items: ListItem[] = [];
  let y = 0;
  let cur: string | null = null;
  for (const { key, name } of named) {
    const letter = letterOf(name);
    if (letter !== cur) {
      items.push({ y, h: HEAD_H, letter });
      y += HEAD_H;
      cur = letter;
    }
    items.push({ y, h: ROW_H, key });
    y += ROW_H;
  }
  return { items, height: y, stations: named.length };
}

// The items to draw for a scroll position: [lo, to), from overscan px above the view to overscan px
// below it. letter: the letter of the first row in view, for the header at the top of the list.
export function windowRange(items: ListItem[], top: number, height: number, overscan: number): { lo: number; to: number; letter: string } {
  const a = top - overscan;
  const b = top + height + overscan;
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (items[m]!.y + items[m]!.h <= a) lo = m + 1;
    else hi = m;
  }
  let to = lo;
  while (to < items.length && items[to]!.y < b) to++;
  // The first item in view, then the header before it.
  let i = lo;
  while (i < to - 1 && items[i]!.y + items[i]!.h <= top) i++;
  while (i > 0 && items[i]!.letter === undefined) i--;
  return { lo, to, letter: items[i]?.letter ?? "" };
}
