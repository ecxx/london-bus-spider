// prod_design 9, step 7: the home view.
import { expect, test, type Page } from "@playwright/test";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import { WIDE, h1, mapReady, open } from "./helpers";

const scroll = (page: Page) => page.locator("#panel-content");
const scrollTop = (page: Page) => scroll(page).evaluate((e) => e.scrollTop);
// A click with no scroll into view: the tabs and the rows scroll with the list, and Playwright would
// scroll them into view before a normal click.
const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name }).evaluate((e) => (e as HTMLElement).click());
const setScroll = async (page: Page, y: number) => {
  await scroll(page).evaluate((e, v) => (e.scrollTop = v), y);
  await page.waitForTimeout(100); // the scroll event and one frame
};

test.describe("home view (app_design 6.1)", () => {
  test("the routes list: all lines in the route order", async ({ page }) => {
    await open(page, "#/");
    const rows = page.locator(".scroll .list .row");
    await expect(rows).toHaveCount(675);
    await expect(rows.first()).toContainText("1Royal Free Hospital – Canada Water Bus Station");
    await expect(rows.last().locator(".badge")).toHaveText(/^N\d+$/);
    const r189 = page.getByRole("link", { name: /^189 / });
    await expect(r189).toContainText("24 Hours · limited variants");
    await expect(r189).toHaveAttribute("href", "#/line/189");
  });

  test("the station list scrolls the full 11,571 stations, and draws only the rows in view", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await page.getByRole("tab", { name: "Stations 11,571" }).click();
    // The pointer off the list: a row that scrolls under the pointer moves the hover ring, and each
    // move draws the map again (slow with the software renderer of the browser tests).
    await page.mouse.move(WIDE.width - 20, 20);
    const r = await scroll(page).evaluate(async (el) => {
      const frame = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const seen = new Set<string>();
      let maxRows = 0;
      const list = el.querySelector<HTMLElement>(".vlist")!;
      const end = list.offsetTop + list.offsetHeight - el.clientHeight;
      for (let y = 0; ; y = Math.min(end, y + el.clientHeight + 1000)) {
        el.scrollTop = y;
        await frame();
        const rows = el.querySelectorAll<HTMLElement>(".vitem.row");
        maxRows = Math.max(maxRows, rows.length);
        rows.forEach((a) => seen.add(a.dataset.station!));
        if (y >= end) break;
      }
      const last = [...el.querySelectorAll<HTMLElement>(".vitem.row")].at(-1)!;
      return {
        seen: seen.size,
        maxRows,
        lastBottom: last.offsetTop + last.offsetHeight,
        height: list.offsetHeight,
        lastVisible: last.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1,
      };
    });
    expect(r.seen).toBe(11_571);
    expect(r.lastBottom).toBe(r.height);
    expect(r.lastVisible).toBe(true);
    // The rows in view and 600 px above and below: approximately (634 + 1200) / 48 rows.
    expect(r.maxRows).toBeLessThan(50);
  });

  test("the current letter stays at the top of the station list", async ({ page }) => {
    await open(page, "#/");
    await page.getByRole("tab", { name: /^Stations/ }).click();
    await expect(page.locator(".vstick")).toHaveText("A");
    await setScroll(page, 300_000);
    const letter = await page.locator(".vstick").innerText();
    expect(letter).toMatch(/^[A-Z#]$/);
    // The first row under the header starts with that letter (case and accents ignored).
    const first = await scroll(page).evaluate((el) => {
      const top = el.getBoundingClientRect().top + 30;
      const row = [...el.querySelectorAll<HTMLElement>(".vitem.row")].find((r) => r.getBoundingClientRect().bottom > top)!;
      return row.querySelector(".row-title")!.textContent!;
    });
    expect(first.normalize("NFD").charAt(0).toUpperCase()).toBe(letter);
  });

  test("each tab keeps its scroll position", async ({ page }) => {
    await open(page, "#/");
    await setScroll(page, 3_000);
    await tab(page, /^Stations/);
    expect(await scrollTop(page)).toBe(0);
    await setScroll(page, 20_000);
    await tab(page, /^Routes/);
    expect(await scrollTop(page)).toBe(3_000);
    await tab(page, /^Stations/);
    expect(await scrollTop(page)).toBe(20_000);
    // Open a station in view, and come back.
    const station = await scroll(page).evaluate((el) => {
      const top = el.getBoundingClientRect().top + 100;
      const row = [...el.querySelectorAll<HTMLElement>(".vitem.row")].find((r) => r.getBoundingClientRect().top > top)!;
      return { key: row.dataset.station!, name: row.querySelector(".row-title")!.firstChild!.textContent! };
    });
    await page.locator(`.vitem.row[data-station="${station.key}"]`).evaluate((e) => (e as HTMLElement).click());
    await expect(h1(page)).toHaveText(station.name);
    expect(await scrollTop(page)).toBe(0);
    await page.goBack();
    await expect(page.getByRole("tab", { name: /^Stations/ })).toHaveAttribute("aria-selected", "true");
    expect(await scrollTop(page)).toBe(20_000);
    // The routes tab, after a route.
    await tab(page, /^Routes/);
    expect(await scrollTop(page)).toBe(3_000);
    await page.locator(".scroll .list .row").nth(60).evaluate((e) => (e as HTMLElement).click());
    await expect(h1(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: /^Routes/ })).toHaveAttribute("aria-selected", "true");
    expect(await scrollTop(page)).toBe(3_000);
  });
});

test.describe("home lines (app_design 6.1, prod_design 5.4)", () => {
  test("one line for each of the 1,343 line-directions, in the home view and the about view only", async ({ page }) => {
    await open(page, "#/");
    await mapReady(page, true);
    const r = await page.evaluate(async () => {
      const m = window.__map!;
      const data = (await m.getSource<GeoJSONSource>("home")!.getData()) as FeatureCollection;
      return {
        features: data.features.length,
        props: data.features.find((f) => f.properties!.pid === "189-O1")?.properties,
        paint: [m.getPaintProperty("home-lines", "line-width"), m.getPaintProperty("home-lines", "line-opacity")],
      };
    });
    expect(r.features).toBe(1_343);
    expect(r.props).toEqual({ pid: "189-O1", line: "189", dir: "outbound", cls: "24-hour", lcls: "24-hour" });
    expect(r.paint).toEqual([2, 0.22]);
    const visibility = () => page.evaluate(() => window.__map!.getLayoutProperty("home-lines", "visibility") ?? "visible");
    expect(await visibility()).toBe("visible");
    await page.evaluate(() => (location.hash = "#/station/ICS1001038"));
    await expect.poll(visibility).toBe("none");
    await page.evaluate(() => (location.hash = "#/about"));
    await expect.poll(visibility).toBe("visible");
  });

  // D9: the frame time of a zoom on the home view with all the line-directions. Project chromium-gpu
  // (npm run perf). The limit of prod_design 9, step 15: 16.7 ms or less for 95% of the frames on the laptop.
  test("D9: frame time of a zoom with all the home lines @perf", async ({ page }, info) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await mapReady(page, true);
    await page.waitForFunction(() => window.__map!.areTilesLoaded(), null, { timeout: 30_000 });
    const r = await page.evaluate(async () => {
      const m = window.__map!;
      const gl = document.createElement("canvas").getContext("webgl2")!;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const run = (from: number, to: number) =>
        new Promise<number[]>((ok) => {
          m.jumpTo({ zoom: from });
          const times: number[] = [];
          let last = 0;
          let on = true;
          const tick = (t: number) => {
            if (last) times.push(t - last);
            last = t;
            if (on) requestAnimationFrame(tick);
          };
          m.once("moveend", () => {
            on = false;
            ok(times);
          });
          requestAnimationFrame(tick);
          m.zoomTo(to, { duration: 3000 });
        });
      const frames = [...(await run(11, 15)), ...(await run(15, 11))].sort((a, b) => a - b);
      const q = (p: number) => frames[Math.min(frames.length - 1, Math.floor(p * frames.length))]!;
      return { renderer: String(renderer), frames: frames.length, median: q(0.5), p95: q(0.95), max: frames.at(-1)! };
    });
    const text = `${r.frames} frames, median ${r.median.toFixed(1)} ms, 95% ${r.p95.toFixed(1)} ms, max ${r.max.toFixed(1)} ms (${r.renderer})`;
    console.log(`D9 zoom frame time: ${text}`);
    info.annotations.push({ type: "D9 frame time", description: text });
    expect(r.renderer).not.toMatch(/SwiftShader/);
    expect(r.frames).toBeGreaterThan(10);
  });
});
