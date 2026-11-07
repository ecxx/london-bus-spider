import { describe, expect, test } from "vitest";
import { compareLineNames, compareLines } from "../../src/model/order";
import { HAS_EXPORT, getCore } from "./fixtures";

const sorted = (names: string[]) => [...names].sort(compareLineNames);

describe("route order (app_design 3.7)", () => {
  test("the example of 3.7: letter prefixes by prefix, then by number", () => {
    expect(sorted(["W13", "SL6", "C10", "P5", "H9", "C1", "BL1"])).toEqual(["BL1", "C1", "C10", "H9", "P5", "SL6", "W13"]);
  });

  test("numbers, then letter prefixes, then night lines", () => {
    expect(sorted(["N5", "C1", "100", "N207", "10", "SL6", "2", "N1", "1", "W13"])).toEqual([
      "1", "2", "10", "100", "C1", "SL6", "W13", "N1", "N5", "N207",
    ]);
  });

  test("numbers are in numeric order, not text order", () => {
    expect(sorted(["9", "89", "189", "18"])).toEqual(["9", "18", "89", "189"]);
    expect(sorted(["N89", "N9", "N189"])).toEqual(["N9", "N89", "N189"]);
  });

  test.skipIf(!HAS_EXPORT)("export_131026: the groups are in sequence for all 675 lines", async () => {
    const lines = [...(await getCore()).lines.values()].sort(compareLines);
    const group = (n: string) => (/^\d/.test(n) ? 0 : n.startsWith("N") && /^N\d/.test(n) ? 2 : 1);
    const groups = lines.map((l) => group(l.name));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(lines[0]!.name).toBe("1");
    expect(lines.at(-1)!.name.startsWith("N")).toBe(true);
  });
});
