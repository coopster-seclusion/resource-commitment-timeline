// Frame-by-frame capture of the timeline for a LinkedIn video (4:5, 1080 x 1350, 30 fps).
// Needs the site served locally (python -m http.server 8737 from the repo root) and the headless browser below installed.
// Usage: node capture.mjs [--draft]      (--draft renders every 3rd frame for a quick look)
// Writes tools/frames/00001.png ... and tools/out/timeline_4x5.mp4
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import ffmpeg from "ffmpeg-static";

const FPS = 30, PAGE = "http://localhost:8737/?present&theme=dark";
// Chrome for Testing headless shell, installed into tools/out/browsers by:
//   npx @puppeteer/browsers@2.6.1 install chrome-headless-shell@131.0.6778.204 --path out/browsers
// (installed Edge exits at once when started under remote control on this machine)
const BROWSER = "out/browsers/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe";
const DRAFT = process.argv.includes("--draft");
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const FR = path.join(here, "frames"), OUT = path.join(here, "out");

// Storyboard. Every number in a caption is from the data (or DECISIONS.md D-204 for the 998 fires).
const SITE = "coopster-seclusion.github.io/resource-commitment-timeline";
const S = [
  { hold: "2020-09-19", frames: 100, cap: { big: true, t: "31,490 people", s: "committed to US wildfires on a single day, 19 Sep 2020: the most in 19 years of national situation reports" } },
  { hold: "2007-06-01", frames: 80, cap: { t: "Every national situation report, 2007 to 2025", s: "3,942 reports. Colour: each area's preparedness level. Heat: personnel committed to incidents." } },
  { from: "2007-06-02", to: "2008-06-19", speed: 3 },
  { from: "2008-06-20", to: "2008-07-20", speed: .5, cap: { t: "June 2008: 998 fires in 12 days", s: "Northern California, 20 Jun to 1 Jul. National Preparedness Level 5 by 1 Jul." } },
  { from: "2008-07-21", to: "2020-07-31", speed: 5, cap: { t: "Every summer, commitment builds in the West", s: "Each step is one report: daily in the fire season, weekly off season." }, capFrames: 110 },
  { from: "2020-08-01", to: "2020-09-30", speed: .5, cap: { t: "2020: the record", s: "National PL 5 from 19 Aug. 31,490 personnel committed on 19 Sep." } },
  { from: "2020-10-01", to: "2025-12-31", speed: 5, cap: { t: "2021 to 2025", s: "Busiest reports: 26,476 personnel (26 Aug 2021) and 27,755 (3 Aug 2024)." }, capFrames: 120 },
  { hold: "2025-12-31", frames: 110, cap: { big: true, t: "Resource Commitment Timeline", s: "Toward a better measure of wildfire strain. Explore every report yourself:", u: SITE } },
];
const FADE = 9;

fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: path.join(here, BROWSER), headless: "shell",
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--no-first-run", "--no-default-browser-check"] });
const page = await browser.newPage();
await page.setViewport({ width: 720, height: 900, deviceScaleFactor: 1.5 });
await page.goto(PAGE + "#2020-09-19", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.strainTimeline && window.strainTimeline.ready, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
const dates = await page.evaluate(() => window.strainTimeline.dates());
const idxOf = (d) => { let lo = 0; for (let i = 0; i < dates.length; i++) if (dates[i] <= d) lo = i; return lo; };

let n = 0, shot = 0;
async function frame(i, trail, cap, alpha) {
  n++;
  if (DRAFT && n % 3) return;
  await page.evaluate(async (i, trail, cap, alpha) => {
    const st = window.strainTimeline;
    if (i !== st.index || !trail) await st.go(i, { trail });
    st.caption(cap, alpha);
  }, i, trail, cap || null, alpha);
  await page.screenshot({ path: path.join(FR, String(++shot).padStart(5, "0") + ".png") });
}
const fade = (k, len) => Math.min(1, (k + 1) / FADE, (len - k) / FADE);

for (const seg of S) {
  if (seg.hold) {
    const i = idxOf(seg.hold);
    for (let k = 0; k < seg.frames; k++) await frame(i, k > 0, seg.cap, seg.cap ? fade(k, seg.frames) : 0);
    continue;
  }
  const a = idxOf(seg.from), b = idxOf(seg.to), len = Math.ceil((b - a + 1) / seg.speed), cf = seg.capFrames || len;
  for (let k = 0; k < len; k++) {
    const i = Math.min(b, a + Math.floor(k * seg.speed));
    await frame(i, true, k < cf ? seg.cap : null, seg.cap && k < cf ? fade(k, cf) : 0);
  }
}
await browser.close();
console.log(`frames ${shot} of ${n} (${(n / FPS).toFixed(1)} s at ${FPS} fps)`);
const out = path.join(OUT, DRAFT ? "timeline_4x5_draft.mp4" : "timeline_4x5.mp4");
execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(DRAFT ? FPS / 3 : FPS), "-i", path.join(FR, "%05d.png"),
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
console.log("wrote", out, (fs.statSync(out).size / 1e6).toFixed(1), "MB");
