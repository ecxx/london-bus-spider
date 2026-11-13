import { expect, type Page } from "@playwright/test";

export const PHONE = { width: 390, height: 844 };
export const WIDE = { width: 1280, height: 800 };

// Open a URL and wait for the view (the home tabs or a header).
export async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`);
  await expect(page.locator(".scroll .tabs, .scroll .head h1").first()).toBeVisible({ timeout: 15_000 });
}

export const h1 = (page: Page) => page.locator(".scroll .head h1");
export const hash = (page: Page) => page.evaluate(() => location.hash);

// The predicates of waitForFunction read the source data with serialize(), not with getData():
// waitForFunction does not wait for a Promise (an async predicate is true at once).
type Fc = { features: unknown[] };

// Wait for the map, its style and (optional) the home lines. The client adds its layers with empty
// sources at "style.load", and sets the data when it is loaded. The home lines go to the source in groups
// (prod_design 5.3): wait for the last group (the mark "homeSet" of src/perf.ts).
export async function mapReady(page: Page, homeLines = false): Promise<void> {
  await page.waitForFunction(
    (home) => {
      const m = window.__map;
      if (!m || m.isStyleLoaded() === undefined) return false;
      return !home || (!!m.getLayer("home-lines") && window.__perf?.report().marks.homeSet !== undefined);
    },
    homeLines,
    { timeout: 30_000, polling: 100 },
  );
}

// Wait for the fit of a view (prod_design 5.7): the view source has data, no fit waits or moves the map,
// and the end labels are placed for the zoom of the fit (the settle of prod_design 5.8).
export async function fitDone(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const m = window.__map;
      const src = m?.getSource("view");
      return !!src && (src.serialize().data as Fc).features.length > 0 && !window.__fitBusy!() && !m!.isMoving() && window.__settled!();
    },
    null,
    { timeout: 30_000, polling: 100 },
  );
}

// The end of the fold animation (FOLD_MS) and some time.
export const afterFold = (page: Page) => page.waitForTimeout(400);

// The panel is at its height: no height transition (a fold, or a change of the content of the sheet).
export const panelSettled = (page: Page) =>
  page.waitForFunction(() => {
    const p = document.querySelector<HTMLElement>(".panel")!;
    return Math.abs(p.getBoundingClientRect().height - parseFloat(p.style.height)) < 0.5;
  });
