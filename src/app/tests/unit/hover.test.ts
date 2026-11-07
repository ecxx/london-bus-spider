import { describe, expect, test } from "vitest";
import { distanceToLine, highlights, hoverItems, mercBounds, mercator } from "../../src/model/hover";
import { mercX, mercY } from "../../src/model/geo";
import { HAS_EXPORT, getCore } from "./fixtures";

describe("hit test geometry (prod_design 5.5)", () => {
  test("the distance to a line: to a segment, to its ends, to one point", () => {
    const m = new Float64Array([0, 0, 10, 0, 10, 10]);
    expect(distanceToLine(m, 5, 3)).toBe(3); // above the first segment
    expect(distanceToLine(m, -4, 3)).toBe(5); // nearest the first point
    expect(distanceToLine(m, 13, 5)).toBe(3); // beside the second segment
    expect(distanceToLine(new Float64Array([1, 1]), 4, 5)).toBe(5);
    expect(distanceToLine(new Float64Array([2, 2, 2, 2]), 2, 5)).toBe(3); // two equal points
    expect(distanceToLine(new Float64Array([]), 0, 0)).toBe(Infinity);
  });

  test("the Mercator points of a section, and their bounds", () => {
    const coords = new Float64Array([-0.2, 51.5, -0.1, 51.6, 0, 51.4]);
    const m = mercator(coords, 1, 2);
    expect([...m]).toEqual([mercX(-0.1), mercY(51.6), mercX(0), mercY(51.4)]);
    expect(mercBounds(m)).toEqual([mercX(-0.1), mercY(51.6), mercX(0), mercY(51.4)]);
  });

  test("5 px at zoom 15 is 5 / (512 * 2^15) world units", () => {
    // Two points 10 px apart at zoom 15, on the same latitude.
    const px = 1 / (512 * 2 ** 15);
    const m = new Float64Array([0.5, 0.3, 0.5 + 10 * px, 0.3]);
    expect(distanceToLine(m, 0.5 + 5 * px, 0.3 + 5 * px) / px).toBeCloseTo(5, 6);
  });
});

describe("highlight (app_design 6.4)", () => {
  test("all directions of the lines, or one direction", () => {
    expect(highlights({ lines: ["88", "24"], dir: null }, "24", "inbound")).toBe(true);
    expect(highlights({ lines: ["88"], dir: "outbound" }, "88", "inbound")).toBe(false);
    expect(highlights({ lines: ["88"], dir: "outbound" }, "88", "outbound")).toBe(true);
    expect(highlights(null, "88", "outbound")).toBe(false);
  });
});

describe.skipIf(!HAS_EXPORT)("hover items of data_131026 (app_design 6.4)", () => {
  test("one item for each line and last stop, in the route order", async () => {
    const d = await getCore();
    // 189-O1 and 189-O2 both end at Marble Arch Station: one item. N32-O, 16-O and 189-I: one each.
    const items = hoverItems(d, ["n32-O", "189-O2", "189-O1", "16-O", "189-I"]);
    expect(items.map((i) => `${i.line.name} ${i.dir} to ${i.to}${i.limited ? " (limited)" : ""}`)).toEqual([
      "16 outbound to Bishops Bridge / Paddington Station",
      "189 inbound to Brent Cross Shopping Centre",
      "189 outbound to Marble Arch Station (limited)",
      "N32 outbound to Victoria Station",
    ]);
    // The first pattern of an item gives its pattern key.
    expect(items[2]!.pid).toBe("189-O2");
  });
});
