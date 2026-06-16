// Render every <div data-fig id="..."> in scripts/_diagrams.html to
// slides/figs/<id>.png at 3x.  Run `python scripts/diagrams.py` first.
//
//   npm i playwright-core           # one-time
//   npx playwright install chromium # or set CHROMIUM_PATH to a Chrome/Chromium binary
//   node scripts/render.mjs
//
// CHROMIUM_PATH env var overrides the browser binary if auto-detect fails.
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "_diagrams.html");
const outDir = join(here, "..", "slides", "figs");
fs.mkdirSync(outDir, { recursive: true });

const { chromium } = await import("playwright-core").catch(() => import("playwright"));
const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ deviceScaleFactor: 3 });
await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const ids = await page.$$eval("[data-fig]", els => els.map(e => e.id));
for (const id of ids) {
  await (await page.$("#" + id)).screenshot({ path: join(outDir, id + ".png"), omitBackground: id.startsWith("ic-") });
  console.log("wrote", id + ".png");
}
await browser.close();
console.log("done ->", outDir);
