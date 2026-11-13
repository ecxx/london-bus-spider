// prod_design 9, step 8: the station view and the stop view. The spider graphs at Aldwych / Drury Lane,
// Brondesbury Station and Oxford Circus Station. The rows agree with the design demo (the demo subset
// has all the lines of Aldwych and Oxford Circus, and only the 189 of Brondesbury).
import { expect, test, type Page } from "@playwright/test";
import type { FeatureCollection, LineString } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import { PHONE, WIDE, fitDone, mapReady, open } from "./helpers";

const ALDWYCH = "490G00019703";
const BRONDESBURY = "ICS1001038";
const OXFORD_CIRCUS = "ICS1000173";

const rows = (page: Page) => page.locator(".list.services .row");
// "badge to|from title sub" for each row.
const rowTexts = (page: Page) =>
  rows(page).evaluateAll((els) =>
    els.map((e) => [".badge", ".to", ".row-title", ".row-sub"].map((s) => e.querySelector(s)!.textContent).join(" ").replace(/ (to|from) \1/, " $1 ")),
  );

// The view source, after the lines load: the parts of each feature.
async function viewFeatures(page: Page) {
  await page.waitForFunction(() => !!window.__map?.getSource("view"), null, { timeout: 30_000 });
  return page.evaluate(async () => {
    const fc = (await window.__map!.getSource<GeoJSONSource>("view")!.getData()) as FeatureCollection<LineString>;
    return fc.features.map((f) => f.properties as { pid: string; line: string; part: string; cls: string; len: number });
  });
}

test.describe("station view (app_design 6.2, 6.4)", () => {
  test("Aldwych / Drury Lane: the stop chips, the filter chips and 33 rows", async ({ page }) => {
    await open(page, `#/station/${ALDWYCH}`);
    await expect(page.locator(".scroll .head h1")).toHaveText("Aldwych / Drury Lane");
    await expect(page.getByRole("group", { name: "Stops" }).locator(".chip")).toHaveText(["EStop E", "RStop R", "SStop S"]);
    const filters = page.getByRole("group", { name: "Filter" }).locator(".chip");
    await expect(filters).toHaveText(["All 33", "Day 18", "Night 21"]);
    await expect(filters.first()).toHaveAttribute("aria-pressed", "true");
    const t = await rowTexts(page);
    expect(t).toHaveLength(33);
    expect(t.slice(0, 4)).toEqual([
      "1 to Canada Water Bus Station Stop S · Day",
      "9 from Hammersmith Bus Station Stop E · Ends here · Day",
      "15 to Charing Cross Station Stop R · Day",
      "23 from Great Western Road Stop E · Ends here · 24 Hours",
    ]);
    await expect(rows(page).first()).toHaveAttribute("href", `#/station/${ALDWYCH}/line/1/outbound`);
  });

  test("Aldwych / Drury Lane: the map lines, the pins and the station dots", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    await fitDone(page);
    const f = await viewFeatures(page);
    // Each pattern has a section before the cut point. 7 patterns end at the station: no section after it.
    expect(f.filter((x) => x.part === "behind")).toHaveLength(33);
    expect(f.filter((x) => x.part === "after")).toHaveLength(26);
    expect(new Set(f.map((x) => x.line)).size).toBe(30);
    expect(f.every((x) => x.len > 0)).toBe(true);
    await expect(page.locator(".pin")).toHaveCount(3);
    await expect(page.locator(".pin.sel")).toHaveCount(0);
    const dots = await page.evaluate(() => {
      const m = window.__map!;
      return { filter: m.getFilter("station-dots"), ring: JSON.stringify(m.getPaintProperty("station-dots", "circle-stroke-color")) };
    });
    // The selected station has no dot. The served stations have a red ring.
    expect(dots.filter).toEqual(["!=", ["get", "k"], ALDWYCH]);
    expect(dots.ring).toContain(`"ICS1000173"`); // Oxford Circus Station is served after Aldwych
    // The home lines are not shown.
    expect(await page.evaluate(() => window.__map!.getLayoutProperty("home-lines", "visibility"))).toBe("none");
  });

  test("the Night filter: the rows and the lines of the night and 24-hour routes", async ({ page }) => {
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    await page.getByRole("button", { name: "Night 21" }).click();
    await expect(page.getByRole("button", { name: "Night 21" })).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(21);
    const rowLines = await rows(page).evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLElement).dataset.line!))].sort());
    await page.waitForFunction(
      (want) => {
        const fc = window.__map!.getSource("view")!.serialize().data as FeatureCollection;
        return JSON.stringify([...new Set(fc.features.map((f) => f.properties!.line as string))].sort()) === JSON.stringify(want);
      },
      rowLines,
      { polling: 100 },
    );
    // The served stations are of the shown lines only: fewer than with All.
    const ring = await page.evaluate(() => JSON.stringify(window.__map!.getPaintProperty("station-dots", "circle-stroke-color")));
    await page.getByRole("button", { name: "All 33" }).click();
    await page.waitForFunction((r) => JSON.stringify(window.__map!.getPaintProperty("station-dots", "circle-stroke-color")) !== r, ring);
    const all = await page.evaluate(() => JSON.stringify(window.__map!.getPaintProperty("station-dots", "circle-stroke-color")));
    expect(all.length).toBeGreaterThan(ring.length);
  });

  test("a change of the colour scheme keeps the spider graph and its station dots", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    await fitDone(page);
    const before = (await viewFeatures(page)).length;
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => /^Dark Matter/.test(window.__map!.getStyle()?.name ?? "") && !!window.__map!.getLayer("station-dots"));
    await page.waitForFunction(() => JSON.stringify(window.__map!.getPaintProperty("spider-after", "line-color")).includes("#F0453F"));
    expect((await viewFeatures(page)).length).toBe(before);
    const dots = await page.evaluate(() => ({
      filter: window.__map!.getFilter("station-dots"),
      ring: JSON.stringify(window.__map!.getPaintProperty("station-dots", "circle-stroke-color")),
    }));
    expect(dots.filter).toEqual(["!=", ["get", "k"], ALDWYCH]);
    expect(dots.ring).toContain('"ICS1000173"');
    expect(dots.ring).toContain("#F0453F");
  });

  test("Brondesbury Station: 12 rows, the 189 rows of the demo", async ({ page }) => {
    await open(page, `#/station/${BRONDESBURY}`);
    await expect(page.getByRole("group", { name: "Stops" }).locator(".chip")).toHaveText(["CStop C", "DStop D"]);
    const t = await rowTexts(page);
    expect(t).toHaveLength(12);
    expect(t).toContain("189 to Brent Cross Shopping Centre Stop C · 24 Hours");
    expect(t).toContain("189 to Marble Arch Station Stop D · 24 Hours · 1 limited variant");
    await mapReady(page, true);
    await fitDone(page);
    const f = await viewFeatures(page);
    // 189-O2 is limited: its section after the stop is dashed (cls "limited").
    expect(f.filter((x) => x.line === "189" && x.part === "after").map((x) => x.cls).sort()).toEqual(["24-hour", "24-hour", "limited"]);
  });

  test("Oxford Circus Station: 20 rows", async ({ page }) => {
    await open(page, `#/station/${OXFORD_CIRCUS}`);
    const t = await rowTexts(page);
    expect(t).toHaveLength(20);
    expect(t[0]).toBe("12 to Margaret Street / Oxford Circus Stop RC · 24 Hours");
    expect(t).toContain("159 from Streatham Station Stop RC · Ends here · 24 Hours");
    expect(t.at(-1)).toBe("N137 to John Prince's Street / Oxford Circus Stop OH · Night");
  });
});

test.describe("stop view (app_design 6.3)", () => {
  test("the stop chips with the current stop, All n, and the rows of the stop", async ({ page }) => {
    await open(page, "#/stop/490001038D");
    const chips = page.getByRole("group", { name: "Stops" }).locator(".chip");
    await expect(chips).toHaveText(["CStop C", "DStop D", "All 2"]);
    await expect(chips.nth(1)).toHaveAttribute("aria-current", "true");
    await expect(rows(page)).toHaveCount(6);
    await mapReady(page, true);
    await expect(page.locator(".pin")).toHaveCount(2);
    await expect(page.locator(".pin.sel")).toHaveCount(1);
    await expect(page.locator(".pin.sel")).toHaveAttribute("data-stop", "490001038D");
    await chips.nth(2).click();
    await expect(page).toHaveURL(new RegExp(`#/station/${BRONDESBURY}$`));
  });

  test("a stop with a heading from the compass point, and a stop with no code (app_design 3.5)", async ({ page }) => {
    await open(page, "#/stop/03700082");
    await expect(page.locator(".scroll .head .roundel")).toHaveText("↘");
    await expect(page.locator(".scroll .head p")).toHaveText("opp · Cedar Way");
    await expect(page.getByRole("group", { name: "Stops" }).locator(".chip")).toHaveText(["↖adj", "↘opp", "All 2"]);
    await open(page, "#/stop/1500625");
    await expect(page.getByRole("group", { name: "Stops" }).locator(".chip")).toHaveText(["•Castell Road", "↗adj", "All 2"]);
  });

  test("a click on a pin opens the stop view", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${BRONDESBURY}`);
    await mapReady(page, true);
    await fitDone(page);
    // At the fit zoom, the two pins of the station overlap. Zoom in to the stop.
    await page.evaluate(() => {
      const m = window.__map!;
      const r = document.querySelector('.pin[data-stop="490001038N"]')!.getBoundingClientRect();
      const box = m.getContainer().getBoundingClientRect();
      m.jumpTo({ center: m.unproject([r.x + r.width / 2 - box.x, r.y + r.height / 2 - box.y]), zoom: 18 });
    });
    await page.locator('.pin[data-stop="490001038N"]').click();
    await expect(page).toHaveURL(/#\/stop\/490001038N$/);
  });

  test("phone: the selected stop is in the free area above the sheet", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, "#/stop/490001038D");
    await mapReady(page, true);
    await fitDone(page);
    const sheet = (await page.locator(".panel").boundingBox())!;
    const pin = (await page.locator(".pin.sel").boundingBox())!;
    expect(pin.y + pin.height / 2).toBeLessThan(sheet.y);
    expect(pin.y).toBeGreaterThan(0);
  });
});
