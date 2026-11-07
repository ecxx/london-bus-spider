import { beforeAll, describe, expect, test } from "vitest";
import type { Core } from "../../src/data/load";
import { matchRange, search, searchIndex, stationResultText, type SearchIndex, type SearchResult } from "../../src/model/search";
import { norm } from "../../src/model/text";
import { HAS_EXPORT, getCore } from "./fixtures";

const names = (rs: SearchResult[]) => rs.map((r) => (r.kind === "line" ? `#${r.line.name}` : r.name));

describe("match range (app_design 6.6)", () => {
  test("the matched text of the name, with apostrophes and spaces", () => {
    expect(matchRange("St Paul's Cathedral", "pauls")).toEqual([3, 9]); // "Paul's"
    expect(matchRange("St Paul's Cathedral", "ST  PAUL")).toEqual([0, 7]);
    expect(matchRange("Oxford Circus", "circ")).toEqual([7, 11]);
    expect(matchRange("Oxford Circus", "bank")).toBe(null);
    expect(matchRange("Oxford Circus", "  ")).toBe(null);
  });
});

describe.skipIf(!HAS_EXPORT)("search of data_131026 (app_design 6.6)", () => {
  let d: Core;
  let ix: SearchIndex;
  beforeAll(async () => {
    d = await getCore();
    ix = searchIndex(d);
  });

  test("routes: the name starts with the text, or is N + the text, in the route order, 8 at most", () => {
    expect(names(search(ix, "155"))).toEqual(["#155", "#N155"]);
    expect(names(search(ix, "n5"))).toEqual(["#N5", "#N53", "#N55", "#N550", "#N551"]);
    expect(names(search(ix, "5")).filter((n) => n.startsWith("#"))).toEqual(["#5", "#50", "#51", "#52", "#53", "#54", "#55", "#56"]);
    expect(names(search(ix, "sl1"))).toEqual(["#SL1", "#SL10", "#SL11", "#SL12"]);
  });

  test("stations: first the names that start with the text, then a word, then the others", () => {
    const r = search(ix, "oxford").filter((x) => x.kind === "station").map((x) => norm(x.name));
    const rank = (n: string) => (n.startsWith("oxford") ? 0 : /(^|[^\p{L}\p{N}])oxford/u.test(n) ? 1 : 2);
    expect(r.map(rank)).toEqual([...r.map(rank)].sort());
    expect(r[0]).toBe("oxford avenue");
    expect(r).toContain("new oxford street");
    expect(r.at(-1)).toBe("loxford lane");
  });

  test("the names of one rank are in the order of the station list", () => {
    const r = search(ix, "kings").map((x) => (x.kind === "station" ? x.name : ""));
    expect(r.slice(0, 4)).toEqual(["King's Avenue", "King's College Hospital", "King's Cross / Caledonian Road", "King's Cross Road"]);
  });

  test("the comparison has no apostrophes and single spaces, and 20 stations at most", () => {
    const a = search(ix, "St Paul's"), b = search(ix, "st  pauls");
    expect(names(a)).toEqual(names(b));
    expect(a).toHaveLength(20);
    expect(names(a)).toContain("St Paul's Cathedral");
    expect(names(a)).toContain("St Pauls Academy");
  });

  test("no text, no results", () => {
    expect(search(ix, "")).toEqual([]);
    expect(search(ix, "   ")).toEqual([]);
    expect(search(ix, "zzzzqqq")).toEqual([]);
  });

  test("the second line of a station result", () => {
    expect(stationResultText(d, "ICS1000173")).toBe("Stops OH, RC, RG · 15 routes");
    expect(stationResultText(d, "ICS1001038")).toBe("Stops C, D · 6 routes");
  });
});
