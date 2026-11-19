# Before going public

Checklist for the owner. Nothing here is published yet.

## Data terms (check each, record the answer)

| Source | Used for | Terms | Status |
|---|---|---|---|
| NICC Incident Management Situation Reports | PL, resource counts, incident names | US federal publication | believed public domain; confirm |
| NIFC incident locations layer (via strain atlas v0.3) | incident points (heat) | NIFC open data | OK: owner confirmed open for this use [P], 16 Nov 2026 |
| USDA FS FAM Aviation Business System public reports | airtankers flying and available | US federal, public reports | believed public domain; confirm |
| NIFC GACC and PSA boundaries | outlines | NIFC open data | OK: owner confirmed NIFC data open for this use [P], 16 Nov 2026 |
| Terrain Tiles on AWS Open Data (Mapzen) | hillshade | open, attribution required | OK: attribution in the About dialog with a link to the full list |
| d3 | code | ISC | OK, licence text kept in the minified file header |
| Fonts | type | SIL OFL 1.1 | OK |
| seclusion.io site icon, `assets/icons/seclusion.svg` (copied from https://www.seclusion.io/icon.svg, 227 bytes) | About link to the owner's website | owner's own site | OK |
| LinkedIn "in" mark, drawn inline in `index.html` | About link to the owner's LinkedIn | link to a profile, mark drawn in LinkedIn blue | OK |
| flag-icons 7.2.3 (lipis), `assets/flags/` (AU, NZ, CA, MX, 4:3 SVG) | international help flags | MIT, licence kept as `assets/flags/LICENSE-flag-icons.txt` | OK; credited in the About dialog |
| NPS symbol library (person, group, airport) and Mapbox Maki `heliport`, inlined in `assets/app.js`; engine drawn by the author | card symbols | NPS: US government work, believed public domain [A] (repo states no licence); Maki: CC0 | OK; credited in the About dialog |

## Before the first push

- Code licence: MIT (`LICENSE`), chosen 16 Nov 2026. Still to write: a one-line statement for the derived data.
- Choose the repo name and whether the author name and thesis line in the About dialog stay as written.
- `preview.png` (1200 x 630) and Open Graph tags: done; remake the image after visual changes with `node tools/preview.mjs` (site served locally).
- Hosting: GitHub Pages from the `main` branch root (`.nojekyll` is present so files are served as is).

## Each release

- Bump `RELEASE` in `assets/app.js` (shown in About) and the `?v=` on the CSS and JS links in `index.html`. `stats.js` takes the same `?v=` as app.js, so it needs no separate bump.
- Run `node tools/phone_shots.mjs <out_dir>` (site served locally): screenshots and gap measurements at 375x667, 375x553 (iPhone SE in Safari), 320x568, 360x640, 375x812 and 414x896, top and pinned. On short-screen sizes every gap must be 0 or more. Then check desktop, dark and light. After the push, rerun it on the live site: `SITE=https://coopster-seclusion.github.io/resource-commitment-timeline/ node tools/phone_shots.mjs <out_dir>`.
- After visual changes, `node tools/preview.mjs` (site served locally) to redo `preview.png`.

## Each data update

- Rebuild with `poc8_site_build.py`, check `data/version.json` changed, open the page locally, then commit.
