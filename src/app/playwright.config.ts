import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    env: { EXPORT: "export_131026" },
    url: `http://localhost:${PORT}/data/manifest.json`,
    reuseExistingServer: !process.env.CI,
  },
});
