// app_design 6.4: the cut point of a pattern in a spider graph.
import type { StopKey } from "../data/types";

// Step 1: the cut stop is the first stop of the pattern that is a selected stop. -1 if there is none.
export function cutIndex(stops: StopKey[], selected: ReadonlySet<StopKey>): number {
  for (let i = 0; i < stops.length; i++) if (selected.has(stops[i]!)) return i;
  return -1;
}

// Steps 2 and 3: the point of the cut stop. If its stop point is null (a bad-position stop), the
// point of the nearest stop that has one: at each distance, the next stop first, then the previous stop.
export function cutPoint(stopPoints: (number | null)[], i: number): number {
  for (let d = 0; d < stopPoints.length; d++) {
    const next = stopPoints[i + d];
    if (next != null) return next;
    const prev = i - d >= 0 ? stopPoints[i - d] : null;
    if (prev != null) return prev;
  }
  return 0;
}

// The point ranges (inclusive) of the section before and the section after the cut point (app_design 6.4,
// "Lines"). A section with fewer than 2 points is null.
export interface Sections {
  pt: number;
  behind: [from: number, to: number] | null;
  after: [from: number, to: number] | null;
}

export function sections(points: number, stopPoints: (number | null)[], i: number): Sections {
  const pt = cutPoint(stopPoints, i);
  return { pt, behind: pt > 0 ? [0, pt] : null, after: pt < points - 1 ? [pt, points - 1] : null };
}
