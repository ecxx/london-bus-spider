// prod_design 9, step 13: the fit, the mute after a fit, the zoom speed and the map move of the fold
// (prod_design 5.7 and 5.8).
import { expect, test, type Page } from "@playwright/test";
import { PHONE, WIDE, afterFold, fitDone, mapReady, open, panelSettled } from "./helpers";

const ALDWYCH = "490G00019703";
const BRONDESBURY = "ICS1001038";
const OXFORD_CIRCUS = "ICS1000173";

const camera = (page: Page) =>
  page.evaluate(() => {
    const m = window.__map!;
    const c = m.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: m.getZoom() };
  });

function expectSameCamera(a: Awaited<ReturnType<typeof camera>>, b: Awaited<ReturnType<typeof camera>>): void {
  expect(a.zoom).toBeCloseTo(b.zoom, 6);
  expect(a.lng).toBeCloseTo(b.lng, 6);
  expect(a.lat).toBeCloseTo(b.lat, 6);
}

// Wheel events on the map every 16 ms for ms milliseconds, as the tail of a trackpad gesture.
// At openAt, the page opens the URL.
function wheelStream(page: Page, opts: { ms: number; deltaY: number; openAt?: number; url?: string }): Promise<void> {
  return page.evaluate(
    ({ ms, deltaY, openAt, url }) =>
      new Promise<void>((done) => {
        const canvas = window.__map!.getCanvasContainer();
        const t0 = performance.now();
        let opened = false;
        const id = setInterval(() => {
          const t = performance.now() - t0;
          canvas.dispatchEvent(new WheelEvent("wheel", { deltaY, clientX: 800, clientY: 300, bubbles: true, cancelable: true }));
          if (url && !opened && t >= openAt!) {
            opened = true;
            location.hash = url;
          }
          if (t >= ms) {
            clearInterval(id);
            done();
          }
        }, 16);
      }),
    opts,
  );
}

test.describe("mute after a fit (prod_design 5.8)", () => {
  test("the tail of a trackpad gesture does not stop the fit", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    await fitDone(page);
    const target = await camera(page);

    await page.evaluate(() => (location.hash = "#/"));
    await expect(page.locator(".scroll .tabs")).toBeVisible();
    await wheelStream(page, { ms: 1_500, deltaY: 2, openAt: 200, url: `#/station/${ALDWYCH}` });
    await fitDone(page);
    expectSameCamera(await camera(page), target);
  });

  test("after a pause of WHEEL_END_MS, the wheel zooms again", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, `#/station/${ALDWYCH}`);
    await mapReady(page, true);
    await fitDone(page);
    const before = await camera(page);
    await page.waitForTimeout(200);
    // A fixed number of events: a software renderer gives few timer events in a fixed time.
    await page.evaluate(() => {
      const el = window.__map!.getCanvasContainer();
      for (let i = 0; i < 30; i++) el.dispatchEvent(new WheelEvent("wheel", { deltaY: -2, clientX: 800, clientY: 300, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(500); // the frames of the zoom
    await page.waitForFunction(() => !window.__map!.isMoving());
    expect((await camera(page)).zoom).toBeGreaterThan(before.zoom + 0.1);
  });
});

test.describe("zoom speed (prod_design 5.8)", () => {
  // The zoom change of the events. Wait for the move to start, then to end: while the data loads, the
  // move can start more than 500 ms after the event (the 40 ms wheel timeout of MapLibre, then a frame).
  const zoomAfter = async (page: Page, send: () => Promise<void>) => {
    const z0 = (await camera(page)).zoom;
    await page.evaluate(() => {
      const w = window as { __moved?: boolean };
      w.__moved = false;
      window.__map!.once("movestart", () => (w.__moved = true));
    });
    await send();
    await page.waitForFunction(() => !!(window as { __moved?: boolean }).__moved && !window.__map!.isMoving(), null, { timeout: 10_000, polling: 50 });
    await page.waitForTimeout(300); // a later move of the gesture, if any
    await page.waitForFunction(() => !window.__map!.isMoving());
    return (await camera(page)).zoom - z0;
  };

  test("one wheel step of 100 px gives approximately 0.625 zoom levels", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await mapReady(page);
    const dz = await zoomAfter(page, () =>
      page.evaluate(() => {
        window.__map!.getCanvasContainer().dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: 800, clientY: 300, bubbles: true, cancelable: true }));
      }),
    );
    expect(dz).toBeGreaterThan(0.55);
    expect(dz).toBeLessThan(0.7);
  });

  test("a trackpad gesture of 120 px gives approximately 1 zoom level", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await mapReady(page);
    // 2 px steps: small, thus a trackpad in the MapLibre scroll zoom. 60 events.
    const dz = await zoomAfter(page, () =>
      page.evaluate(
        () =>
          new Promise<void>((done) => {
            let n = 0;
            const id = setInterval(() => {
              window.__map!.getCanvasContainer().dispatchEvent(new WheelEvent("wheel", { deltaY: -2, clientX: 800, clientY: 300, bubbles: true, cancelable: true }));
              if (++n === 60) {
                clearInterval(id);
                done();
              }
            }, 16);
          }),
      ),
    );
    expect(dz).toBeGreaterThan(0.85);
    expect(dz).toBeLessThan(1.15);
  });
});

test.describe("the selected stops are in the free area after each fit (app_design 5.7)", () => {
  const VIEWS = [`#/station/${ALDWYCH}`, `#/station/${OXFORD_CIRCUS}`, `#/station/${BRONDESBURY}`, "#/stop/490001038N", `#/station/${BRONDESBURY}/line/189`];

  async function expectPinsInFreeArea(page: Page, freeTop: number, freeBottom: number, freeLeft: number, freeRight: number): Promise<void> {
    const pins = await page.locator(".pin").evaluateAll((els) =>
      els.map((e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }),
    );
    expect(pins.length).toBeGreaterThan(0);
    for (const p of pins) {
      expect(p.x).toBeGreaterThan(freeLeft);
      expect(p.x).toBeLessThan(freeRight);
      expect(p.y).toBeGreaterThan(freeTop);
      expect(p.y).toBeLessThan(freeBottom);
    }
  }

  for (const url of VIEWS) {
    test(`wide: ${url}`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await open(page, url);
      await mapReady(page, true);
      await fitDone(page);
      const panel = (await page.locator(".panel").boundingBox())!;
      await expectPinsInFreeArea(page, 0, WIDE.height, panel.x + panel.width, WIDE.width);
    });

    test(`phone: ${url}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await open(page, url);
      await mapReady(page, true);
      await panelSettled(page);
      await fitDone(page);
      const panel = (await page.locator(".panel").boundingBox())!;
      await expectPinsInFreeArea(page, 0, panel.y, 0, PHONE.width);
    });
  }

  test("phone, folded panel: the fit uses the free area of the folded panel", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, "#/");
    await mapReady(page, true);
    await page.locator(".fold").click();
    await afterFold(page);
    await page.evaluate((u) => (location.hash = u), `#/station/${ALDWYCH}`);
    await fitDone(page);
    await panelSettled(page);
    const panel = (await page.locator(".panel").boundingBox())!;
    await expectPinsInFreeArea(page, 0, panel.y, 0, PHONE.width);
  });
});

test.describe("the map move of the fold (app_design 4.2)", () => {
  // The y of a point in the window, at each frame for ms milliseconds.
  const sampleY = (page: Page, at: { lng: number; lat: number }, ms: number) =>
    page.evaluate(
      ({ at, ms }) =>
        new Promise<number[]>((done) => {
          const ys: number[] = [];
          const t0 = performance.now();
          const step = () => {
            ys.push(window.__map!.project(at).y);
            if (performance.now() - t0 < ms) requestAnimationFrame(step);
            else done(ys);
          };
          requestAnimationFrame(step);
        }),
      { at, ms },
    );

  test("phone: the fold and the open animate the map, and keep the middle of the free area and the zoom", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, `#/station/${BRONDESBURY}`);
    await mapReady(page, true);
    await panelSettled(page);
    await fitDone(page);
    const before = await camera(page);

    for (const name of ["fold", "open"]) {
      const [ys] = await Promise.all([sampleY(page, before, 500), page.locator(".fold").click()]);
      const first = ys[0]!;
      const last = ys.at(-1)!;
      expect(Math.abs(last - first), name).toBeGreaterThan(20);
      const between = new Set(ys.filter((y) => Math.min(first, last) + 1 < y && y < Math.max(first, last) - 1).map((y) => Math.round(y)));
      expect(between.size, `${name}: frames of the map move`).toBeGreaterThanOrEqual(2);
      await afterFold(page);
      await panelSettled(page);
      const panel = (await page.locator(".panel").boundingBox())!;
      const now = await camera(page);
      expect(now.zoom).toBeCloseTo(before.zoom, 6);
      const y = await page.evaluate((c) => window.__map!.project(c).y, before);
      expect(Math.abs(y - panel.y / 2), name).toBeLessThan(1);
    }
  });

  for (const [name, size] of [["wide", WIDE], ["phone", PHONE]] as const) {
    test(`${name}: a fold during a fit does not stop the fit`, async ({ page }) => {
      await page.setViewportSize(size);
      // The target: the fit of the view with the folded panel.
      await open(page, "#/");
      await mapReady(page, true);
      await page.locator(".fold").click();
      await afterFold(page);
      await page.evaluate((u) => (location.hash = u), `#/station/${ALDWYCH}`);
      await fitDone(page);
      await panelSettled(page);
      const target = await camera(page);
      await page.locator(".fold").click();
      await afterFold(page);

      // Go home, open the view and fold during its fit.
      await page.evaluate(() => (location.hash = "#/"));
      await expect(page.locator(".scroll .tabs")).toBeVisible();
      await page.waitForFunction(() => !window.__map!.isMoving());
      await page.evaluate((u) => (location.hash = u), `#/station/${ALDWYCH}`);
      // The click is in the page, in the first frame of the move: a Playwright click can come after the end of the fit.
      await page.evaluate(
        () =>
          new Promise<void>((done) => {
            const step = () => {
              if (window.__fitBusy!() && window.__map!.isMoving()) {
                document.querySelector<HTMLElement>(".fold")!.click();
                done();
              } else requestAnimationFrame(step);
            };
            step();
          }),
      );
      await afterFold(page);
      await panelSettled(page);
      await fitDone(page);
      expectSameCamera(await camera(page), target);
    });
  }
});
