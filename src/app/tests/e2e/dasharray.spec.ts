import { expect, test } from "@playwright/test";

// prod_design 5.4: a layer with dashed and solid lines uses a data-driven line-dasharray.
// This test shows that the installed MapLibre GL JS version draws it.
test("data-driven line-dasharray draws a solid line and a dashed line in one layer", async ({ page }) => {
  await page.goto("/tests/e2e/pages/dasharray.html");
  const result = await page.waitForFunction(() => (window as unknown as { dasharray?: unknown }).dasharray, null, { timeout: 15_000 });
  const r = (await result.jsonValue()) as { version: string; errors: string[]; solidRuns: number; dashedRuns: number };
  console.log(`MapLibre GL JS ${r.version}: solid line ${r.solidRuns} run, dashed line ${r.dashedRuns} runs`);
  expect(r.errors).toEqual([]);
  expect(r.solidRuns).toBe(1);
  // 360 px of line with 6 px dashes and 7 px gaps: approximately 28 dashes.
  expect(r.dashedRuns).toBeGreaterThan(20);
});
