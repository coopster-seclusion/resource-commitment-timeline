# Resource Commitment Timeline

*Toward a better measure of wildfire strain.*

An interactive map of US wildfire strain, 2007 to 2025: every NICC Incident Management Situation Report, with Geographic Area preparedness levels, committed firefighting resources, and the incidents behind them.

Static site. No build step, no server code, no analytics, no third-party requests at runtime (d3 and fonts are in the repo).

## Layout

| Path | What |
|---|---|
| `index.html` | page shell, About dialog, Content Security Policy |
| `assets/app.css`, `assets/app.js` | styles (colour tokens, light and dark) and the app; `RELEASE` in app.js is the version shown in About |
| `assets/stats.js` | the Stats sheet (Seasons, Years, Records, Thesis view), loaded on first use with the same `?v=` tag as app.js |
| `assets/flags/` | flag-icons 7.2.3 SVGs for international help (MIT, licence file beside them) |
| `assets/icons/seclusion.svg` | site icon for the About link (copy of seclusion.io's own icon; the CSP serves images only from this origin) |
| `data/core.json` | report dates, PL, resource series, airtankers, outlines, callouts |
| `data/inc/<year>.json` | incident points for that year, loaded on demand |
| `data/relief_<region>_<level>.jpg` | hillshade for the lower 48, Alaska and Hawaii at 3 detail levels, in the map's own Albers projections (from Terrain Tiles on AWS Open Data) |
| `data/version.json` | build dates, thesis commit, hash of the source export |
| `vendor/d3-7.8.5.min.js` | d3 (ISC) |
| `fonts/` | Barlow Semi Condensed, Inter, JetBrains Mono (SIL OFL 1.1), latin subset |
| `tools/preview.mjs`, `tools/capture.mjs` | link-card image (`preview.png`) and video frame capture, headless browser |

## Releases

v2.0 to v3.0 were released on 19 Nov 2026 (first release 16 Nov 2026); what each changed is in the commit log and in the thesis repo `DECISIONS.md` (D-231 to D-240).

## Rebuilding the data

The data is never edited here. It is made in the thesis repo (`mgsd_thesis_sandbox`):

```
cd PoC_Playground
python -E poc8_strain_timeline_export.py
python -E poc8_site_build.py <path to this repo>
```

## Running locally

```
python -m http.server 8737 --directory .
```

then open http://localhost:8737. Opening `index.html` as a file does not work (the browser blocks `fetch` from `file://`).

## Links

The URL hash holds the view: `#2008-07-14`, `#2021-08-14/ONCC`, `#2012-08-16/pl` (modes: heat, pts, pl). `#stats/seasons`, `#stats/years`, `#stats/records`, `#stats/thesis` open the Stats sheet on that tab; on a phone, Back closes it. `?theme=light` or `?theme=dark` forces a theme. `?present` hides controls for screen capture; `window.strainTimeline.go(date, {trail: true})` steps the map for scripted capture.

See `PUBLISHING.md` before making the repo public.
