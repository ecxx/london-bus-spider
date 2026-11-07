// prod_design 9, step 5: the views of app_design 4.3 as text, the keys, the back button and the fold.
import { expect, test } from "@playwright/test";
import { PHONE, afterFold, h1, hash, open, panelSettled } from "./helpers";

test.describe("each URL of app_design 4.3 opens its view", () => {
  test("home", async ({ page }) => {
    await open(page, "#/");
    await expect(page.getByRole("tab", { name: "Routes 675" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Stations 11,571" })).toHaveAttribute("aria-selected", "false");
    await expect(page).toHaveTitle("Bus Router London");
  });

  test("station", async ({ page }) => {
    await open(page, "#/station/ICS1001038");
    await expect(h1(page)).toHaveText("Brondesbury Station");
    await expect(page).toHaveTitle("Brondesbury Station · Bus Router London");
  });

  test("stop", async ({ page }) => {
    await open(page, "#/stop/490001038D");
    await expect(h1(page)).toHaveText("Brondesbury Station");
    await expect(page.locator(".scroll .head p")).toHaveText("Stop D · Brondesbury Station");
    await page.locator(".scroll .head p a").click();
    await expect.poll(() => hash(page)).toBe("#/station/ICS1001038");
  });

  test("route, direction and pattern", async ({ page }) => {
    await open(page, "#/line/189");
    await expect(h1(page)).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
    await expect(page.locator(".scroll .head p")).toHaveText("24 Hours · 37 stops");
    await expect(page.locator(".scroll .head .badge")).toHaveText("189");
    await open(page, "#/line/189/outbound/2");
    await expect(h1(page)).toHaveText("Cricklewood Broadway / the Crown – Marble Arch Station");
    await expect(page.locator(".scroll .head p")).toHaveText("Limited service · 26 stops");
    await open(page, "#/line/189/inbound");
    await expect(h1(page)).toHaveText(/– Brent Cross Shopping Centre$/);
  });

  test("route from a station and from a stop", async ({ page }) => {
    await open(page, "#/station/ICS1001038/line/189");
    await expect(h1(page)).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
    await open(page, "#/stop/490001038N/line/189/inbound");
    await expect(h1(page)).toHaveText(/– Brent Cross Shopping Centre$/);
  });

  test("about", async ({ page }) => {
    await open(page, "#/about");
    await expect(h1(page)).toHaveText("About");
    const about = page.locator(".about");
    await expect(about).toContainText("Bus Router shows the London bus routes that go through a stop or a station.");
    await expect(about).toContainText("Bus Router is not an official TfL product. TfL does not endorse it.");
    await expect(about).toContainText("Powered by TfL Open Data");
    await expect(about.getByRole("link", { name: "TfL Transport Data Service terms" })).toHaveAttribute(
      "href",
      "https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service",
    );
    await expect(about).toContainText("Bus data of 13 October 2026");
    await page.getByRole("link", { name: "About", exact: true }).click(); // the link of the brand row
    await expect(h1(page)).toHaveText("About");
  });

  test("D12: a key that is not in the data opens the home view and replaces the history entry", async ({ page }) => {
    await open(page, "#/station/ICS1001038");
    await page.evaluate(() => (location.hash = "#/station/NOPE"));
    await expect(page.getByRole("tab", { name: "Routes 675" })).toBeVisible();
    expect(await hash(page)).toBe("#/");
    await page.goBack();
    await expect(h1(page)).toHaveText("Brondesbury Station");
    await page.evaluate(() => (location.hash = "#/stop/490001038D/line/NOPE"));
    await expect.poll(() => hash(page)).toBe("#/stop/490001038D");
  });
});

test.describe("keys and history (app_design 4.3)", () => {
  test("Esc goes up one level: route -> stop -> station -> home", async ({ page }) => {
    await open(page, "#/stop/490001038D/line/189");
    await page.keyboard.press("Escape");
    await expect.poll(() => hash(page)).toBe("#/stop/490001038D");
    await page.keyboard.press("Escape");
    await expect.poll(() => hash(page)).toBe("#/station/ICS1001038");
    await page.keyboard.press("Escape");
    await expect.poll(() => hash(page)).toBe("#/");
    await expect(page.getByRole("tab", { name: "Routes 675" })).toBeVisible();
  });

  test("the close button goes up one level", async ({ page }) => {
    await open(page, "#/about");
    await page.locator(".scroll").getByRole("button", { name: "Close" }).click();
    await expect.poll(() => hash(page)).toBe("#/");
  });

  test("/ puts the cursor in the search field, and Esc clears the field", async ({ page }) => {
    await open(page, "#/station/ICS1001038");
    await page.keyboard.press("/");
    const q = page.locator("#q");
    await expect(q).toBeFocused();
    await page.keyboard.type("oxford");
    await expect(q).toHaveValue("oxford");
    await page.keyboard.press("Escape");
    await expect(q).toHaveValue("");
    await expect(q).not.toBeFocused();
    expect(await hash(page)).toBe("#/station/ICS1001038"); // Esc in the field does not go up
  });

  test("the back button follows the history", async ({ page }) => {
    await open(page, "#/");
    await page.evaluate(() => (location.hash = "#/line/189"));
    await expect(h1(page)).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
    await page.evaluate(() => (location.hash = "#/stop/490001038D"));
    await expect(h1(page)).toHaveText("Brondesbury Station");
    await page.goBack();
    await expect(h1(page)).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
    await page.goBack();
    await expect(page.getByRole("tab", { name: "Routes 675" })).toBeVisible();
    await page.goForward();
    await expect(h1(page)).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
  });
});

test.describe("fold on a wide screen (app_design 4.2)", () => {
  test("the button folds and opens the panel", async ({ page }) => {
    await open(page, "#/stop/490001038D");
    const panel = page.locator(".panel");
    const fold = page.getByRole("button", { name: "Hide the list" });
    const open0 = (await panel.boundingBox())!.height;
    await fold.click();
    await afterFold(page);
    const btn = page.getByRole("button", { name: "Show the list" });
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    // The folded panel: the top part and a copy of the header.
    await expect(page.locator(".peek h1")).toHaveText("Brondesbury Station");
    const top = (await page.locator(".top").boundingBox())!.height;
    const peek = (await page.locator(".peek").boundingBox())!.height;
    expect((await panel.boundingBox())!.height).toBeCloseTo(top + peek, 0);
    expect(await page.locator("#panel-content").evaluate((e) => (e as HTMLElement).inert)).toBe(true);
    // A different view: the panel stays folded, with the new header.
    await page.evaluate(() => (location.hash = "#/line/189"));
    await expect(page.locator(".peek h1")).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
    // A click on the copy, not on a button or a link, opens the panel.
    await page.locator(".peek h1").click();
    await afterFold(page);
    await expect(page.getByRole("button", { name: "Hide the list" })).toHaveAttribute("aria-expanded", "true");
    expect((await panel.boundingBox())!.height).toBeCloseTo(open0, 0);
    await expect(page.locator(".peek")).toBeEmpty();
  });

  test("the buttons of the copy of the header operate as in the panel", async ({ page }) => {
    await open(page, "#/stop/490001038D");
    await page.getByRole("button", { name: "Hide the list" }).click();
    await afterFold(page);
    await page.locator(".peek").getByRole("button", { name: "Close" }).click();
    await expect.poll(() => hash(page)).toBe("#/station/ICS1001038");
    await expect(page.getByRole("button", { name: "Show the list" })).toBeVisible();
  });

  test("the home view folds to the top part", async ({ page }) => {
    await open(page, "#/");
    await page.getByRole("button", { name: "Hide the list" }).click();
    await afterFold(page);
    const top = (await page.locator(".top").boundingBox())!.height;
    expect((await page.locator(".panel").boundingBox())!.height).toBeCloseTo(top, 0);
  });
});

test.describe("fold on a phone (app_design 4.2)", () => {
  test.use({ viewport: PHONE });

  test("the handle: a tap, a swipe up and a swipe down", async ({ page }) => {
    await open(page, "#/about");
    await panelSettled(page);
    const panel = page.locator(".panel");
    const handle = page.locator(".fold");
    const h0 = (await panel.boundingBox())!.height;
    expect(h0).toBeLessThanOrEqual(PHONE.height * 0.58 + 1);
    await handle.click();
    await afterFold(page);
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".peek h1")).toHaveText("About");
    const folded = (await panel.boundingBox())!.height;
    expect(folded).toBeLessThan(h0);
    expect(Math.abs((await panel.boundingBox())!.y + folded - PHONE.height)).toBeLessThanOrEqual(1); // a bottom sheet

    const swipe = async (dy: number) => {
      const b = (await handle.boundingBox())!;
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + dy / 2);
      await page.mouse.move(x, y + dy);
      await page.mouse.up();
      await afterFold(page);
    };
    await swipe(-60); // up: opens
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    expect(Math.abs((await panel.boundingBox())!.height - h0)).toBeLessThanOrEqual(1);
    await swipe(60); // down: folds
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await swipe(10); // 24 px or less: a tap, not a swipe
    await expect(handle).toHaveAttribute("aria-expanded", "true");
  });

  test("the sheet of the home view is 46% of the window at most", async ({ page }) => {
    await open(page, "#/");
    await panelSettled(page);
    // The home lists are taller than the maximum. The height is in whole px.
    expect(Math.abs((await page.locator(".panel").boundingBox())!.height - PHONE.height * 0.46)).toBeLessThanOrEqual(1);
    await expect(page.locator(".brand-name")).toBeHidden();
  });
});
