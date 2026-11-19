// Phone screenshots for release checks (thesis D-241): each size at the top of the page and scrolled so the map
// is pinned, with a callout showing. Needs the site served locally (python -m http.server 8737 from the repo root)
// and the headless browser that capture.mjs uses.
// Usage: [SITE=<url>] node phone_shots.mjs <out_dir> [date]      (default date 2007-07-28: a National PL 5 callout is up)
// Writes <out_dir>/<w>x<h>_top.png and <w>x<h>_pinned.png, and prints overlap measurements.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const BROWSER = "out/browsers/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe";
const out = process.argv[2] || path.join(here, "out", "phone");
const date = process.argv[3] || "2007-07-28";
const SITE = process.env.SITE || "http://localhost:8737/";   // SITE=https://.../ checks the live site
const SIZES = [[375, 667], [375, 553], [320, 568], [360, 640], [375, 812], [414, 896]];
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: path.join(here, BROWSER), headless: "shell",
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--no-first-run", "--no-default-browser-check"] });
for (const [w, h] of SIZES) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${SITE}?theme=dark&r=${Date.now()}#${date}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.strainTimeline && window.strainTimeline.ready, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(out, `${w}x${h}_top.png`) });
  const top = await page.evaluate(measure);
  await page.evaluate(() => window.scrollTo(0, document.querySelector("#hud").offsetHeight + 40));
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: path.join(out, `${w}x${h}_pinned.png`) });
  const pin = await page.evaluate(measure);
  console.log(`${w}x${h}`, JSON.stringify({ top, pinned: pin }));
  await page.close();
}
await browser.close();

function measure() {   // in the page: boxes in viewport px, and the gaps that must not be negative
  const box = (s) => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === "none") return null;
    const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) }; };
  const map = box("#mapwrap"), mini = document.querySelector("#mini").classList.contains("on") ? box("#mini") : null;
  const call = document.querySelector("#callout").classList.contains("on") ? box("#callout") : null;
  const short = matchMedia("(max-width: 860px) and (max-height: 760px)").matches;
  const on = document.querySelector("#mini").classList.contains("on");
  const land = map && { t: map.t + (short ? (on ? 104 : 56) : 52), b: map.b - (short ? 66 : 12) };   // the extent the map is fitted into
  const stats = box("#statsbtn"), step = box("#stepper"), scrub = box(".scrub");
  const badge = document.querySelector("#pinbadge").classList.contains("on") ? box("#pinbadge") : null;
  return { short, map, land, mini, callout: call, scrubTop: scrub && scrub.t,
    gap_strip_land: mini && land ? land.t - mini.b : null, gap_land_callout: call && land ? call.t - land.b : null,
    gap_stats_arrows: stats && step ? step.l - stats.r : null, scrub_on_screen: scrub ? scrub.b <= innerHeight + 1 : null,
    gap_callout_badge: call && badge ? badge.l - call.r : null, gap_land_badge: badge && land ? badge.t - land.b : null,
    strip_overflow: [...document.querySelectorAll("#miniNums .hn")].some(b => b.scrollWidth > b.clientWidth + 1),
    // v3.2 (D-242): badge in the top row and arrows at the bottom right while pinned on short phones
    arrows_bottom: document.querySelector("#stepper").parentElement.classList.contains("stage"),
    gap_stats_badge: badge && stats && document.querySelector("#pinbadge").parentElement.classList.contains("maptools") ? badge.l - stats.r : null,
    badge_right_margin: badge ? innerWidth - badge.r : null,
    gap_callout_arrows: call && step && document.querySelector("#stepper").parentElement.classList.contains("stage") ? step.l - call.r : null,
    gap_land_arrows: step && land && document.querySelector("#stepper").parentElement.classList.contains("stage") ? step.t - land.b : null,
    // the page scrolls only as far as pinning; the list box has its own scroll
    page_extra_scroll: document.scrollingElement.scrollHeight - innerHeight - document.querySelector("#hud").offsetHeight,
    list_box_scrolls: (() => { const b = document.querySelector(".rail-body"); return b.scrollHeight > b.clientHeight && getComputedStyle(b).overflowY === "auto"; })() };
}
