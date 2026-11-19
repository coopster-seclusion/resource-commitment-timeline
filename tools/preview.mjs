// Link-card image (Open Graph, 1200 x 630) for the site root: preview.png.
// Needs the site served locally (python -m http.server 8737 from the repo root) and the headless browser that
// capture.mjs uses. Usage: node preview.mjs [date] [theme]   (defaults: 2020-09-10 dark, the frame used since launch)
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const BROWSER = "out/browsers/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe";
const date = process.argv[2] || "2020-09-10", theme = process.argv[3] || "dark";
const browser = await puppeteer.launch({ executablePath: path.join(here, BROWSER), headless: "shell",
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--no-first-run", "--no-default-browser-check"] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.goto(`http://localhost:8737/?theme=${theme}#${date}`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.strainTimeline && window.strainTimeline.ready, { timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));   // let counters and the callout settle
await page.screenshot({ path: path.join(here, "..", "preview.png") });
await browser.close();
console.log("wrote preview.png", date, theme);
