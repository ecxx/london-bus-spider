// app_design 6.4 and 5.4: the end labels of a spider graph.
import type { Direction, LineInfo } from "../data/types";
import { distanceM, type LngLat } from "./geo";
import { compareLines } from "./order";

const TERM_M = 250; // m: the ends this distance or less from a group share its label (app_design 6.4)

// The last point of the section after the stop of a pattern.
export interface End {
  at: LngLat;
  line: LineInfo;
  dir: Direction;
}

export interface EndGroup {
  at: LngLat; // the end that started the group
  items: { line: LineInfo; dirs: Direction[] }[]; // one badge for each line, in the route order
  far: number; // m from the nearest selected stop. The labels are placed from the farthest.
}

// One group for the ends 250 m or less from its first end. The groups do not change with the zoom.
export function endGroups(ends: End[], selected: LngLat[]): EndGroup[] {
  const groups: EndGroup[] = [];
  for (const e of ends) {
    const g = groups.find((g) => distanceM(g.at, e.at) <= TERM_M);
    if (!g) {
      groups.push({ at: e.at, items: [{ line: e.line, dirs: [e.dir] }], far: 0 });
      continue;
    }
    const same = g.items.find((x) => x.line.id === e.line.id);
    if (!same) g.items.push({ line: e.line, dirs: [e.dir] });
    else if (!same.dirs.includes(e.dir)) same.dirs.push(e.dir);
  }
  for (const g of groups) {
    g.items.sort((a, b) => compareLines(a.line, b.line));
    g.far = Math.min(...selected.map((s) => distanceM(s, g.at)));
  }
  return groups.sort((a, b) => b.far - a.far);
}

// app_design 5.4: the badge size, and the badges that a label shows before "+n".
export const endBadgeSize = (zoom: number): "xs" | "sm" => (zoom < 12 ? "xs" : "sm");
export const endBadgesShown = (zoom: number): number => (zoom < 12 ? 1 : zoom < 14 ? 2 : 4);
