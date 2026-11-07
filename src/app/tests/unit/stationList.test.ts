import { beforeAll, describe, expect, test } from "vitest";
import type { Core } from "../../src/data/load";
import { letterOf, stationList, windowRange, type ListItem, type StationList } from "../../src/model/stationList";
import { HEAD_H, ROW_H } from "../../src/params";
import { HAS_EXPORT, getCore } from "./fixtures";

describe("station list (app_design 6.1, 7)", () => {
  test("the letter of a name: accents ignored, # if not a letter", () => {
    expect(["Abbey Road", "abbey", "Élan Close", "1 Canada Square", "(Stop)", "Øster"].map(letterOf)).toEqual(["A", "A", "E", "#", "#", "#"]);
  });

  // A: header (0..30), 2 rows (30..126). B: header (126..156), 3 rows (156..300).
  const items: ListItem[] = [
    { y: 0, h: HEAD_H, letter: "A" },
    { y: 30, h: ROW_H, key: "a1" },
    { y: 78, h: ROW_H, key: "a2" },
    { y: 126, h: HEAD_H, letter: "B" },
    { y: 156, h: ROW_H, key: "b1" },
    { y: 204, h: ROW_H, key: "b2" },
    { y: 252, h: ROW_H, key: "b3" },
  ];

  test("the rows in view and the overscan", () => {
    expect(windowRange(items, 0, 100, 0)).toEqual({ lo: 0, to: 3, letter: "A" });
    expect(windowRange(items, 130, 50, 0)).toEqual({ lo: 3, to: 5, letter: "B" });
    expect(windowRange(items, 130, 50, 60)).toEqual({ lo: 1, to: 6, letter: "B" }); // 70..240: a1 ends at 78
    expect(windowRange(items, 0, 10_000, 0)).toEqual({ lo: 0, to: 7, letter: "A" });
  });

  test("the letter of the first row in view", () => {
    expect(windowRange(items, 100, 20, 0).letter).toBe("A"); // a2 at the top
    expect(windowRange(items, 210, 20, 0).letter).toBe("B"); // b2 at the top
  });
});

describe.skipIf(!HAS_EXPORT)("the station list of data_131026", () => {
  let d: Core;
  let list: StationList;
  beforeAll(async () => {
    d = await getCore();
    list = stationList(d);
  });

  test("all 11,571 stations, with a header before each first letter", () => {
    const rows = list.items.filter((i) => i.key !== undefined);
    const heads = list.items.filter((i) => i.letter !== undefined);
    expect(rows).toHaveLength(11_571);
    expect(new Set(rows.map((r) => r.key)).size).toBe(11_571);
    expect(heads.map((h) => h.letter)).toEqual([...new Set(heads.map((h) => h.letter))]);
    expect(list.height).toBe(rows.length * ROW_H + heads.length * HEAD_H);
    expect(list.items[0]!.letter).toBe(heads[0]!.letter);
  });

  test("the positions follow each other", () => {
    for (let i = 1; i < list.items.length; i++) {
      const a = list.items[i - 1]!;
      if (list.items[i]!.y !== a.y + a.h) expect.fail(`item ${i}`);
    }
  });

  test("a window at the end of the list", () => {
    const w = windowRange(list.items, list.height - 600, 600, 600);
    expect(w.to).toBe(list.items.length);
    expect(w.to - w.lo).toBeLessThan(60);
  });
});
