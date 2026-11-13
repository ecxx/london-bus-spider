import { beforeAll, describe, expect, test } from "vitest";
import type { Core } from "../../src/data/load";
import { directionTab, routeHeader, routeView, stopMark, variants } from "../../src/model/route";
import { HAS_EXPORT, getCore } from "./fixtures";

describe.skipIf(!HAS_EXPORT)("route view (app_design 6.5)", () => {
  let d: Core;
  beforeAll(async () => {
    d = await getCore();
  });

  test("#/line/189: outbound first, the main pattern, no red stop", () => {
    const v = routeView(d, "189")!;
    expect([v.dirs, v.dir, v.n, v.pid, v.ctx, v.firstRed, v.here.size]).toEqual([["outbound", "inbound"], "outbound", 1, "189-O1", null, -1, 0]);
    expect(routeHeader(d, v.pid).title).toBe("Brent Cross Shopping Centre – Marble Arch Station");
    expect(v.dirs.map((x) => directionTab(d, v.line, x))).toEqual(["To Marble Arch Station", "To Brent Cross Shopping Centre"]);
  });

  test("#/line/189/outbound/2 and #/line/189/inbound", () => {
    expect(routeView(d, "189", "outbound", "2")!.pid).toBe("189-O2");
    expect(routeView(d, "189", "inbound")!.pid).toBe("189-I");
    // A pattern number out of the range gives the nearest pattern. A wrong direction is ignored.
    expect(routeView(d, "189", "outbound", "9")!.n).toBe(2);
    expect(routeView(d, "189", "outbound", "x")!.n).toBe(1);
    expect(routeView(d, "189", "sideways")!.dir).toBe("outbound");
  });

  test("#/station/ICS1001038/line/189: the stops of the station are red and bold", () => {
    const v = routeView(d, "189", undefined, undefined, { kind: "station", key: "ICS1001038" })!;
    expect([v.dir, v.pid, v.station]).toEqual(["outbound", "189-O1", "ICS1001038"]);
    expect([...v.here].sort()).toEqual(["490001038D", "490001038N"]);
    expect(v.firstRed).toBe(17);
    expect(d.patterns[v.pid]![4][v.firstRed]).toBe("490001038D");
    expect(stopMark(v, "490001038D")).toBe("here");
  });

  test("from a stop: the stop is red and bold, the other stops of its station are red", () => {
    const v = routeView(d, "189", "inbound", undefined, { kind: "stop", key: "490001038N" })!;
    expect([...v.here]).toEqual(["490001038N"]);
    expect(stopMark(v, "490001038N")).toBe("here");
    expect(stopMark(v, "490001038D")).toBe("near");
    expect(stopMark(v, "490000173RC")).toBe(null);
  });

  test("the first variant that calls at the stop, else at the station, else the main pattern", () => {
    // Find a line-direction where only a variant calls at a stop.
    let checked = 0;
    for (const line of d.lines.values()) {
      for (const pids of Object.values(line.dirs)) {
        if (pids.length < 2) continue;
        const main = new Set(d.patterns[pids[0]!]![4]);
        const k = d.patterns[pids[1]!]![4].find((s) => !main.has(s) && !d.stationStops.get(d.stops[s]![4])!.some((x) => main.has(x)));
        if (!k) continue;
        const v = routeView(d, line.id, d.patterns[pids[1]!]![2], undefined, { kind: "stop", key: k })!;
        expect(v.pid, `${line.id} at ${k}`).toBe(pids.find((p) => d.patterns[p]![4].includes(k)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("a context that is not in the data is ignored, a line that is not in the data gives null", () => {
    expect(routeView(d, "189", undefined, undefined, { kind: "stop", key: "NOSTOP" })!.ctx).toBe(null);
    expect(routeView(d, "189", undefined, undefined, { kind: "station", key: "NOSTATION" })!.ctx).toBe(null);
    expect(routeView(d, "no-line")).toBe(null);
  });

  test("the variants of a direction", () => {
    expect(variants(d, d.lines.get("189")!.dirs.outbound)).toEqual([
      { title: "Main route", limited: false, sub: "37 stops" },
      { title: "Variant 2", limited: true, sub: "26 stops · from Cricklewood Broadway / the Crown" },
    ]);
    expect(variants(d, d.lines.get("189")!.dirs.inbound)).toEqual([]);
  });
});
