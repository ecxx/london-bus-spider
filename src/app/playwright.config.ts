import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;
// The measurements (npm run perf) use the production build, on the preview server (prod_design 9, step 15).
const PREVIEW_PORT = 5198;
const PERF = !!process.env.PERF;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, grepInvert: /@perf/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, grepInvert: /@perf/ },
    // The measurements (tag @perf) need the GPU. Headless Chromium uses a software renderer (SwiftShader)
    // unless ANGLE uses Metal. Run one test at a time, so that the measurements do not share the GPU.
    {
      name: "chromium-gpu",
      grep: /@perf/,
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PREVIEW_PORT}`,
        launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
      },
    },
  ],
  webServer: PERF
    ? {
        command: `npx vite preview --port ${PREVIEW_PORT} --strictPort`,
        env: { EXPORT: "export_131026" },
        url: `http://localhost:${PREVIEW_PORT}/data/manifest.json`,
        reuseExistingServer: false,
      }
    : {
        command: `npx vite --port ${PORT} --strictPort`,
        env: { EXPORT: "export_131026" },
        url: `http://localhost:${PORT}/data/manifest.json`,
        reuseExistingServer: !process.env.CI,
      },
});
