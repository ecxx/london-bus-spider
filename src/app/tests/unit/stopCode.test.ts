import { describe, expect, test } from "vitest";
import { parseIndicator, roundelText, stopLabel, stopsText } from "../../src/model/stopCode";
import { HAS_EXPORT, getCore } from "./fixtures";

const code = (ind: string | null) => {
  const c = parseIndicator(ind);
  return [roundelText(c), stopLabel(c, "The Stop Name"), c.kind];
};

describe("stop codes (app_design 3.5)", () => {
  test("the code table", () => {
    expect(code("Stop RC")).toEqual(["RC", "Stop RC", "letter"]);
    expect(code("C")).toEqual(["C", "Stop C", "letter"]);
    expect(code("->NW")).toEqual(["↖", "NW-bound", "heading"]);
    expect(code("NW-bound")).toEqual(["↖", "NW-bound", "heading"]);
    expect(code("->W1")).toEqual(["←1", "W-bound 1", "heading"]);
    expect(code("Stand GF")).toEqual(["GF", "Stand GF", "stand"]);
    expect(code(null)).toEqual(["•", "The Stop Name", "none"]);
  });

  test("the 8 compass directions", () => {
    const dirs = { N: "↑", NE: "↗", E: "→", SE: "↘", S: "↓", SW: "↙", W: "←", NW: "↖" };
    for (const [d, arrow] of Object.entries(dirs)) {
      expect(code(`->${d}`)).toEqual([arrow, `${d}-bound`, "heading"]);
      expect(code(`${d}-bound`)).toEqual([arrow, `${d}-bound`, "heading"]);
    }
  });

  test("a bare 1 to 3 character code, and a stand with no code", () => {
    expect(code("Stop D2")).toEqual(["D2", "Stop D2", "letter"]);
    expect(code("ABC")).toEqual(["ABC", "Stop ABC", "letter"]);
    expect(code("Stand")).toEqual(["•", "Stand", "stand"]);
  });

  test("D18: an indicator that is not in the table has no code", () => {
    for (const ind of ["opp", "adj", "o/s 72", "Northbound", "Stop ->E", ">SE", "stop V", "Bay A", "ABCD", "->NS"]) {
      expect(code(ind), ind).toEqual(["•", "The Stop Name", "none"]);
    }
  });

  test("the stops of a station", () => {
    const s = (indicator: string | null, name = "Harrow Road") => ({ indicator, name });
    expect(stopsText([s("Stop A")])).toBe("Stop A");
    expect(stopsText([s("Stop A"), s("B")])).toBe("Stops A, B");
    expect(stopsText([s("Stop C"), s("->NW")])).toBe("Stop C, NW-bound");
    expect(stopsText([s("Stop C"), s(null, "Mill Lane")])).toBe("Stop C, Mill Lane");
    expect(stopsText([s("Stand GF"), s("Stop A")])).toBe("Stand GF, Stop A");
  });

  test.skipIf(!HAS_EXPORT)("the counts in data_131026", async () => {
    const d = await getCore();
    const counts: Record<string, number> = {};
    let other = 0;
    for (const [, ind] of Object.values(d.stops)) {
      const c = parseIndicator(ind);
      counts[c.kind] = (counts[c.kind] ?? 0) + 1;
      if (c.kind === "none" && ind !== null) other++;
    }
    expect(counts).toEqual({ letter: 13_837, heading: 5_231, stand: 23, none: 72 + 822 });
    expect(other).toBe(822);
  });

  test.skipIf(!HAS_EXPORT)("the stops of a station are in the order of their codes", async () => {
    const d = await getCore();
    expect(d.stationStops.get("ICS1000173")).toEqual(["490000173Z", "490000173RC", "490000173RG"]); // OH, RC, RG
    expect(d.stationStops.get("ICS1001038")).toEqual(["490001038N", "490001038D"]); // C, D
  });
});
