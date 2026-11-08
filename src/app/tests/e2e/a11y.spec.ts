// prod_design 9, step 14: accessibility. An axe scan of each view, the focus and the folded panel,
// "reduce motion" and the keyboard tasks of the views.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PHONE, WIDE, afterFold, fitDone, h1, hash, mapReady, open, panelSettled } from "./helpers";

const ALDWYCH = "490G00019703";
const BRONDESBURY = "ICS1001038";
const STOP = "490001038N"; // a stop of Brondesbury Station

// No serious or critical problem in the page as it is now.
async function scan(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}: ${n.any[0]?.message ?? ""}`));
  expect(bad).toEqual([]);
}

test.describe("axe scan", () => {
  const VIEWS: [string, string, boolean][] = [
    ["home", "#/", false],
    ["station", `#/station/${ALDWYCH}`, true],
    ["stop", `#/stop/${STOP}`, true],
    ["route", `#/station/${BRONDESBURY}/line/189`, true],
    ["about", "#/about", false],
  ];
  for (const scheme of ["light", "dark"] as const) {
    for (const [sizeName, size] of [["wide", WIDE], ["phone", PHONE]] as const) {
      for (const [name, url, fits] of VIEWS) {
        test(`${scheme}, ${sizeName}: ${name}`, async ({ page }) => {
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize(size);
          await open(page, url);
          await mapReady(page, true);
          await panelSettled(page);
          if (fits) await fitDone(page);
          await scan(page);
        });
      }
    }

    test(`${scheme}: the station list`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, "#/");
      await page.getByRole("tab", { name: /^Stations/ }).click();
      await expect(page.locator(".vitem.row").first()).toBeVisible();
      await scan(page);
    });

    test(`${scheme}: the search results`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, "#/");
      await page.locator("#q").fill("oxford");
      await expect(page.locator(".results .row").first()).toBeVisible();
      await scan(page);
    });

    test(`${scheme}: the folded panel`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, `#/station/${ALDWYCH}`);
      await page.locator(".fold").click();
      await afterFold(page);
      await scan(page);
    });

    test(`${scheme}: the route menu`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(WIDE);
      await open(page, `#/station/${ALDWYCH}`);
      await mapReady(page, true);
      await fitDone(page);
      // A point on the lines with two or more routes, in the free area, with no marker above the canvas.
      const at = await page.evaluate(() => {
        const m = window.__map!;
        const canvas = m.getCanvas();
        const fc = m.getSource("view")!.serialize().data as GeoJSON.FeatureCollection<GeoJSON.LineString>;
        for (const f of fc.features) {
          if (f.properties!.part !== "after") continue;
          for (const c of f.geometry.coordinates) {
            const p = m.project(c as [number, number]);
            if (p.x < 450 || p.x > innerWidth - 20 || p.y < 20 || p.y > innerHeight - 20) continue;
            if (document.elementFromPoint(p.x, p.y) !== canvas) continue;
            const hits = m.queryRenderedFeatures([[p.x - 3, p.y - 3], [p.x + 3, p.y + 3]], { layers: ["spider-after"] });
            if (new Set(hits.map((h) => h.properties.line)).size >= 2) return { x: p.x, y: p.y };
          }
        }
        return null;
      });
      expect(at).not.toBeNull();
      await page.mouse.click(at!.x, at!.y);
      await expect(page.locator(".pick")).toBeVisible();
      await scan(page);
    });
  }
});

// Press Tab until the element with the focus matches the selector.
async function tabTo(page: Page, selector: string, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((s) => !!document.activeElement?.matches(s), selector)) return;
  }
  throw new Error(`The Tab key did not get to ${selector}`);
}

const focusIn = (page: Page, selector: string) => page.evaluate((s) => !!document.activeElement?.closest(s), selector);

test.describe("the folded panel (app_design 4.2)", () => {
  test("the Tab key does not go into the hidden content", async ({ page }) => {
    await open(page, `#/station/${ALDWYCH}`);
    await page.locator(".fold").click();
    await afterFold(page);
    await expect(page.locator("#panel-content")).toHaveAttribute("inert", "");
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await focusIn(page, "#panel-content")).toBe(false);
    }
  });

  test("a fold takes the focus out of the content", async ({ page }) => {
    await open(page, `#/station/${ALDWYCH}`);
    await page.locator(".list.services .row").first().focus();
    expect(await focusIn(page, "#panel-content")).toBe(true);
    await page.locator(".fold").click();
    await afterFold(page);
    expect(await focusIn(page, "#panel-content")).toBe(false);
    await page.locator(".fold").click();
    await afterFold(page);
    await expect(page.locator("#panel-content")).not.toHaveAttribute("inert", "");
  });
});

test.describe('"reduce motion" (app_design 4.2)', () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("phone: the panel and the map change at once", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, `#/station/${BRONDESBURY}`);
    await mapReady(page, true);
    await panelSettled(page);
    await fitDone(page);
    const center = await page.evaluate(() => window.__map!.getCenter().toArray() as [number, number]);
    const r = await page.evaluate(
      (c) =>
        new Promise<{ panelH: number; setH: number; panelY: number; y: number; transition: string }>((done) => {
          document.querySelector<HTMLElement>(".fold")!.click();
          // Two frames: the render of the fold, then one frame.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const p = document.querySelector<HTMLElement>(".panel")!;
              const b = p.getBoundingClientRect();
              done({ panelH: b.height, setH: parseFloat(p.style.height), panelY: b.y, y: window.__map!.project(c).y, transition: getComputedStyle(p).transitionDuration });
            }),
          );
        }),
      center,
    );
    expect(r.transition).toBe("0s");
    expect(Math.abs(r.panelH - r.setH)).toBeLessThan(1);
    expect(Math.abs(r.y - r.panelY / 2)).toBeLessThan(1);
  });

  test("a fit has no animation", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await mapReady(page, true);
    const zooms = await page.evaluate(
      (u) =>
        new Promise<number[]>((done) => {
          const zs: number[] = [];
          const t0 = performance.now();
          location.hash = u;
          const step = () => {
            zs.push(Math.round(window.__map!.getZoom() * 1000));
            if (performance.now() - t0 < 1000) requestAnimationFrame(step);
            else done(zs);
          };
          step();
        }),
      `#/station/${ALDWYCH}`,
    );
    expect(new Set(zooms).size).toBeLessThanOrEqual(2); // the zoom before the fit, and the zoom of the fit
  });

  test("the selected pin has no pulse", async ({ page }) => {
    await open(page, `#/stop/${STOP}`);
    await mapReady(page, true);
    await expect(page.locator(".pin.sel")).toBeVisible();
    expect(await page.locator(".pin.sel .roundel").evaluate((e) => getComputedStyle(e, "::after").animationName)).toBe("none");
  });
});

test.describe("keyboard (app_design 4.3)", () => {
  // Safari and WebKit do not put links in the Tab order by default. Thus the tests with the Tab key are for Chromium.
  const NO_TAB = "WebKit: the Tab key skips links";

  test("home -> the station list -> a station -> a route -> a stop, and back with Esc", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", NO_TAB);
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await tabTo(page, "#tab-stations");
    await page.keyboard.press("Enter");
    await expect(page.locator("#tab-stations")).toHaveAttribute("aria-selected", "true");

    await tabTo(page, ".vitem.row");
    await page.keyboard.press("Enter");
    await expect(h1(page)).toBeVisible();
    await expect(h1(page)).toBeFocused(); // the focus is in the new view
    expect(await hash(page)).toMatch(/^#\/station\//);

    await page.keyboard.press("Tab");
    await expect(page.locator(".scroll .close")).toBeFocused();

    await tabTo(page, ".list.services .row");
    await page.keyboard.press("Enter");
    await expect(page.locator(".tl")).toBeVisible();
    await expect(h1(page)).toBeFocused();
    expect(await hash(page)).toMatch(/\/line\//);

    await tabTo(page, ".tl .row");
    await page.keyboard.press("Enter");
    expect(await hash(page)).toMatch(/^#\/stop\//);
    await expect(h1(page)).toBeFocused();

    await page.keyboard.press("Escape");
    await expect.poll(() => hash(page)).toMatch(/^#\/station\//);
    await page.keyboard.press("Escape");
    await expect.poll(() => hash(page)).toBe("#/");
  });

  test("the filter, the stop chips, the direction tabs and the variants", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", NO_TAB);
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${ALDWYCH}`);
    await tabTo(page, ".chip.stop");
    await page.keyboard.press("Enter");
    await expect.poll(() => hash(page)).toMatch(/^#\/stop\//);
    await expect(page.locator('.chip.stop[aria-current="true"]')).toBeFocused(); // the same control

    await tabTo(page, "button.chip:nth-child(3)"); // Night
    await page.keyboard.press("Space");
    await expect(page.locator("button.chip").nth(2)).toHaveAttribute("aria-pressed", "true");

    await open(page, "#/line/189");
    await tabTo(page, 'a.tab:not([aria-current="true"])');
    const before = await hash(page);
    await page.keyboard.press("Enter");
    await expect.poll(() => hash(page)).not.toBe(before);
    await expect(page.locator('a.tab[aria-current="true"]')).toBeFocused(); // the same control

    await open(page, "#/line/189/outbound");
    await tabTo(page, 'a.variant:not([aria-current="true"])');
    await page.keyboard.press("Enter");
    await expect.poll(() => hash(page)).toMatch(/\/outbound\/2$/);
  });

  test("the search, with the keys only", async ({ page }) => {
    await open(page, "#/");
    await page.keyboard.press("/");
    await expect(page.locator("#q")).toBeFocused();
    await page.keyboard.type("189");
    await expect(page.locator(".results .row").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect.poll(() => hash(page)).toMatch(/^#\/line\/189/);
    await expect(h1(page)).toBeFocused();
  });

  test("the fold button", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${ALDWYCH}`);
    await page.locator(".fold").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".fold")).toHaveAttribute("aria-expanded", "false");
    await afterFold(page);
    await page.keyboard.press("Space");
    await expect(page.locator(".fold")).toHaveAttribute("aria-expanded", "true");
  });

  test("the Tab key moves through more rows of the station list than the rows drawn at the start", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", NO_TAB);
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await page.getByRole("tab", { name: /^Stations/ }).click();
    await expect(page.locator(".vitem.row").first()).toBeVisible();
    await tabTo(page, ".vitem.row");
    const tops: number[] = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(20); // the frame of the list window
      const t = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        return a.matches(".vitem.row") ? parseFloat(a.style.top) : -1;
      });
      tops.push(t);
    }
    expect(tops).not.toContain(-1);
    for (let i = 1; i < tops.length; i++) expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
  });

  test("the map: the arrow keys and the + key, with a visible focus", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", NO_TAB);
    await page.setViewportSize(WIDE);
    await open(page, "#/about"); // a short panel: the map is after the panel in the Tab order
    await mapReady(page);
    await tabTo(page, "canvas.maplibregl-canvas");
    const outline = await page.evaluate(() => {
      const c = getComputedStyle(document.activeElement!);
      return { style: c.outlineStyle, width: parseFloat(c.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThan(0);
    const before = await page.evaluate(() => ({ lng: window.__map!.getCenter().lng, zoom: window.__map!.getZoom() }));
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => window.__map!.getCenter().lng)).toBeGreaterThan(before.lng);
    await page.keyboard.press("Equal");
    await expect.poll(() => page.evaluate(() => window.__map!.getZoom())).toBeGreaterThan(before.zoom);
  });

  test("phone: the attribution button and its close button", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, "#/");
    await mapReady(page);
    const i = page.getByRole("button", { name: "Map data sources" });
    await expect(i).toBeVisible({ timeout: 7_000 });
    await i.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".attrib-full")).toBeVisible();
    const close = page.locator(".attrib").getByRole("button", { name: "Close" });
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".attrib-full")).toBeHidden();
  });
});
