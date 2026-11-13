// prod_design 9, step 15: the measurements on the development laptop. Project chromium-gpu (npm run perf):
// the production build on the preview server, with ?perf (the times of src/perf.ts). The limits of
// step 15 are for the phone. The runs with a slower CPU (CDP CPU throttling) are an estimate of the phone,
// not the measurement: the phone values come from the ?perf box on the phone.
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { PerfReport, Stats } from "../../src/perf";
import { PHONE, WIDE, fitDone, mapReady } from "./helpers";

const ALDWYCH = "490G00019703";
const OXFORD_CIRCUS = "ICS1000173";
const RATES = [1, 10]; // the CPU of the laptop, and 10 times slower: near the Redmi Note 9S (the home lists at 1.3 s on both)
const RUNS = 5; // the page loads for the start measurement

async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`/?perf${hash}`);
  await page.addStyleTag({ content: ".perf-box { display: none !important; }" });
  await expect(page.locator(".scroll .tabs, .scroll .head h1").first()).toBeVisible({ timeout: 30_000 });
}

async function throttle(page: Page, rate: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

const report = (page: Page): Promise<PerfReport> => page.evaluate(() => window.__perf!.report());
const waitMark = (page: Page, name: string) =>
  page.waitForFunction((n) => window.__perf?.report().marks[n] !== undefined, name, { timeout: 60_000 });
const waitSeries = (page: Page, name: string, n: number) =>
  page.waitForFunction(([k, c]) => (window.__perf?.report().series[k as string]?.n ?? 0) >= (c as number), [name, n] as const, {
    timeout: 30_000,
  });

// The map has no move and no tile to load.
const idle = (page: Page) =>
  page.waitForFunction(() => {
    const m = window.__map!;
    return m.loaded() && m.areTilesLoaded() && !m.isMoving();
  }, null, { timeout: 60_000, polling: 100 });

const f1 = (v: number) => v.toFixed(1);
const fmt = (s: Stats | undefined) => (s ? `n ${s.n}, median ${f1(s.median)}, 95% ${f1(s.p95)}, max ${f1(s.max)} ms` : "no samples");
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;

function log(info: TestInfo, title: string, text: string): void {
  console.log(`PERF ${title}: ${text}`);
  info.annotations.push({ type: title, description: text });
}

test.describe("step 15 measurements (prod_design 9)", () => {
  for (const rate of RATES) {
    test(`client work from the start to the home lists; the decode and the home source; CPU x${rate} @perf`, async ({ page }, info) => {
      await page.setViewportSize(PHONE);
      // The first load puts the data in the cache. The measured loads come after it.
      await open(page, "#/");
      await waitMark(page, "homeSet");
      const runs: PerfReport[] = [];
      for (let i = 0; i < RUNS; i++) {
        await page.goto("about:blank");
        await throttle(page, rate);
        await open(page, "#/");
        await waitMark(page, "homeSet");
        await waitMark(page, "listsPaint");
        await waitSeries(page, "homeSetData", 1);
        runs.push(await report(page));
      }
      const m = (k: string) => median(runs.map((r) => r.marks[k]!));
      const s = (k: string) => median(runs.map((r) => r.series[k]!.last));
      log(
        info,
        `start x${rate}`,
        `median of ${RUNS} loads, ms from the page start: script ${f1(m("script"))}, core ${f1(m("core"))}, ` +
          `lists ${f1(m("lists"))}, lists painted ${f1(m("listsPaint"))}, lines fetched ${f1(m("linesParsed"))}, home set ${f1(m("homeSet"))}`,
      );
      log(
        info,
        `lines x${rate}`,
        `in the worker: fetch and parse ${f1(s("linesFetch"))}, decode ${f1(s("decode"))} ms; on the main thread: ` +
          `lines ${f1(s("linesMain"))}, build home ${f1(s("homeBuild"))}, home groups ${f1(s("homeSetData"))} (longest ${f1(Math.max(...runs.map((r) => r.series.homeChunk!.max)))}), stations setData ${f1(s("stationsSet"))} ms`,
      );
      // The long tasks after the home lists are on the screen (the lines and the map).
      log(info, `long tasks x${rate}`, runs.map((r) => fmt(r.series.longTask)).join("; "));
      expect(m("listsPaint")).toBeGreaterThan(0);
    });

    test(`client work to open the spider graph at Aldwych / Drury Lane, CPU x${rate} @perf`, async ({ page }, info) => {
      await page.setViewportSize(PHONE);
      await open(page, "#/");
      await waitMark(page, "homeSet");
      await idle(page);
      await throttle(page, rate);
      await page.evaluate(() => window.__perf!.reset());
      const n = 7;
      for (let i = 1; i <= n; i++) {
        await page.evaluate((k) => (location.hash = `#/station/${k}`), ALDWYCH);
        await waitSeries(page, "spider", i);
        await waitSeries(page, "spiderPaint", i);
        await page.evaluate(() => (location.hash = "#/"));
        await page.waitForTimeout(300);
      }
      const r = await report(page);
      expect(r.labels.spider).toBe(`station ${ALDWYCH}`);
      log(info, `spider x${rate}`, `script: ${fmt(r.series.spider)}; to the next paint: ${fmt(r.series.spiderPaint)}`);
    });

    test(`hit test (prod_design 5.5) at Aldwych / Drury Lane, CPU x${rate} @perf`, async ({ page }, info) => {
      await page.setViewportSize(WIDE);
      await open(page, `#/station/${ALDWYCH}`);
      await mapReady(page, true);
      await fitDone(page);
      await idle(page);
      await throttle(page, rate);
      await page.evaluate(() => window.__perf!.reset());
      // A sweep of the pointer over the free area (the panel is at the left), row by row.
      for (let y = 80; y < WIDE.height - 80; y += 24) {
        await page.mouse.move(460, y);
        await page.mouse.move(WIDE.width - 80, y, { steps: 40 });
      }
      await page.waitForTimeout(200);
      const r = await report(page);
      log(info, `hit test x${rate}`, fmt(r.series.hitTest));
      expect(r.series.hitTest!.n).toBeGreaterThan(100);
    });

    test(`the station list, one frame, CPU x${rate} @perf`, async ({ page }, info) => {
      await page.setViewportSize(PHONE);
      await open(page, "#/");
      await page.getByRole("tab", { name: /^Stations/ }).click();
      await page.waitForTimeout(300);
      await throttle(page, rate);
      await page.evaluate(() => window.__perf!.reset());
      // A fast fling: 300 px each frame for 300 frames.
      await page.locator("#panel-content").evaluate(async (el) => {
        for (let i = 0; i < 300; i++) {
          el.scrollTop += 300;
          await new Promise(requestAnimationFrame);
        }
      });
      const r = await report(page);
      log(info, `station list x${rate}`, fmt(r.series.listFrame));
      expect(r.series.listFrame!.n).toBeGreaterThan(100);
    });
  }

  // D9: the frame time of a zoom on the home view with all the line-directions. The limit: 16.7 ms or
  // less for 95% of the frames on the laptop.
  test("D9: frame time of a zoom with all the home lines @perf", async ({ page }, info) => {
    await page.setViewportSize(WIDE);
    await open(page, "#/");
    await mapReady(page, true);
    await idle(page);
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
      // A lost frame: more than 1.5 times the median frame (the display interval).
      const lost = frames.filter((t) => t > 1.5 * q(0.5)).length;
      return { renderer: String(renderer), frames: frames.length, median: q(0.5), p95: q(0.95), max: frames.at(-1)!, lost };
    });
    log(
      info,
      "D9 zoom frame time",
      `${r.frames} frames, median ${f1(r.median)} ms, 95% ${f1(r.p95)} ms, max ${f1(r.max)} ms, ${r.lost} frames over 1.5x the median (${r.renderer})`,
    );
    expect(r.renderer).not.toMatch(/SwiftShader/);
    expect(r.frames).toBeGreaterThan(10);
  });

  // D17: the requests to basemaps.cartocdn.com in one session with an empty cache: the home view, two
  // station views, one route view. Each test has a new browser context, thus an empty cache.
  for (const [name, size] of [
    ["wide", WIDE],
    ["phone", PHONE],
  ] as const) {
    test(`D17: requests to the basemap in one session, ${name} @perf`, async ({ page }, info) => {
      await page.setViewportSize(size);
      const urls: string[] = [];
      page.context().on("request", (req) => {
        if (new URL(req.url()).hostname.endsWith("basemaps.cartocdn.com")) urls.push(req.url());
      });
      await open(page, "#/");
      await mapReady(page, true);
      await idle(page);
      for (const hash of [`#/station/${ALDWYCH}`, `#/station/${OXFORD_CIRCUS}`, `#/line/189`]) {
        await page.evaluate((h) => (location.hash = h), hash);
        await fitDone(page);
        await idle(page);
      }
      await page.waitForTimeout(1000);
      const kind = (u: string) => {
        const p = new URL(u).pathname;
        if (p.includes("sprite")) return "sprite";
        if (p.includes("/fonts/")) return "glyphs";
        if (p.endsWith(".json")) return "style";
        if (/\.(pbf|mvt)$/.test(p) || /\/\d+\/\d+\/\d+/.test(p)) return "tiles";
        return "other";
      };
      const by = new Map<string, { all: number; unique: Set<string> }>();
      for (const u of urls) {
        const k = kind(u);
        if (!by.has(k)) by.set(k, { all: 0, unique: new Set() });
        by.get(k)!.all++;
        by.get(k)!.unique.add(u.replace(/([?&])key=[^&]*/, "$1key=*"));
      }
      const parts = [...by].map(([k, v]) => `${k} ${v.all} (${v.unique.size} unique)`).join(", ");
      const unique = new Set(urls).size;
      log(info, `D17 basemap requests ${name}`, `${urls.length} requests (${unique} unique URLs): ${parts}`);
      expect(by.get("tiles")?.all ?? 0).toBeGreaterThan(0);
    });
  }
});
