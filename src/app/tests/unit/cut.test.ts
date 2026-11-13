import { beforeAll, describe, expect, test } from "vitest";
import type { Core } from "../../src/data/load";
import type { DecodedLine, PatternKey } from "../../src/data/types";
import { pointCount } from "../../src/data/polyline";
import { cutIndex, cutPoint, sections } from "../../src/model/cut";
import { spiderPatterns } from "../../src/model/spider";
import { HAS_EXPORT, getCore, getLines } from "./fixtures";

describe("cut point (app_design 6.4)", () => {
  test("the cut stop is the first selected stop of the pattern", () => {
    expect(cutIndex(["a", "b", "c", "b"], new Set(["b"]))).toBe(1);
    expect(cutIndex(["a", "b", "c", "d"], new Set(["d", "c"]))).toBe(2);
    expect(cutIndex(["a", "b"], new Set(["x"]))).toBe(-1);
  });

  test("a null stop point: the nearest stop with a point, the next stop first", () => {
    expect(cutPoint([0, 5, 9], 1)).toBe(5);
    expect(cutPoint([0, 5, null, 12, 20], 2)).toBe(12);
    expect(cutPoint([0, 5, null, null, 20], 2)).toBe(5); // distance 1: next null, previous 5
    expect(cutPoint([0, null, null, 7, 20], 1)).toBe(0); // distance 1: next null, previous 0
    expect(cutPoint([0, 3, null, null, 20], 3)).toBe(20);
  });

  test("the sections before and after the cut point", () => {
    expect(sections(10, [0, 4, 9], 1)).toEqual({ pt: 4, behind: [0, 4], after: [4, 9] });
    expect(sections(10, [0, 4, 9], 0)).toEqual({ pt: 0, behind: null, after: [0, 9] });
    expect(sections(10, [0, 4, 9], 2)).toEqual({ pt: 9, behind: [0, 9], after: null });
  });
});

describe.skipIf(!HAS_EXPORT)("cut point cases of data_131026 (app_design 6.4)", () => {
  let d: Core;
  let lines: Map<PatternKey, DecodedLine>;
  beforeAll(async () => {
    d = await getCore();
    lines = await getLines();
  });

  test("patterns with 2 or more stops of one station", () => {
    let patterns = 0;
    const pairs: Record<number, number> = {};
    for (const [, , , , stops] of Object.values(d.patterns)) {
      const by = new Map<string, number>();
      for (const s of new Set(stops)) by.set(d.stops[s]![4], (by.get(d.stops[s]![4]) ?? 0) + 1);
      const multi = [...by.values()].filter((n) => n >= 2);
      if (multi.length) patterns++;
      for (const n of multi) pairs[n] = (pairs[n] ?? 0) + 1;
    }
    expect(patterns).toBe(234);
    expect(pairs).toEqual({ 2: 304, 3: 5 });
    // 100-I at ICS1000225: stops 20 (490000225W) and 21 (490000225T). The cut stop is the first.
    const p = spiderPatterns(d, d.stationStops.get("ICS1000225")!).find((x) => x.pid === "100-I")!;
    expect(p.i).toBe(20);
    expect(d.patterns["100-I"]![4][p.i]).toBe("490000225W");
  });

  test("patterns that contain one stop two times: the cut is at the first", () => {
    const twice = Object.entries(d.patterns).filter(([, p]) => new Set(p[4]).size !== p[4].length);
    expect(twice.map(([k]) => k)).toEqual(["b11-O", "b14-O1", "h10-O", "h2-O", "h9-O"]);
    const expected: Record<string, [string, number]> = {
      "b11-O": ["490012539N", 13],
      "b14-O1": ["490013112W", 37],
      "h10-O": ["490016764HW", 0],
      "h2-O": ["490015496GW", 0],
      "h9-O": ["490016764HW", 0],
    };
    for (const [pid, [stop, i]] of Object.entries(expected)) {
      expect(cutIndex(d.patterns[pid]![4], new Set([stop])), pid).toBe(i);
      expect(d.patterns[pid]![4].lastIndexOf(stop), pid).toBeGreaterThan(i);
    }
  });

  test("patterns with a bad-position stop", () => {
    const bad = [...lines].filter(([, l]) => l.stopPoints.includes(null)).map(([k]) => k);
    expect(bad).toEqual(["18-O", "214-I", "88-I", "n118-O", "n18-O", "p13-O", "s2-O"]);
    // s2-O at 490013611E: stop 32 has no point. The next stop (33) has point 254.
    const s2 = lines.get("s2-O")!;
    const i = cutIndex(d.patterns["s2-O"]![4], new Set(["490013611E"]));
    expect(i).toBe(32);
    expect(s2.stopPoints.slice(31, 34)).toEqual([234, null, 254]);
    expect(sections(pointCount(s2.coords), s2.stopPoints, i).pt).toBe(254);
  });

  test("the cut point of each pattern at each of its stops is a point of the line", () => {
    for (const [pid, { coords, stopPoints }] of lines) {
      const stops = d.patterns[pid]![4];
      for (const s of new Set(stops)) {
        const { pt } = sections(pointCount(coords), stopPoints, cutIndex(stops, new Set([s])));
        if (!(pt >= 0 && pt < pointCount(coords))) expect.fail(`${pid} at ${s}: ${pt}`);
      }
    }
  });
});
