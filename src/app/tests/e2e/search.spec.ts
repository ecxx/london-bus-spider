// prod_design 9, step 12: the search of app_design 6.6. The keys Up, Down, Enter and Esc.
import { expect, test, type Page } from "@playwright/test";
import { PHONE, afterFold, h1, hash, open, panelSettled } from "./helpers";

const field = (page: Page) => page.locator("#q");
const options = (page: Page) => page.locator(".results [role=option]");
const selected = (page: Page) => page.locator(".results [role=option][aria-selected=true]");

async function type(page: Page, text: string): Promise<void> {
  await field(page).click();
  await field(page).fill(text);
}

test.describe("search (app_design 6.6)", () => {
  test("the results: routes, then stations with the matched text, and the stops and routes", async ({ page }) => {
    await open(page, "#/");
    await type(page, "155");
    await expect(options(page)).toHaveCount(2);
    await expect(options(page).nth(0)).toContainText("Route 155");
    await expect(options(page).nth(1)).toContainText("Route N155");

    await type(page, "oxford circus");
    const oc = page.locator(".results [data-station=ICS1000173]");
    await expect(oc.locator("mark")).toHaveText("Oxford Circus");
    await expect(oc.locator(".row-sub")).toHaveText("Stops OH, RC, RG · 15 routes");

    await type(page, "zzzzqqq");
    await expect(page.locator(".results .empty")).toHaveText("No routes or stations match “zzzzqqq”.");
    await expect(options(page)).toHaveCount(0);
  });

  test("Down and Up move the selection, and the field keeps the focus", async ({ page }) => {
    await open(page, "#/");
    await type(page, "155");
    await expect(selected(page)).toHaveCount(1);
    await expect(selected(page)).toContainText("Route 155");
    const id0 = await selected(page).getAttribute("id");
    await expect(field(page)).toHaveAttribute("aria-activedescendant", id0!);

    await page.keyboard.press("ArrowDown");
    await expect(selected(page)).toContainText("Route N155");
    await expect(field(page)).toHaveAttribute("aria-activedescendant", (await selected(page).getAttribute("id"))!);
    await expect(field(page)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp"); // from the first result to the last
    await expect(selected(page)).toHaveAttribute("id", (await options(page).last().getAttribute("id"))!);
    await page.keyboard.press("ArrowDown"); // from the last to the first
    await expect(selected(page)).toContainText("Route 155");

    // A new text selects the first result.
    await type(page, "oxford");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(selected(page)).toHaveAttribute("data-station", "490G00015204");
    await page.keyboard.type(" c");
    await expect(selected(page)).toHaveAttribute("data-station", "ICS1000173");
    await expect(selected(page)).toHaveAttribute("id", (await options(page).first().getAttribute("id"))!);
  });

  test("the selected result stays in view", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await open(page, "#/");
    await type(page, "s"); // 8 routes and 20 stations
    await expect(options(page)).toHaveCount(28);
    for (let i = 0; i < 27; i++) await page.keyboard.press("ArrowDown");
    await expect(options(page).last()).toHaveAttribute("aria-selected", "true");
    await expect(options(page).last()).toBeInViewport();
  });

  test("Enter opens the selected route, and clears the field", async ({ page }) => {
    await open(page, "#/");
    await type(page, "189");
    await expect(selected(page)).toContainText("Route 189");
    await page.keyboard.press("Enter");
    await expect.poll(() => hash(page)).toBe("#/line/189");
    await expect(h1(page)).toHaveText("Brent Cross Shopping Centre – Marble Arch Station");
    await expect(field(page)).toHaveValue("");
    await expect(field(page)).not.toBeFocused();
    await expect(options(page)).toHaveCount(0);
  });

  test("Enter opens the selected station, also a station with one stop", async ({ page }) => {
    await open(page, "#/");
    await type(page, "oxford circus");
    await expect(selected(page)).toHaveAttribute("data-station", "ICS1000173");
    await page.keyboard.press("Enter");
    await expect.poll(() => hash(page)).toBe("#/station/ICS1000173");
    await expect(h1(page)).toHaveText("Oxford Circus Station");

    await type(page, "oxford circus");
    await page.keyboard.press("ArrowDown");
    await expect(selected(page)).toHaveAttribute("data-station", "490G00015204"); // one stop
    await page.keyboard.press("Enter");
    await expect.poll(() => hash(page)).toBe("#/station/490G00015204");
    await expect(h1(page)).toHaveText("Oxford Circus Station / John Lewis");
  });

  test("a click opens the result", async ({ page }) => {
    await open(page, "#/line/189");
    await type(page, "oxford circus");
    await page.locator(".results [data-station=ICS1000173]").click();
    await expect.poll(() => hash(page)).toBe("#/station/ICS1000173");
    await expect(h1(page)).toHaveText("Oxford Circus Station");
    await expect(field(page)).toHaveValue("");
  });

  test("Enter with no results does nothing", async ({ page }) => {
    await open(page, "#/station/ICS1001038");
    await type(page, "zzzzqqq");
    await page.keyboard.press("Enter");
    await expect(field(page)).toHaveValue("zzzzqqq");
    expect(await hash(page)).toBe("#/station/ICS1001038");
  });

  test("Esc clears the field and the results, and does not go up", async ({ page }) => {
    await open(page, "#/station/ICS1001038");
    await type(page, "oxford");
    await expect(options(page).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(field(page)).toHaveValue("");
    await expect(options(page)).toHaveCount(0);
    await expect(page.locator(".results")).toBeHidden();
    expect(await hash(page)).toBe("#/station/ICS1001038");
  });

  test("a station result shows the hover ring on the map", async ({ page }) => {
    await open(page, "#/");
    await type(page, "oxford circus");
    await page.locator(".results [data-station=ICS1000173]").hover();
    const ring = () =>
      page.evaluate(() => JSON.stringify((window.__map?.getSource("hover")?.serialize().data as GeoJSON.Feature<GeoJSON.Point> | undefined)?.geometry?.coordinates));
    const station = await page.evaluate(async () => {
      const m = await (await fetch("/data/manifest.json")).json();
      const s = (await (await fetch(`/data/${m.files.stations}`)).json()).ICS1000173 as [string, number, number];
      return JSON.stringify([s[2], s[1]]);
    });
    await expect.poll(ring).toBe(station);
  });

  test("the folded panel shows the results, and a result opens its view in the folded panel", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, "#/");
    await page.getByRole("button", { name: "Hide the list" }).click();
    await afterFold(page);
    await type(page, "oxford circus");
    await expect(page.locator(".results [data-station=ICS1000173]")).toBeInViewport();
    await panelSettled(page);
    await page.keyboard.press("Enter");
    await expect.poll(() => hash(page)).toMatch(/^#\/station\//);
    await expect(page.locator(".peek .head h1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Show the list" })).toBeVisible();
  });
});
