// prod_design 9, step 6: the map base. The basemap requests need the network and the test CARTO key.
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import { loadEnv } from "vite";
import { PHONE, WIDE, afterFold, mapReady, open } from "./helpers";

const CHARING_CROSS: [number, number] = [-0.1248, 51.5081];

// The point of Charing Cross in the window, and the zoom.
const startPoint = (page: Page) =>
  page.evaluate((cc) => {
    const m = window.__map!;
    const p = m.project(cc);
    return { x: p.x, y: p.y, zoom: m.getZoom() };
  }, CHARING_CROSS);

const homeFeatures = (page: Page) =>
  page.evaluate(async () => ((await window.__map!.getSource<GeoJSONSource>("home")!.getData()) as FeatureCollection).features.length);

test.describe("first view (app_design 5.2)", () => {
  test("wide: Charing Cross at zoom 12, in the middle of the free area", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await mapReady(page);
    const panel = (await page.locator(".panel").boundingBox())!;
    const p = await startPoint(page);
    expect(p.zoom).toBe(12);
    expect(Math.abs(p.x - (panel.x + panel.width + WIDE.width) / 2)).toBeLessThan(1);
    expect(Math.abs(p.y - WIDE.height / 2)).toBeLessThan(1);
  });

  test("phone: Charing Cross at zoom 12, in the middle of the area above the sheet", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, "#/");
    await mapReady(page);
    const panel = (await page.locator(".panel").boundingBox())!;
    const p = await startPoint(page);
    expect(p.zoom).toBe(12);
    expect(Math.abs(p.x - PHONE.width / 2)).toBeLessThan(1);
    expect(Math.abs(p.y - panel.y / 2)).toBeLessThan(1);
  });

  test("phone: a fold keeps the middle of the free area, and does not change the zoom", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, "#/about");
    await mapReady(page);
    await page.locator(".fold").click();
    await afterFold(page);
    const panel = (await page.locator(".panel").boundingBox())!;
    const p = await startPoint(page);
    expect(p.zoom).toBe(12);
    expect(Math.abs(p.y - panel.y / 2)).toBeLessThan(1);
  });

  test("the zoom range is 10 to 19, with no rotation and no pitch", async ({ page }) => {
    await open(page, "#/");
    await mapReady(page);
    const r = await page.evaluate(() => {
      const m = window.__map!;
      return { min: m.getMinZoom(), max: m.getMaxZoom(), pitch: m.getMaxPitch(), rotate: m.dragRotate.isEnabled() };
    });
    expect(r).toEqual({ min: 10, max: 19, pitch: 0, rotate: false });
  });
});

test.describe("basemap and colour scheme (prod_design 5.2)", () => {
  test("each request to basemaps.cartocdn.com has the test key", async ({ page }) => {
    const env = loadEnv("development", fileURLToPath(new URL("../../../..", import.meta.url)), "VITE_");
    const urls: URL[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (/(^|\.)basemaps\.cartocdn\.com$/.test(u.hostname)) urls.push(u);
    });
    await open(page, "#/");
    await mapReady(page, true);
    await page.waitForFunction(() => window.__map!.areTilesLoaded(), null, { timeout: 30_000 });
    const kinds = new Set(urls.map((u) => (u.pathname.endsWith("style.json") ? "style" : /\.mvt$/.test(u.pathname) ? "tile" : /fonts/.test(u.pathname) ? "glyph" : /sprite/.test(u.pathname) ? "sprite" : "other")));
    expect([...kinds].sort()).toEqual(expect.arrayContaining(["glyph", "sprite", "style", "tile"]));
    // Compare the keys, but do not show them: show only the paths of the bad requests.
    const bad = urls.filter((u) => u.searchParams.getAll("key").length !== 1 || u.searchParams.get("key") !== env.VITE_TEST_CARTO_KEY);
    expect(bad.map((u) => u.host + u.pathname)).toEqual([]);
  });

  test("a change of the system colour scheme changes the basemap and keeps the layers of the client", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, "#/");
    await mapReady(page, true);
    expect(await page.evaluate(() => window.__map!.getStyle().name)).toMatch(/^Positron/);
    const light = await page.evaluate(() => JSON.stringify(window.__map!.getPaintProperty("home-lines", "line-color")));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => /^Dark Matter/.test(window.__map!.getStyle()?.name ?? "") && !!window.__map!.getLayer("home-lines"));
    await page.waitForFunction((l: string) => JSON.stringify(window.__map!.getPaintProperty("home-lines", "line-color")) !== l, light);
    expect(await page.evaluate(() => window.__map!.getPaintProperty("home-lines", "line-color"))).toEqual([
      "match", ["get", "lcls"], "night", "#8EA2F0", "#F0453F",
    ]);
    expect(await homeFeatures(page)).toBe(1_343);
    // The client layers are above the basemap, in the order of prod_design 5.4.
    const ids = await page.evaluate(() => window.__map!.getStyle().layers.map((l) => l.id));
    const at = ids.indexOf("home-lines");
    expect(ids.slice(at)).toEqual(["home-lines", "spider-behind", "spider-after", "station-dots", "highlight", "hover-ring"]);
  });

  test("?theme=dark overrides the system setting", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/?theme=dark#/");
    await mapReady(page);
    await page.waitForFunction(() => /^Dark Matter/.test(window.__map!.getStyle()?.name ?? ""));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#111215");
  });
});

test.describe("attribution (app_design 5.1)", () => {
  const ITEMS = [
    "© OpenStreetMap contributors",
    "© CARTO",
    "Powered by TfL Open Data",
    "Contains OS data © Crown copyright and database rights 2016",
    "Geomni UK Map data © and database rights 2019",
    "About and data sources",
  ];
  const text = (page: Page) => page.locator(".attrib-full");

  test("wide: the full text at the bottom right, at all times", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await mapReady(page);
    const t = await text(page).innerText();
    let at = -1;
    for (const item of ITEMS) {
      const i = t.indexOf(item);
      expect(i, item).toBeGreaterThan(at);
      at = i;
    }
    await expect(text(page).getByRole("link", { name: "© OpenStreetMap contributors" })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    await expect(text(page).getByRole("link", { name: "© CARTO" })).toHaveAttribute("href", "https://carto.com/attributions");
    const box = (await text(page).boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(WIDE.width - 20);
    expect(box.y + box.height).toBeGreaterThan(WIDE.height - 20);
    // A move of the map and ATTRIB_MS do not collapse it.
    await page.mouse.move(800, 300);
    await page.mouse.down();
    await page.mouse.move(700, 350, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(5_500);
    await expect(text(page)).toBeVisible();
    await expect(page.locator(".attrib-i")).toBeHidden();
    await text(page).getByRole("link", { name: "About and data sources" }).click();
    await expect(page.locator(".scroll .head h1")).toHaveText("About");
  });

  test("phone: the full text when the map opens, the (i) button after a move, and the popup", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, "#/");
    await mapReady(page);
    await expect(text(page)).toBeVisible();
    const sheet = (await page.locator(".panel").boundingBox())!;
    expect((await text(page).boundingBox())!.y + (await text(page).boundingBox())!.height).toBeLessThanOrEqual(sheet.y);
    // A move of the map by the user.
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(150, 250, { steps: 5 });
    await page.mouse.up();
    const i = page.getByRole("button", { name: "Map data sources" });
    await expect(i).toBeVisible();
    await expect(text(page)).toBeHidden();
    const ib = (await i.boundingBox())!;
    expect(ib.x + ib.width).toBeGreaterThan(PHONE.width - 20); // at the bottom right of the free area
    expect(ib.y + ib.height).toBeLessThanOrEqual(sheet.y);
    expect(ib.y + ib.height).toBeGreaterThan(sheet.y - 30);
    await i.click();
    await expect(text(page)).toBeVisible();
    await expect(i).toHaveAttribute("aria-expanded", "true");
    for (const item of ITEMS) await expect(text(page)).toContainText(item);
    await page.locator(".attrib").getByRole("button", { name: "Close" }).click();
    await expect(text(page)).toBeHidden();
    await expect(i).toBeVisible();
  });

  test("phone: the text collapses after ATTRIB_MS", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, "#/");
    await mapReady(page);
    await expect(text(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Map data sources" })).toBeVisible({ timeout: 7_000 });
    await expect(text(page)).toBeHidden();
  });
});

test.describe("no WebGL (prod_design 5.1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/.test(type)) return null;
        return (get as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof get;
    });
  });

  test("no map, a message, and the panel operates", async ({ page }) => {
    await open(page, "#/");
    await expect(page.locator(".no-map")).toHaveText("This browser cannot show the map.");
    expect(await page.evaluate(() => window.__map)).toBeUndefined();
    await page.getByRole("tab", { name: /^Stations/ }).click();
    await page.locator(".vitem.row").first().click();
    await expect(page.locator(".scroll .head h1")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: /^Stations/ })).toHaveAttribute("aria-selected", "true");
  });
});
