// prod_design 7: copy an export folder into dist/data/.
// Usage: npm run bundle -- export_<DDMMYY> [export_<previous DDMMYY>]
// The first folder gives manifest.json and its files. The second folder gives only its hashed files,
// thus a client that has the previous manifest can get its files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("..", import.meta.url));
const ROOT = path.resolve(APP, "../..");
const DIST = path.join(APP, "dist");
const OUT = path.join(DIST, "data");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function readManifest(name) {
  const file = path.join(ROOT, "data", name, "manifest.json");
  if (!/^export_\d{6}$/.test(name)) fail(`${name} is not an export folder name (export_<DDMMYY>).`);
  if (!fs.existsSync(file)) fail(`${file} does not exist. Make the export with the modules (docs/modules.md).`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const [current, previous, ...rest] = process.argv.slice(2);
if (!current || rest.length) fail("Usage: npm run bundle -- export_<DDMMYY> [export_<previous DDMMYY>]");
if (!fs.existsSync(path.join(DIST, "index.html"))) fail("dist/index.html does not exist. Run npm run build:live first.");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const name of [previous, current].filter(Boolean)) {
  const manifest = readManifest(name);
  for (const file of Object.values(manifest.files)) {
    fs.copyFileSync(path.join(ROOT, "data", name, file), path.join(OUT, file));
    console.log(`${name}/${file}`);
  }
}
// The manifest is last, as in the export (export_format 2).
fs.copyFileSync(path.join(ROOT, "data", current, "manifest.json"), path.join(OUT, "manifest.json"));
console.log(`${current}/manifest.json`);
