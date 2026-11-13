import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { FORMAT, FormatError, loadCore, type Core } from "../../src/data/load";
import { decodePolyline, pointAt, pointCount, positions } from "../../src/data/polyline";
import type { DecodedLine, PatternKey } from "../../src/data/types";
import { DATA_DIR, EXPORT_DIR, HAS_EXPORT, diskFetch, getCore, getLines, readJson } from "./fixtures";

describe("polyline decode (export_format 5)", () => {
  test("the example of the Google Maps Platform", () => {
    const c = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pointCount(c)).toBe(3);
    expect(pointAt(c, 0)).toEqual([-120.2, 38.5]);
    expect(pointAt(c, 1)).toEqual([-120.95, 40.7]);
    expect(pointAt(c, 2)).toEqual([-126.453, 43.252]);
  });

  test("an empty polyline has no points", () => {
    expect(pointCount(decodePolyline(""))).toBe(0);
  });

  test("positions gives [lon, lat] pairs of a range", () => {
    const c = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(positions(c, 1, 2)).toEqual([[-120.95, 40.7], [-126.453, 43.252]]);
    expect(positions(c)).toHaveLength(3);
  });
});

describe("format check (prod_design 4.1)", () => {
  test("a manifest with a different format stops the load", async () => {
    const get = async (url: string) => {
      if (url.endsWith("manifest.json")) return { format: FORMAT + 1, dataset: "x", files: {} };
      throw new Error("the client must not get the other files");
    };
    await expect(loadCore("/data/", get)).rejects.toBeInstanceOf(FormatError);
    await expect(loadCore("/data/", get)).rejects.toThrow("A new version is available. Reload the page.");
  });
});

describe.skipIf(!HAS_EXPORT)("load of export_131026 (prod_design 9, step 3)", () => {
  let core: Core;
  let lines: Map<PatternKey, DecodedLine>;
  beforeAll(async () => {
    core = await getCore();
    lines = await getLines();
  });

  test("the record counts", () => {
    expect(core.manifest.dataset).toBe("data_131026");
    expect(Object.keys(core.stops)).toHaveLength(19_985);
    expect(Object.keys(core.stations)).toHaveLength(11_571);
    expect(Object.keys(core.patterns)).toHaveLength(1_473);
    expect(lines.size).toBe(1_473);
  });

  test("the lines have the keys of the patterns, in the same order", () => {
    expect([...lines.keys()]).toEqual(Object.keys(core.patterns));
  });

  test("the index stop -> patterns", () => {
    let pairs = 0;
    for (const [pid, [, , , , stops]] of Object.entries(core.patterns)) {
      for (const k of new Set(stops)) {
        expect(core.stopPatterns.get(k)).toContain(pid);
        pairs++;
      }
    }
    // Each pattern one time for each stop, and each stop has a pattern (modules.md, "stops").
    expect([...core.stopPatterns.values()].reduce((n, l) => n + l.length, 0)).toBe(pairs);
    expect(core.stopPatterns.size).toBe(19_985);
  });

  test("the index station -> stops", () => {
    expect(core.stationStops.size).toBe(11_571);
    let n = 0;
    for (const [st, ks] of core.stationStops) {
      expect(core.stations[st]).toBeDefined();
      for (const k of ks) expect(core.stops[k]![4]).toBe(st);
      n += ks.length;
    }
    expect(n).toBe(19_985);
  });

  test("the lines: 675 lines, 1,343 line-directions, main pattern first", () => {
    expect(core.lines.size).toBe(675);
    let dirs = 0;
    for (const line of core.lines.values()) {
      for (const pids of Object.values(line.dirs)) if (pids.length) dirs++;
    }
    expect(dirs).toBe(1_343);
    const l189 = core.lines.get("189")!;
    expect(l189.dirs).toEqual({ inbound: ["189-I"], outbound: ["189-O1", "189-O2"] });
    expect(l189.cls).toBe("24-hour");
  });

  test("the stop points agree with the conditions of export_format 4.5", () => {
    for (const [pid, { coords, stopPoints }] of lines) {
      const n = pointCount(coords);
      expect(stopPoints, pid).toHaveLength(core.patterns[pid]![4].length);
      expect(stopPoints[0], pid).toBe(0);
      expect(stopPoints.at(-1), pid).toBe(n - 1);
      let last = 0;
      for (const v of stopPoints) {
        if (v === null) continue;
        expect(Number.isInteger(v) && v >= last && v < n, pid).toBe(true);
        last = v;
      }
    }
  });

  test.skipIf(!fs.existsSync(path.join(DATA_DIR, "svc_lines.json")))(
    "each decoded point agrees with the coordinates of svc_lines.json to 5 decimal places",
    () => {
      const svc = readJson(path.join(DATA_DIR, "svc_lines.json")) as Record<string, { coordinates: [number, number][] }>;
      expect(Object.keys(svc).sort()).toEqual([...lines.keys()].sort());
      let points = 0;
      for (const [pid, { coords }] of lines) {
        const ref = svc[pid]!.coordinates;
        expect(pointCount(coords), pid).toBe(ref.length);
        for (let i = 0; i < ref.length; i++) {
          const [lon, lat] = pointAt(coords, i);
          // 5 decimal places: the difference is half of 1e-5 or less (with a margin for the binary fractions).
          if (Math.abs(lon - ref[i]![0]) > 5.000001e-6 || Math.abs(lat - ref[i]![1]) > 5.000001e-6) {
            expect.fail(`${pid} point ${i}: [${lon}, ${lat}] is not [${ref[i]}] to 5 decimal places`);
          }
        }
        points += ref.length;
      }
      expect(points).toBe(357_850);
    },
  );
});

test.skipIf(!HAS_EXPORT)("the test fetch reads the export folder", async () => {
  const m = (await diskFetch(EXPORT_DIR)("/data/manifest.json")) as { format: number };
  expect(m.format).toBe(FORMAT);
});
