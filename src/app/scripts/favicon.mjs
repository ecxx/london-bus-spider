// Makes public/favicon.ico from assets/logo/tangledbuses_red.svg (docs/logo.md, "Favicon").
// The lines of the logo are 86 m wide. At 16 px to 48 px they are thinner than one pixel,
// thus the favicon uses a wider line. The script renders the logo in Chromium (Playwright)
// and writes an ICO file with one PNG image for each size.
// Usage: npm run favicon
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const SRC = fileURLToPath(new URL("../../../assets/logo/tangledbuses_red.svg", import.meta.url));
const OUT = fileURLToPath(new URL("../public/favicon.ico", import.meta.url));
const LINE_WIDTH = 300; // The line width of the favicon, in metres (the logo: 86).
const SIZES = [16, 32, 48]; // The image sizes in the ICO file, in px.

const svg = fs.readFileSync(SRC, "utf8").replace('stroke-width="86"', `stroke-width="${LINE_WIDTH}"`);
if (!svg.includes(`stroke-width="${LINE_WIDTH}"`)) throw new Error(`${SRC} has no stroke-width="86".`);
const url = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

const browser = await chromium.launch();
const pngs = [];
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const s of SIZES) {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<body style="margin:0"><img src="${url}" width="${s}" height="${s}" style="display:block"></body>`);
    await page.waitForFunction(() => document.querySelector("img").complete);
    pngs.push(await page.screenshot({ clip: { x: 0, y: 0, width: s, height: s } }));
  }
} finally {
  await browser.close();
}

// ICO: a 6-byte header, a 16-byte entry for each image, then the PNG data.
const header = Buffer.alloc(6 + 16 * SIZES.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(SIZES.length, 4);
let offset = header.length;
SIZES.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s % 256, e);
  header.writeUInt8(s % 256, e + 1);
  header.writeUInt16LE(1, e + 4); // colour planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(OUT + ".part", Buffer.concat([header, ...pngs]));
fs.renameSync(OUT + ".part", OUT);
console.log(`${OUT}: ${SIZES.join(", ")} px, line width ${LINE_WIDTH} m`);
