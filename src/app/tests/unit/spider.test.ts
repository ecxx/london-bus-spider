import { beforeAll, describe, expect, test } from "vitest";
import type { Core } from "../../src/data/load";
import type { Direction, LineInfo } from "../../src/data/types";
import { endBadgeSize, endBadgesShown, endGroups, type End } from "../../src/model/endLabels";
import { distanceM, type LngLat } from "../../src/model/geo";
import { applyFilter, filterCounts, servedStations, spiderPatterns, spiderRows } from "../../src/model/spider";
import { HAS_EXPORT, getCore } from "./fixtures";

const L = (name: string): LineInfo => ({ id: name.toLowerCase(), name, cls: "day", dirs: { inbound: [], outbound: [] } });
const end = (at: LngLat, line: LineInfo, dir: Direction = "outbound"): End => ({ at, line, dir });
// A point east of p by m metres.
const east = (p: LngLat, m: number): LngLat => [p[0] + m / (111_320 * Math.cos((p[1] * Math.PI) / 180)), p[1]];

describe("end-label groups (app_design 6.4)", () => {
  const origin: LngLat = [-0.12, 51.51];
  const far: LngLat = [-0.2, 51.55];

  test("the ends 250 m or less from the first end of a group share its label", () => {
    const a = L("88"), b = L("24"), c = L("N5");
    const groups = endGroups([end(far, a), end(east(far, 240), b), end(east(far, 260), c)], [origin]);
    // 88 starts a group, 24 joins it (240 m), N5 starts a new group (260 m). The badges are in the route order.
    expect(groups.map((g) => g.items.map((x) => x.line.name))).toEqual([["24", "88"], ["N5"]]);
    expect(groups[0]!.at).toBe(far);
  });

  test("one badge for each line, with the directions", () => {
    const a = L("88");
    const [g] = endGroups([end(far, a, "inbound"), end(east(far, 100), a, "outbound"), end(far, a, "inbound")], [origin]);
    expect(g!.items).toEqual([{ line: a, dirs: ["inbound", "outbound"] }]);
  });

  test("the groups are in sequence from the farthest from the selected stops", () => {
    const near = east(origin, 1_000), mid = east(origin, 5_000), farther = east(origin, 9_000);
    const groups = endGroups([end(near, L("1")), end(farther, L("2")), end(mid, L("3"))], [origin, east(origin, 500)]);
    expect(groups.map((g) => g.items[0]!.line.name)).toEqual(["2", "3", "1"]);
    expect(groups[2]!.far).toBeCloseTo(distanceM(east(origin, 500), near), 6);
  });

  test("the badges of a label at each zoom (app_design 5.4)", () => {
    expect([11.99, 12, 13.99, 14, 18].map(endBadgesShown)).toEqual([1, 2, 2, 4, 4]);
    expect([11.99, 12].map(endBadgeSize)).toEqual(["xs", "sm"]);
  });
});

describe("filter (app_design 6.2)", () => {
  const row = (cls: LineInfo["cls"]) => ({ line: { ...L("x"), cls }, dir: "inbound" as const, pids: [], stops: [], to: true, title: "", sub: "" });

  test("Day: the line is not night. Night: the line is night or 24-hour", () => {
    const rows = [row("day"), row("24-hour"), row("night"), row("limited")];
    expect(filterCounts(rows)).toEqual({ all: 4, day: 3, night: 2 });
    expect(applyFilter(rows, "night").rows.map((r) => r.line.cls)).toEqual(["24-hour", "night"]);
  });

  test("a filter with no rows gives All", () => {
    const rows = [row("day")];
    expect(applyFilter(rows, "night")).toEqual({ filter: "all", rows });
  });
});

describe.skipIf(!HAS_EXPORT)("spider rows of data_131026 (app_design 6.4)", () => {
  let d: Core;
  beforeAll(async () => {
    d = await getCore();
  });
  const text = (r: { line: LineInfo; dir: string; to: boolean; title: string; sub: string }) =>
    `${r.line.name} ${r.dir} ${r.to ? "to" : "from"} ${r.title} | ${r.sub}`;

  test("Brondesbury Station (ICS1001038)", () => {
    expect(spiderRows(d, d.stationStops.get("ICS1001038")!, true).map(text)).toEqual([
      "16 inbound to Brent Park Tesco | Stop C · Day",
      "16 outbound to Bishops Bridge / Paddington Station | Stop D · Day",
      "32 inbound to Edgware Station | Stop C · Day",
      "32 outbound to Kilburn Park Station | Stop D · Day",
      "189 inbound to Brent Cross Shopping Centre | Stop C · 24 Hours",
      "189 outbound to Marble Arch Station | Stop D · 24 Hours · 1 limited variant",
      "316 inbound to Brent Cross West Station | Stop C · Day",
      "316 outbound to White City Bus Station | Stop D · Day",
      "632 inbound to South Mead | Stop C · Limited service",
      "632 outbound to Kilburn Park Station | Stop D · Limited service",
      "N32 inbound to Edgware Station | Stop C · Night",
      "N32 outbound to Victoria Station | Stop D · Night",
    ]);
  });

  test("a stop view has no stops in the second line", () => {
    expect(spiderRows(d, ["490001038D"], false).map(text)).toEqual([
      "16 outbound to Bishops Bridge / Paddington Station | Day",
      "32 outbound to Kilburn Park Station | Day",
      "189 outbound to Marble Arch Station | 24 Hours · 1 limited variant",
      "316 outbound to White City Bus Station | Day",
      "632 outbound to Kilburn Park Station | Limited service",
      "N32 outbound to Victoria Station | Night",
    ]);
  });

  test("Aldwych / Drury Lane: 33 rows of 30 lines, Ends here, variants", () => {
    const rows = spiderRows(d, d.stationStops.get("490G00019703")!, true);
    expect(rows).toHaveLength(33);
    expect(new Set(rows.map((r) => r.line.id)).size).toBe(30);
    const t = rows.map(text);
    expect(t).toContain("9 inbound from Hammersmith Bus Station | Stop E · Ends here · Day");
    expect(t).toContain("N26 inbound to Westminster Cathedral / Victoria Stn | Stop R · Night · 2 variants");
    expect(t).toContain("SL6 inbound to West Croydon Bus Station | Stop S · Limited service");
    expect(rows.map((r) => r.line.name).slice(0, 4)).toEqual(["1", "9", "15", "23"]);
    // Night: 15 rows of N lines and 6 rows of 24-hour lines.
    expect(filterCounts(rows)).toEqual({ all: 33, day: 18, night: 21 });
  });

  test("Oxford Circus Station (ICS1000173)", () => {
    const t = spiderRows(d, d.stationStops.get("ICS1000173")!, true).map(text);
    expect(t).toHaveLength(20);
    expect(t[0]).toBe("12 inbound to Margaret Street / Oxford Circus | Stop RC · 24 Hours");
    expect(t).toContain("159 outbound from Streatham Station | Stop RC · Ends here · 24 Hours");
    expect(t.at(-1)).toBe("N137 outbound to John Prince's Street / Oxford Circus | Stop OH · Night");
  });

  test("Some buses end here: some patterns of the row end at the selected stops", () => {
    // Find a row where some, not all, patterns end at the stop.
    let found = "";
    for (const k of Object.keys(d.stops)) {
      const r = spiderRows(d, [k], false).find((r) => r.sub.includes("Some buses end here"));
      if (r) {
        found = `${k} ${r.line.name}`;
        expect(r.to).toBe(true);
        expect(spiderPatterns(d, [k]).filter((p) => r.pids.includes(p.pid)).some((p) => p.last)).toBe(true);
        break;
      }
    }
    expect(found).not.toBe("");
  });

  test("the served stations are after the selected stops", () => {
    const ks = d.stationStops.get("ICS1001038")!;
    const pats = spiderPatterns(d, ks);
    const served = servedStations(d, pats, new Set(["189"]));
    // 189-O1 calls at Marble Arch after Brondesbury; 189-I calls at Brent Cross after it.
    const names = [...served].map((s) => d.stations[s]![0]);
    expect(names).toContain("Brent Cross Shopping Centre");
    expect(served.has("ICS1001038")).toBe(false);
    expect(servedStations(d, pats, new Set()).size).toBe(0);
  });
});
