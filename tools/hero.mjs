// Short silent loop of the timeline map for the wildfireline.org landing page, plus a poster image.
// Captures the normal desktop view with the map controls and cards hidden, clipped to the map
// (present mode is laid out for the 4:5 video and has no map at 16:9).
// Needs the site served locally (8737, or SITE=<url>) and the headless browser that capture.mjs uses.
// Usage: node hero.mjs <out_dir> [--draft]
// Writes <out_dir>/hero.mp4 and <out_dir>/hero.jpg, 1280 px wide. No captions: the landing page carries the words.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import ffmpeg from "ffmpeg-static";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTDIR = path.resolve(process.argv[2] || path.join(here, "out"));
const DRAFT = process.argv.includes("--draft");
const FPS = 24, OUTW = 1280;
const PAGE = (process.env.SITE || "http://127.0.0.1:8737/") + "?theme=dark";
const BROWSER = "out/browsers/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe";
const FROM = "2020-07-01", TO = "2020-10-20", PER = 3;   // the 2020 season, one report every PER frames
const POSTER = "2020-09-19";                              // busiest report in the record: 31,490 personnel
const FR = path.join(here, "frames_hero");

fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true }); fs.mkdirSync(OUTDIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: path.join(here, BROWSER), headless: "shell",
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--no-first-run", "--no-default-browser-check"] });
const page = await browser.newPage();
await page.setViewport({ width: 1760, height: 1000, deviceScaleFactor: 1 });
await page.goto(PAGE + "#" + POSTER, { waitUntil: "networkidle0" });
await page.addStyleTag({ content: ".maptools,.legend,.callout,.tip,.yearload{display:none!important}" });
await page.waitForFunction(() => window.strainTimeline && window.strainTimeline.ready, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 800));
const clip = await page.evaluate(() => { const r = document.getElementById("mapwrap").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.floor(r.height / 2) * 2 }; });
const dates = await page.evaluate(() => window.strainTimeline.dates());
const idxOf = (d) => { let lo = 0; for (let i = 0; i < dates.length; i++) if (dates[i] <= d) lo = i; return lo; };

const posterPng = path.join(FR, "poster.png");
await page.screenshot({ path: posterPng, clip });

let shot = 0;
const a = idxOf(FROM), b = idxOf(TO);
for (let i = a; i <= b; i++) {
  await page.evaluate(async (i) => { await window.strainTimeline.go(i, { trail: true }); }, i);
  const f = path.join(FR, String(++shot).padStart(5, "0") + ".png");
  await page.screenshot({ path: f, clip });
  for (let k = 1; k < (DRAFT ? 1 : PER); k++) fs.copyFileSync(f, path.join(FR, String(++shot).padStart(5, "0") + ".png"));
}
await browser.close();
const scale = `scale=${OUTW}:-2:flags=lanczos`;
execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", posterPng, "-vf", scale, "-q:v", "4", path.join(OUTDIR, "hero.jpg")], { stdio: "inherit" });
const out = path.join(OUTDIR, "hero.mp4");
execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(DRAFT ? FPS / PER : FPS), "-i", path.join(FR, "%05d.png"),
  "-vf", scale, "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out], { stdio: "inherit" });
fs.rmSync(FR, { recursive: true, force: true });
console.log(`clip ${clip.width}x${clip.height}; reports ${b - a + 1}; frames ${shot} (${(shot / (DRAFT ? FPS / PER : FPS)).toFixed(1)} s)`);
for (const f of ["hero.mp4", "hero.jpg"]) console.log("wrote", path.join(OUTDIR, f), (fs.statSync(path.join(OUTDIR, f)).size / 1e6).toFixed(2), "MB");
