/// <reference types="vitest/config" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig, loadEnv, searchForWorkspaceRoot, type Connect, type Plugin } from "vite";

// The project root: the .env with the CARTO keys and the data/ folder are there.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

// prod_design 5.2: one CARTO key from the mode. The live key only in the mode "live".
function cartoKey(mode: string): string {
  const name = mode === "live" ? "VITE_CARTO_KEY" : "VITE_TEST_CARTO_KEY";
  const key = loadEnv(mode, ROOT, "VITE_")[name];
  if (!key) throw new Error(`${name} is not set in ${path.join(ROOT, ".env")} (prod_design 5.2).`);
  return key;
}

// prod_design 7: the development server and the preview server (the measurements of step 15 on the
// phone) serve data/<EXPORT>/ at /data/.
const DATA_FILE = /^[\w-]+(\.[0-9a-f]{8})?\.json$/;

function exportData(): Plugin {
  return {
    name: "export-data",
    apply: (_, { command }) => command === "serve" && !process.env.VITEST,
    configureServer: serveData,
    configurePreviewServer: serveData,
  };
}

function serveData(server: { config: { logger: { warn: (m: string) => void } }; middlewares: Connect.Server }): void {
  const name = process.env.EXPORT;
  if (!name) {
    server.config.logger.warn("EXPORT is not set. /data/ is not served. Example: EXPORT=export_131026 npm run dev");
    return;
  }
  const dir = path.join(ROOT, "data", name);
  if (!fs.existsSync(path.join(dir, "manifest.json"))) {
    throw new Error(`${dir} has no manifest.json. Make the export with the modules (docs/modules.md).`);
  }
  server.middlewares.use("/data", (req, res, next) => {
    const file = decodeURIComponent((req.url ?? "/").split("?")[0]!.slice(1));
    if (!DATA_FILE.test(file)) return next();
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) return next();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", file === "manifest.json" ? "no-cache" : "public, max-age=31536000, immutable");
    fs.createReadStream(full).pipe(res);
  });
}

export default defineConfig(({ mode }) => ({
  plugins: [preact(), exportData()],
  define: { __CARTO_KEY__: JSON.stringify(cartoKey(mode)) },
  build: { target: "es2022" },
  // docs/logo.md: the panel imports the logo from assets/logo/ in the project root.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), path.join(ROOT, "assets", "logo")] } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
}));
