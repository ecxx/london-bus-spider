// prod_design 9, step 16: the data format check and the load errors of prod_design 4.1.
import { expect, test } from "@playwright/test";

const status = (page: import("@playwright/test").Page) => page.locator(".scroll .loading[role=status]");

test.describe("the data format check (prod_design 4.1)", () => {
  test("a manifest with a different format: the message, and no other data request", async ({ page }) => {
    const data: string[] = [];
    page.on("request", (r) => {
      const p = new URL(r.url()).pathname;
      if (p.startsWith("/data/")) data.push(p);
    });
    await page.route("**/data/manifest.json", async (route) => {
      const res = await route.fetch();
      const m = await res.json();
      await route.fulfill({ response: res, json: { ...m, format: m.format + 1 } });
    });
    await page.goto("/#/station/ICS1001038");
    await expect(status(page)).toHaveText("A new version is available. Reload the page.");
    await expect(page.locator(".scroll .head h1")).toHaveCount(0);
    expect(data).toEqual(["/data/manifest.json"]);
  });

  test("a manifest with the correct format: the view opens", async ({ page }) => {
    await page.goto("/#/station/ICS1001038");
    await expect(page.locator(".scroll .head h1")).toHaveText("Brondesbury Station", { timeout: 15_000 });
    await expect(status(page)).toHaveCount(0);
  });

  test("a data file that does not load: the reload message", async ({ page }) => {
    await page.route(/\/data\/stops\..*\.json$/, (route) => route.fulfill({ status: 404 }));
    await page.goto("/#/");
    await expect(status(page)).toHaveText("The bus data did not load. Reload the page.");
  });
});
