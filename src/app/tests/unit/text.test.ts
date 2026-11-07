import { beforeAll, describe, expect, test } from "vitest";
import type { Core } from "../../src/data/load";
import type { LineInfo, ServiceClass } from "../../src/data/types";
import { hasEndLabel, isCircular, patternTitle } from "../../src/model/circular";
import { routeHeader, variants } from "../../src/model/route";
import { applyFilter, filterCounts, spiderRows } from "../../src/model/spider";
import {
  CLASS_TEXT,
  badgeStyle,
  homeRouteRow,
  lineColorToken,
  norm,
  routesText,
  stationCodes,
  stationRing,
  stopRoundel,
  tidy,
} from "../../src/model/text";
import { HAS_EXPORT, getCore } from "./fixtures";

const line = (cls: ServiceClass): LineInfo => ({ id: "x", name: "X1", cls, dirs: { inbound: [], outbound: [] } });

describe("class text and badges (app_design 3.3, 3.6)", () => {
  test("the class texts", () => {
    expect(CLASS_TEXT).toEqual({ day: "Day", "24-hour": "24 Hours", night: "Night", limited: "Limited service" });
  });

  test("the badge and the line colour come from the class of the main pattern", () => {
    expect(badgeStyle(line("day"))).toBe("red");
    expect(badgeStyle(line("24-hour"))).toBe("red");
    expect(badgeStyle(line("night"))).toBe("night");
    expect(badgeStyle(line("limited"))).toBe("limited");
    expect(lineColorToken("night")).toBe("--night");
    for (const c of ["day", "24-hour", "limited"] as const) expect(lineColorToken(c)).toBe("--red");
  });

  test("texts", () => {
    expect(routesText(1)).toBe("1 route");
    expect(routesText(15)).toBe("15 routes");
    expect(tidy("  Brondesbury Park Stn  /the Avenue ")).toBe("Brondesbury Park Stn / the Avenue");
    expect(norm("St  Paul’s Cathedral")).toBe("st pauls cathedral");
  });
});

describe.skipIf(!HAS_EXPORT)("export_131026", () => {
  let d: Core;
  beforeAll(async () => {
    d = await getCore();
  });

  // app_design 3.6: the main pattern of the 189 is 24-hour and one variant is limited.
  test("the classes of the 189", () => {
    const l189 = d.lines.get("189")!;
    expect(l189.cls).toBe("24-hour");
    expect(d.patterns["189-O1"]![3]).toBe("24-hour");
    expect(d.patterns["189-O2"]![3]).toBe("limited");
    // The line: badge, line colour, Day and Night filters.
    expect(badgeStyle(l189)).toBe("red");
    expect(lineColorToken(l189.cls)).toBe("--red");
    const rows = spiderRows(d, d.stationStops.get("ICS1001038")!, true).filter((r) => r.line.id === "189");
    expect(applyFilter(rows, "day").rows).toHaveLength(2);
    expect(applyFilter(rows, "night").rows).toHaveLength(2);
    expect(filterCounts(rows)).toEqual({ all: 2, day: 2, night: 2 });
    // Each pattern: the header class text, the Limited tag, the list row.
    expect(routeHeader(d, "189-O1").sub).toBe("24 Hours · 37 stops");
    expect(routeHeader(d, "189-O2").sub).toBe("Limited service · 26 stops");
    expect(variants(d, l189.dirs.outbound).map((v) => [v.title, v.limited])).toEqual([["Main route", false], ["Variant 2", true]]);
    expect(rows.find((r) => r.dir === "outbound")!.sub).toBe("Stop D · 24 Hours · 1 limited variant");
    expect(homeRouteRow(d, l189).sub).toBe("24 Hours · limited variants");
  });

  test("the home row of a line with no limited pattern", () => {
    expect(homeRouteRow(d, d.lines.get("16")!)).toEqual({ title: "Brent Park Tesco – Bishops Bridge / Paddington Station", sub: "Day" });
  });

  test("the station ring and the stop codes of the home list (app_design 3.4, 6.1)", () => {
    expect(stationRing(d, "ICS1000173")).toEqual({ text: "3", stand: false, long: false });
    expect(stationCodes(d, "ICS1000173")).toBe("OH RC RG");
    // A station with one stop that has a code: the code in the ring.
    const one = [...d.stationStops].find(([, ks]) => ks.length === 1 && d.stops[ks[0]!]![1] === "Stop RC")!;
    expect(stationRing(d, one[0])).toEqual({ text: "RC", stand: false, long: false });
    expect(stationCodes(d, one[0])).toBe("");
    const stand = [...d.stationStops].find(([, ks]) => ks.length === 1 && /^Stand \w+$/.test(d.stops[ks[0]!]![1] ?? ""))!;
    expect(stationRing(d, stand[0]).stand).toBe(true);
    for (const st of d.stationStops.keys()) {
      const r = stationRing(d, st);
      if (r.long !== r.text.length > 2) expect.fail(st);
    }
  });

  test("the roundel of a stop", () => {
    expect(stopRoundel(d, "490001038D")).toEqual({ text: "D", stand: false });
    const nul = Object.keys(d.stops).find((k) => d.stops[k]![1] === null)!;
    expect(stopRoundel(d, nul)).toEqual({ text: "•", stand: false });
  });

  // D7: in data_131026, 6 patterns start and end at the same station. Current rule: as other patterns.
  test("circular patterns", () => {
    const circular = Object.keys(d.patterns).filter((p) => isCircular(d, p));
    expect(circular).toEqual(["b12-I3", "b12-O3", "h10-O", "h18-O", "h2-O", "h9-O"]);
    expect(patternTitle("St Mark's Hospital", "St Mark's Hospital", true)).toBe("St Mark's Hospital – St Mark's Hospital");
    expect(hasEndLabel(true)).toBe(true);
  });
});
