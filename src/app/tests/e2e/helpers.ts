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

// Wait for the map, its style and (optional) the home lines.
export async function mapReady(page: Page, homeLines = false): Promise<void> {
  await page.waitForFunction(
    (home) => {
      const m = window.__map;
      return !!m && m.isStyleLoaded() !== undefined && (!home || !!m.getLayer("home-lines"));
    },
    homeLines,
    { timeout: 30_000 },
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
