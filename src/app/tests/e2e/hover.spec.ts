// prod_design 9, step 9: hover and click. The routes at the pointer (prod_design 5.5), the tooltips,
// the highlight, the route menu, the row hover and the hover ring (app_design 5.6, 6.4).
import { expect, test, type Page } from "@playwright/test";
import { WIDE, fitDone, mapReady, open } from "./helpers";

const ALDWYCH = "490G00019703";

// The lines of the highlight layer filter: [] if no route is highlighted.
const litLines = (page: Page) =>
  page.evaluate(() => {
    const f = JSON.stringify(window.__map!.getFilter("highlight"));
    const m = /"literal",(\[[^\]]*\])/.exec(f);
    return m ? (JSON.parse(m[1]!) as string[]).sort() : [];
  });

// Points beside the sections after the stop, with the lines 5 px or less from each point. The lines come
// from the view source and map.project, not from the hit test of the client. A point where a line is
// 4.5 to 5.5 px away is not used (the line width and the rounding of the tiles), and a point near a pin
// or under the panel is not used.
function samplePoints(page: Page, n: number) {
  return page.evaluate((n) => {
    const m = window.__map!;
    const fc = m.getSource("view")!.serialize().data as GeoJSON.FeatureCollection<GeoJSON.LineString>;
    const lines = fc.features
      .filter((f) => f.properties!.part === "after")
      .map((f) => ({ line: f.properties!.line as string, pts: f.geometry.coordinates.map((c) => m.project(c as [number, number])) }));
    const panel = document.querySelector(".panel")!.getBoundingClientRect();
    const pins = [...document.querySelectorAll(".pin")].map((e) => e.getBoundingClientRect());
    const dist = (pts: { x: number; y: number }[], x: number, y: number) => {
      let best = Infinity;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
        best = Math.min(best, Math.hypot(a.x + t * dx - x, a.y + t * dy - y));
      }
      return best;
    };
    const out: { x: number; y: number; lines: string[] }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let tries = 0; out.length < n && tries < 20_000; tries++) {
      const l = lines[Math.floor(rnd() * lines.length)]!;
      const p = l.pts[Math.floor(rnd() * l.pts.length)]!;
      const x = p.x + (rnd() - 0.5) * 16;
      const y = p.y + (rnd() - 0.5) * 16;
      if (x < panel.right + 20 || x > innerWidth - 60 || y < 20 || y > innerHeight - 60) continue;
      if (pins.some((r) => Math.hypot(r.x + r.width / 2 - x, r.y + r.height / 2 - y) < 40)) continue;
      const ds = lines.map((q) => ({ line: q.line, d: dist(q.pts, x, y) }));
      if (ds.some((q) => q.d > 4.5 && q.d < 5.5)) continue;
      out.push({ x, y, lines: [...new Set(ds.filter((q) => q.d <= 5).map((q) => q.line))].sort() });
    }
    return out;
  }, n);
}

test.describe("hover on the map (app_design 6.4, prod_design 5.5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    await fitDone(page);
  });

  test("the tooltip shows each route 5 px or less from the pointer, and only these", async ({ page }) => {
    test.slow(); // each point draws the highlight, with the software renderer of the browser tests
    const points = await samplePoints(page, 40);
    expect(points.length).toBe(40);
    expect(points.filter((p) => p.lines.length === 0).length).toBeGreaterThan(3); // some points are off the lines
    expect(points.filter((p) => p.lines.length > 1).length).toBeGreaterThan(3); // some have 2 or more routes
    for (const p of points) {
      await page.mouse.move(p.x, p.y);
      await page.waitForFunction(
        (want) => {
          const f = JSON.stringify(window.__map!.getFilter("highlight"));
          const m = /"literal",(\[[^\]]*\])/.exec(f);
          return JSON.stringify(m ? (JSON.parse(m[1]!) as string[]).sort() : []) === JSON.stringify(want);
        },
        p.lines,
        { timeout: 2_000 },
      ).catch(() => {});
      expect(await litLines(page), `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`).toEqual(p.lines);
      const tip = page.locator(".tip");
      if (p.lines.length) {
        await expect(tip).toBeVisible();
        if (p.lines.length > 1) await expect(tip).toContainText("Click to choose");
      } else await expect(tip).toBeHidden();
    }
  });

  test("the highlight: the other lines at 12%, the rows of the routes marked", async ({ page }) => {
    const [p] = (await samplePoints(page, 60)).filter((q) => q.lines.length > 1);
    await page.mouse.move(p!.x, p!.y);
    await expect(page.locator(".list.services")).toHaveClass(/has-hot/);
    const hot = await page.locator(".list .row.is-hot").evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLElement).dataset.line!))].sort());
    expect(hot).toEqual(p!.lines);
    const opacity = JSON.stringify(await page.evaluate(() => window.__map!.getPaintProperty("spider-after", "line-opacity")));
    expect(opacity).toContain("0.12");
    // Off the lines: no highlight, no tooltip.
    await page.mouse.move(1100, 60);
    const off = (await samplePoints(page, 60)).find((q) => q.lines.length === 0)!;
    await page.mouse.move(off.x, off.y);
    await expect(page.locator(".tip")).toBeHidden();
    await expect(page.locator(".list.services")).not.toHaveClass(/has-hot/);
    expect(await page.evaluate(() => window.__map!.getPaintProperty("spider-after", "line-opacity"))).toBe(0.8);
  });

  test("a click with two or more routes shows the menu; a menu row highlights its route and opens it", async ({ page }) => {
    const [p] = (await samplePoints(page, 60)).filter((q) => q.lines.length > 2);
    await page.mouse.click(p!.x, p!.y);
    const menu = page.locator(".pick");
    await expect(menu).toBeVisible();
    const n = await menu.locator(".row").count();
    expect(n).toBeGreaterThanOrEqual(p!.lines.length);
    await expect(menu.locator(".pick-head")).toHaveText(`${n} routes here`);
    expect(page.url()).toContain(`#/station/${ALDWYCH}`);
    // The menu is in the free area, not under the panel.
    const panel = (await page.locator(".panel").boundingBox())!;
    expect((await menu.boundingBox())!.x).toBeGreaterThanOrEqual(panel.x + panel.width);
    // The pointer on a row: only that route and direction.
    const row = menu.locator(".row").nth(1);
    await row.hover();
    const f = JSON.stringify(await page.evaluate(() => window.__map!.getFilter("highlight")));
    expect(f).toMatch(/"dir"\],"(inbound|outbound)"/);
    expect(JSON.parse(/"literal",(\[[^\]]*\])/.exec(f)![1]!)).toHaveLength(1);
    const href = (await row.getAttribute("href"))!;
    expect(href).toMatch(new RegExp(`^#/station/${ALDWYCH}/line/[^/]+/(inbound|outbound)$`));
    await row.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(menu).toBeHidden();
  });

  test("a click with one route opens it from the station", async ({ page }) => {
    const p = (await samplePoints(page, 80)).find((q) => q.lines.length === 1)!;
    await page.mouse.click(p.x, p.y);
    await expect(page).toHaveURL(new RegExp(`#/station/${ALDWYCH}/line/${p.lines[0]}/(inbound|outbound)$`));
  });

  test("a click off the lines closes the menu", async ({ page }) => {
    const pts = await samplePoints(page, 80);
    const multi = pts.find((q) => q.lines.length > 1)!;
    const off = pts.find((q) => q.lines.length === 0)!;
    await page.mouse.click(multi.x, multi.y);
    await expect(page.locator(".pick")).toBeVisible();
    await page.mouse.click(off.x, off.y);
    await expect(page.locator(".pick")).toBeHidden();
  });
});

test.describe("hover in the panel (app_design 6.4, 5.6)", () => {
  test("the pointer on a list row highlights only that direction", async ({ page }) => {
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    // The 59 has two rows (two directions) at Aldwych.
    const rows = page.locator('.list.services .row[data-line="59"]');
    await expect(rows).toHaveCount(2);
    const dir = (await rows.first().getAttribute("data-dir"))!;
    await rows.first().hover();
    await expect(page.locator(".list .row.is-hot")).toHaveCount(1);
    await expect(rows.first()).toHaveClass(/is-hot/);
    await expect(rows.nth(1)).not.toHaveClass(/is-hot/);
    expect(await page.evaluate(() => window.__map!.getFilter("highlight"))).toEqual([
      "all",
      ["==", ["get", "part"], "after"],
      ["all", ["in", ["get", "line"], ["literal", ["59"]]], ["==", ["get", "dir"], dir]],
    ]);
    // Out of the list: no highlight.
    await page.locator(".scroll .head h1").hover();
    await expect(page.locator(".list .row.is-hot")).toHaveCount(0);
    expect(await page.evaluate(() => window.__map!.getFilter("highlight"))).toEqual(["==", ["get", "part"], ""]);
  });

  test("the hover ring: at the station of the row under the pointer", async ({ page }) => {
    await open(page, "#/");
    await mapReady(page, true);
    await page.getByRole("tab", { name: /^Stations/ }).click();
    const row = page.locator(".vitem.row").nth(3);
    const key = (await row.getAttribute("data-station"))!;
    await row.hover();
    const ring = () => page.evaluate(() => (window.__map!.getSource("hover")!.serialize().data as GeoJSON.FeatureCollection | GeoJSON.Feature));
    await expect.poll(async () => JSON.stringify(await ring())).toContain("Point");
    const at = (await ring()) as GeoJSON.Feature<GeoJSON.Point>;
    const station = await page.evaluate(async (k) => {
      const m = await (await fetch("/data/manifest.json")).json();
      const s = await (await fetch(`/data/${m.files.stations}`)).json();
      return s[k] as [string, number, number];
    }, key);
    expect(at.geometry.coordinates).toEqual([station[2], station[1]]);
    await page.locator(".tabs").hover();
    await expect.poll(async () => JSON.stringify(await ring())).not.toContain("Point");
  });
});

test.describe("station dots and stop pins (app_design 5.5)", () => {
  test("a station dot: the tooltip with the name and the stops, and a click opens the station", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    await fitDone(page);
    // Zoom 16 at Savoy Street (490G00012604), a station after Aldwych on the 1.
    await page.evaluate(() => window.__map!.jumpTo({ center: [-0.11782, 51.51072], zoom: 16 }));
    await page.waitForFunction(() => !window.__map!.isMoving() && window.__map!.loaded(), null, { timeout: 15_000 });
    const dot = await page.evaluate(() => {
      const m = window.__map!;
      const f = m.queryRenderedFeatures({ layers: ["station-dots"] }).map((f) => ({ k: f.properties.k as string, p: m.project((f.geometry as GeoJSON.Point).coordinates as [number, number]) }));
      const panel = document.querySelector(".panel")!.getBoundingClientRect();
      return f.find((x) => x.p.x > panel.right + 30 && x.p.x < innerWidth - 60 && x.p.y > 60 && x.p.y < innerHeight - 60)!;
    });
    await page.mouse.move(dot.p.x, dot.p.y);
    const tip = page.locator(".tip");
    await expect(tip).toBeVisible();
    const names = await page.evaluate(async (k) => {
      const m = await (await fetch("/data/manifest.json")).json();
      return ((await (await fetch(`/data/${m.files.stations}`)).json())[k] as [string])[0];
    }, dot.k);
    await expect(tip.locator("b")).toHaveText(names.replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ").trim());
    await page.mouse.click(dot.p.x, dot.p.y);
    await expect(page).toHaveURL(new RegExp(`#/station/${dot.k}$`));
  });

  test("a stop pin: the tooltip with the stop name and its text form", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/stop/490001038D");
    await mapReady(page, true);
    await fitDone(page);
    await page.locator(".pin.sel").hover();
    await expect(page.locator(".tip")).toHaveText("Brondesbury Station Stop D");
  });
});
