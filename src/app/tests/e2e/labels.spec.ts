// prod_design 9, step 10: the end labels and the bubbles (prod_design 5.6, app_design 6.4), and the
// station names (app_design 5.4).
import { expect, test, type Page } from "@playwright/test";
import { WIDE, fitDone, mapReady, open } from "./helpers";

const ALDWYCH = "490G00019703";
const ALDWYCH_S = "490019703Z"; // Stop S of Aldwych / Drury Lane

// Go to a zoom at the middle of the selected stops, and wait for the settle.
async function zoomTo(page: Page, zoom: number) {
  await page.evaluate((z) => {
    const m = window.__map!;
    const pins = [...document.querySelectorAll(".pin")].map((e) => e.getBoundingClientRect());
    const box = m.getContainer().getBoundingClientRect();
    const x = pins.reduce((s, r) => s + r.x + r.width / 2, 0) / pins.length - box.x;
    const y = pins.reduce((s, r) => s + r.y + r.height / 2, 0) / pins.length - box.y;
    m.jumpTo({ center: m.unproject([x, y]), zoom: z });
  }, zoom);
  await page.waitForFunction(() => window.__settled!(), null, { polling: 50 });
  await page.waitForTimeout(50); // the "idle" of the station names
}

// The boxes of the placed labels, of the pins and of the area around each selected stop.
const boxes = (page: Page) =>
  page.evaluate(() => {
    const r = (e: Element) => {
      const b = e.getBoundingClientRect();
      return [b.left, b.top, b.right, b.bottom] as [number, number, number, number];
    };
    return {
      labels: [...document.querySelectorAll(".term:not(.is-collapsed) .term-in")].map(r),
      bubbles: document.querySelectorAll(".term.is-collapsed").length,
      pins: [...document.querySelectorAll(".pin .roundel")].map(r),
    };
  });

const overlap = (a: number[], b: number[]) => a[0]! < b[2]! - 0.5 && a[2]! > b[0]! + 0.5 && a[1]! < b[3]! - 0.5 && a[3]! > b[1]! + 0.5;

test("the station view has no end labels (app_design 6.4)", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await open(page, `#/station/${ALDWYCH}`);
  await mapReady(page, true);
  await fitDone(page);
  await expect(page.locator(".pin")).toHaveCount(3);
  await expect(page.locator(".term")).toHaveCount(0);
});

test.describe("end labels (app_design 6.4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/stop/${ALDWYCH_S}`);
    await mapReady(page, true);
    await fitDone(page);
  });

  test("the labels do not overlap at zoom 11, 13, 15 and 17 at Aldwych / Drury Lane, Stop S", async ({ page }) => {
    // The sections after the stop end in 11 groups (250 m on the ground).
    const groups = await page.locator(".term").count();
    expect(groups).toBeGreaterThan(5);
    for (const z of [11, 13, 15, 17]) {
      await zoomTo(page, z);
      const b = await boxes(page);
      expect(b.labels.length + b.bubbles, `zoom ${z}`).toBe(groups);
      expect(b.labels.length, `zoom ${z}`).toBeGreaterThan(0);
      for (let i = 0; i < b.labels.length; i++) {
        for (let j = i + 1; j < b.labels.length; j++) expect(overlap(b.labels[i]!, b.labels[j]!), `zoom ${z}: labels ${i}, ${j}`).toBe(false);
        for (const p of b.pins) expect(overlap(b.labels[i]!, p), `zoom ${z}: label ${i} and a pin`).toBe(false);
      }
    }
  });

  test("the badges of a label at each zoom (app_design 5.4)", async ({ page }) => {
    const shown = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".term")].map((t) => ({
          xs: t.classList.contains("xs"),
          badges: t.querySelectorAll(".term-in > .badge").length,
          all: t.querySelectorAll(".term-in .badge").length,
          count: t.querySelector(".count")?.textContent ?? null,
        })),
      );
    for (const [z, max, xs] of [[11, 1, true], [13, 2, false], [15, 4, false]] as const) {
      await zoomTo(page, z);
      for (const l of await shown()) {
        expect(l.xs, `zoom ${z}`).toBe(xs);
        expect(l.badges, `zoom ${z}`).toBe(Math.min(max, l.all));
        expect(l.count, `zoom ${z}`).toBe(l.all > max ? `+${l.all - max}` : null);
      }
    }
  });

  test("a bubble opens when one of its routes is highlighted", async ({ page }) => {
    await zoomTo(page, 11); // at Stop S, the zoom with bubbles
    // A bubble, one of its routes, and the list row of that route in one of its directions.
    const pick = await page.evaluate(() => {
      const t = [...document.querySelectorAll<HTMLElement>(".term.is-collapsed")].find((t) => t.querySelector(".badge"))!;
      const b = t.querySelector<HTMLElement>(".badge")!;
      t.dataset.test = "bubble";
      return { line: b.dataset.line!, dir: b.dataset.dirs!.split(" ")[0]! };
    });
    const bubble = page.locator('.term[data-test="bubble"]');
    await expect(bubble.locator(".term-in")).toBeHidden();
    await expect(bubble.locator(".term-mini")).toBeVisible();
    await page.locator(`.list.services .row[data-line="${pick.line}"][data-dir="${pick.dir}"]`).hover();
    await expect(bubble).toHaveClass(/is-open/);
    await expect(bubble).not.toHaveClass(/is-passive/); // from a list row: its badges operate
    await expect(bubble.locator(".term-in")).toBeVisible();
    await expect(bubble.locator(".term-mini")).toBeHidden();
    // The badges of the other routes are dimmed.
    await expect(bubble.locator(`.badge[data-line="${pick.line}"]`).first()).not.toHaveClass(/is-dim/);
    // Out of the list: the bubble closes.
    await page.locator(".scroll .head h1").hover();
    await expect(bubble).not.toHaveClass(/is-open/);
    await expect(bubble.locator(".term-in")).toBeHidden();
  });

  test("the pointer on a line opens the labels of its routes, and they take no pointer events", async ({ page }) => {
    await zoomTo(page, 12); // below STOP_ZOOM: no station dot is on the end of a line
    // The end of a section: the dot of a label. The pointer there is on the line.
    const at = await page.evaluate(() => {
      const panel = document.querySelector(".panel")!.getBoundingClientRect();
      const d = [...document.querySelectorAll(".term-dot")].map((e) => e.getBoundingClientRect()).find((r) => r.left > panel.right + 10 && r.right < innerWidth - 60 && r.top > 10 && r.bottom < innerHeight - 60)!;
      return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
    });
    await page.mouse.move(at.x, at.y);
    await expect(page.locator(".term.is-open")).not.toHaveCount(0);
    await expect(page.locator(".term.is-open:not(.is-passive)")).toHaveCount(0);
  });

  test("the pointer on a badge highlights its route; a click opens it from the stop", async ({ page }) => {
    await zoomTo(page, 13);
    // A badge in the free area, of a label with no "+n" (the pointer on a label with "+n" opens it, and
    // its badges move).
    await page.evaluate(() => {
      const panel = document.querySelector(".panel")!.getBoundingClientRect();
      const b = [...document.querySelectorAll<HTMLElement>(".term:not(.is-collapsed):not(:has(.count)) .term-in > .badge")].find((e) => {
        const r = e.getBoundingClientRect();
        return r.left > panel.right + 10 && r.right < innerWidth - 60 && r.top > 10 && r.bottom < innerHeight - 60;
      })!;
      b.dataset.test = "badge";
    });
    const badge = page.locator('.badge[data-test="badge"]');
    const line = (await badge.getAttribute("data-line"))!;
    const dir = (await badge.getAttribute("data-dirs"))!.split(" ")[0]!;
    await badge.hover();
    expect(JSON.stringify(await page.evaluate(() => window.__map!.getFilter("highlight")))).toContain(`["literal",["${line}"]]`);
    await expect(page.locator(".tip")).toBeHidden(); // no route tooltip for the line under the label
    await badge.click();
    await expect(page).toHaveURL(new RegExp(`#/stop/${ALDWYCH_S}/line/${line}/${dir}$`));
  });
});

test.describe("station names (app_design 5.4)", () => {
  test("from zoom 16, for the served stations in view; not for the selected station", async ({ page }) => {
    test.slow(); // three zooms, each with the basemap tiles (the names come from the rendered dots)
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    await fitDone(page);
    // A served station (a red ring) at zoom 15, then the zooms 15.9 and 16 at it.
    await zoomTo(page, 15);
    const at = await page.evaluate(() => {
      const m = window.__map!;
      const ring = JSON.stringify(m.getPaintProperty("station-dots", "circle-stroke-color"));
      const f = m.queryRenderedFeatures({ layers: ["station-dots"] }).find((f) => ring.includes(`"${f.properties.k}"`))!;
      return (f.geometry as GeoJSON.Point).coordinates as [number, number];
    });
    for (const z of [15.9, 16]) {
      await page.evaluate(([c, z]) => window.__map!.jumpTo({ center: c, zoom: z }), [at, z] as const);
      await page.waitForFunction(() => window.__settled!(), null, { polling: 50 });
      await page.waitForTimeout(50);
      if (z < 16) await expect(page.locator(".st-label")).toHaveCount(0);
    }
    const names = await page.locator(".st-label").allTextContents();
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain("Aldwych / Drury Lane");
    // Each name is of a station with a red ring.
    const ring = JSON.stringify(await page.evaluate(() => window.__map!.getPaintProperty("station-dots", "circle-stroke-color")));
    const keys = await page.evaluate(() => {
      const m = window.__map!;
      return m.queryRenderedFeatures({ layers: ["station-dots"] }).map((f) => f.properties.k as string);
    });
    const served = keys.filter((k) => ring.includes(`"${k}"`));
    expect(names.length).toBe(new Set(served).size);
  });
});
