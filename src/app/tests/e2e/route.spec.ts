// prod_design 9, step 11: the route view (app_design 6.5). The URLs #/line/189, #/line/189/outbound/2
// and #/station/ICS1001038/line/189 show the correct pattern, the red stops and the scroll to the first
// red stop.
import { expect, test, type Page } from "@playwright/test";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import { PHONE, WIDE, afterFold, fitDone, hash, mapReady, open, panelSettled } from "./helpers";

const BRONDESBURY = "ICS1001038"; // stops C (490001038N, inbound) and D (490001038D, outbound)

const stops = (page: Page) => page.locator(".tl > li");
const head = (page: Page) => page.locator(".scroll .head");

// The features of a source of the map: the properties of each.
async function features(page: Page, id: string) {
  await page.waitForFunction((s) => !!window.__map?.getSource(s), id, { timeout: 30_000 });
  return page.evaluate(async (s) => {
    const fc = (await window.__map!.getSource<GeoJSONSource>(s)!.getData()) as FeatureCollection;
    return fc.features.map((f) => f.properties as Record<string, unknown>);
  }, id);
}

// The middle of the first red stop row, as a part of the height of the scroll area (0.5: the middle).
const redPosition = (page: Page) =>
  page.evaluate(() => {
    const area = document.querySelector<HTMLElement>(".scroll")!.getBoundingClientRect();
    const li = document.querySelector<HTMLElement>(".tl li.here, .tl li.near")!.getBoundingClientRect();
    return (li.top + li.height / 2 - area.top) / area.height;
  });

test.describe("route view (app_design 6.5)", () => {
  test("#/line/189: the main pattern of the outbound direction, no red stop", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/line/189");
    await expect(head(page).locator(".badge.lg")).toHaveText("189");
    await expect(head(page).locator("h1")).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
    await expect(head(page).locator("p")).toHaveText("24 Hours · 37 stops");
    const tabs = page.getByRole("group", { name: "Directions" }).locator(".tab");
    await expect(tabs).toHaveText(["To Marble Arch Station", "To Brent Cross Shopping Centre"]);
    await expect(tabs.first()).toHaveAttribute("aria-current", "true");
    const variants = page.getByRole("group", { name: "Variants" }).locator(".variant");
    await expect(variants).toHaveText(["Main route37 stops", "Variant 2Limited26 stops · from Cricklewood Broadway / the Crown"]);
    await expect(variants.first()).toHaveAttribute("aria-current", "true");
    await expect(stops(page)).toHaveCount(37);
    await expect(stops(page).first()).toHaveClass(/\bend\b/);
    await expect(stops(page).last()).toHaveClass(/\bend\b/);
    await expect(page.locator(".tl li.here, .tl li.near")).toHaveCount(0);
    await expect(page.locator(".tl")).not.toHaveClass(/limited/);
    expect(await page.locator(".scroll").evaluate((e) => e.scrollTop)).toBe(0);

    // The map: the selected pattern, the other patterns of the line, the stop dots, no pin.
    await mapReady(page, true);
    await fitDone(page);
    const f = await features(page, "view");
    expect(f.map((x) => `${x.pid} ${x.part}`).sort()).toEqual(["189-I other", "189-O1 selected", "189-O2 other"]);
    const dots = await features(page, "route-stops");
    expect(dots).toHaveLength(37);
    expect(dots.filter((x) => x.end).length).toBe(2);
    await expect(page.locator(".pin")).toHaveCount(0);
    expect(await page.evaluate(() => window.__map!.getLayoutProperty("home-lines", "visibility"))).toBe("none");
    expect(await page.evaluate(() => window.__map!.getFilter("station-dots"))).toBeFalsy();
    // The fit: the selected pattern in the free area, from zoom 10.
    const z = await page.evaluate(() => window.__map!.getZoom());
    expect(z).toBeGreaterThanOrEqual(10);
  });

  test("#/line/189/outbound/2: the limited variant", async ({ page }) => {
    await open(page, "#/line/189/outbound/2");
    await expect(head(page).locator("h1")).toHaveText("Cricklewood Broadway / the Crown – Marble Arch Station");
    await expect(head(page).locator("p")).toHaveText("Limited service · 26 stops");
    await expect(page.locator(".variant").nth(1)).toHaveAttribute("aria-current", "true");
    await expect(stops(page)).toHaveCount(26);
    await expect(page.locator(".tl")).toHaveClass(/limited/);
    await expect(page.locator(".tl li.here, .tl li.near")).toHaveCount(0);
    await mapReady(page, true);
    await fitDone(page);
    const sel = (await features(page, "view")).filter((x) => x.part === "selected");
    expect(sel.map((x) => [x.pid, x.cls])).toEqual([["189-O2", "limited"]]);
    // The selected limited pattern is dashed (8 px, 8 px).
    const dash = await page.evaluate(() => JSON.stringify(window.__map!.getPaintProperty("route-selected", "line-dasharray")));
    expect(dash).toContain("[1.6,1.6]");
  });

  test("#/station/ICS1001038/line/189: the stops of the station are red, the scroll to the first red stop", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${BRONDESBURY}/line/189`);
    await expect(head(page).locator("h1")).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
    await expect(page.locator(".tl li.here")).toHaveCount(1);
    await expect(page.locator(".tl li.near")).toHaveCount(0);
    await expect(stops(page).nth(17)).toHaveClass(/\bhere\b/);
    await expect(stops(page).nth(17).locator(".row")).toHaveAttribute("data-stop", "490001038D");
    // The tabs and the variants keep the station.
    await expect(page.locator(".tab").nth(1)).toHaveAttribute("href", `#/station/${BRONDESBURY}/line/189/inbound`);
    await expect(page.locator(".variant").nth(1)).toHaveAttribute("href", `#/station/${BRONDESBURY}/line/189/outbound/2`);
    await panelSettled(page);
    expect(await redPosition(page)).toBeCloseTo(0.5, 1);

    // The map: the stops of the station are pins (no selected pin), not dots. The station has no dot.
    await mapReady(page, true);
    await fitDone(page);
    await expect(page.locator(".pin")).toHaveCount(2);
    await expect(page.locator(".pin.sel")).toHaveCount(0);
    const dots = await features(page, "route-stops");
    expect(dots).toHaveLength(36);
    expect(dots.some((x) => x.k === "490001038D")).toBe(false);
    expect(await page.evaluate(() => window.__map!.getFilter("station-dots"))).toEqual(["!=", ["get", "k"], BRONDESBURY]);
    // The fit: the pin of the focus is in the free area.
    const panel = (await page.locator(".panel").boundingBox())!;
    const pin = (await page.locator('.pin[data-stop="490001038D"]').boundingBox())!;
    expect(pin.x).toBeGreaterThan(panel.x + panel.width);
    expect(pin.x + pin.width).toBeLessThan(WIDE.width);
    expect(pin.y).toBeGreaterThan(0);
    expect(pin.y + pin.height).toBeLessThan(WIDE.height);
  });

  test("from a stop: the stop is red and the selected pin", async ({ page }) => {
    await open(page, "#/stop/490001038N/line/189/inbound");
    await expect(head(page).locator("h1")).toHaveText("Marble Arch Station – Brent Cross Shopping Centre");
    await expect(page.locator(".tab").nth(1)).toHaveAttribute("aria-current", "true");
    await expect(stops(page).nth(20)).toHaveClass(/\bhere\b/);
    await mapReady(page, true);
    await expect(page.locator(".pin.sel")).toHaveAttribute("data-stop", "490001038N");
    // Esc goes up to the stop.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/#\/stop\/490001038N$/);
  });

  test("phone: the scroll to the first red stop, also when the route opens in the folded panel", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, `#/station/${BRONDESBURY}/line/189`);
    await panelSettled(page);
    expect(await redPosition(page)).toBeCloseTo(0.5, 1);

    // Fold, open a different route view, then open the panel.
    await open(page, `#/station/${BRONDESBURY}`);
    await page.locator(".fold").click();
    await afterFold(page);
    await page.evaluate((k) => (location.hash = `#/station/${k}/line/189/inbound`), BRONDESBURY);
    await expect(page.locator(".peek .head h1")).toHaveText("Marble Arch Station – Brent Cross Shopping Centre");
    await page.locator(".fold").click();
    await panelSettled(page);
    expect(await redPosition(page)).toBeCloseTo(0.5, 1);
  });

  test("the tabs, the variants and the stop rows open their views", async ({ page }) => {
    await open(page, "#/line/189");
    await page.locator(".tab").nth(1).click();
    await expect(page).toHaveURL(/#\/line\/189\/inbound$/);
    await expect(stops(page)).toHaveCount(37);
    await expect(page.getByRole("group", { name: "Variants" })).toHaveCount(0);
    await page.locator(".tab").first().click();
    await page.locator(".variant").nth(1).click();
    await expect(page).toHaveURL(/#\/line\/189\/outbound\/2$/);
    await stops(page).first().locator(".row").click();
    expect(await hash(page)).toMatch(/^#\/stop\/[^/]+$/);
  });

  test("the stop dots: the tooltip, and a click opens the stop view", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/line/189");
    await mapReady(page, true);
    await fitDone(page);
    // The last stop of 189-O1 (an end dot) on the screen.
    const last = await page.evaluate(() => document.querySelector<HTMLElement>(".tl > li:last-child .row")!.dataset.stop!);
    const p = await page.evaluate(async (k) => {
      const m = window.__map!;
      const fc = (await m.getSource<GeoJSONSource>("route-stops")!.getData()) as FeatureCollection<GeoJSON.Point>;
      const f = fc.features.find((x) => x.properties!.k === k)!;
      m.jumpTo({ center: f.geometry.coordinates as [number, number], zoom: 16 });
      const box = m.getContainer().getBoundingClientRect();
      const q = m.project(f.geometry.coordinates as [number, number]);
      return { x: box.x + q.x, y: box.y + q.y };
    }, last);
    await page.waitForFunction(() => window.__map!.loaded() && !window.__map!.isMoving());
    await page.mouse.move(p.x, p.y);
    await expect(page.locator(".tip")).toBeVisible();
    await expect(page.locator(".tip b")).toHaveText("Marble Arch Station");
    await page.mouse.click(p.x, p.y);
    await expect(page).toHaveURL(new RegExp(`#/stop/${last}$`));
  });

  test("the pointer on a stop row shows the hover ring", async ({ page }) => {
    await open(page, "#/line/189");
    await mapReady(page, true);
    const k = await stops(page).nth(3).locator(".row").getAttribute("data-stop");
    await stops(page).nth(3).locator(".row").hover();
    // The hover source is one point, at the stop dot of the row.
    const dot = await page.evaluate(async (s) => {
      const fc = (await window.__map!.getSource<GeoJSONSource>("route-stops")!.getData()) as FeatureCollection<GeoJSON.Point>;
      return JSON.stringify(fc.features.find((f) => f.properties!.k === s)!.geometry.coordinates);
    }, k!);
    await expect
      .poll(() => page.evaluate(() => JSON.stringify((window.__map!.getSource("hover")!.serialize().data as GeoJSON.Feature<GeoJSON.Point>).geometry?.coordinates)))
      .toBe(dot);
  });
});
