/* Strain Timeline. Data: data/core.json (always) and data/inc/<year>.json (on demand). No third-party requests. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const F = 9, C = { lon: 0, lat: 1, pers: 2, crews: 3, eng: 4, heli: 5, name: 6, gacc: 7, has: 8 };
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const GNAME = { NWCC: "Northwest", ONCC: "Northern California", OSCC: "Southern California", NRCC: "Northern Rockies",
    GBCC: "Great Basin", SWCC: "Southwest", RMCC: "Rocky Mountain", EACC: "Eastern Area", SACC: "Southern Area", AICC: "Alaska" };
  const MODES = ["heat", "pts", "pl"];
  // Short phones (v3.1, D-241): an iPhone SE in Safari shows about 550 px of page. Below 760 px of height the
  // top section, pinned strip and callout are compact and the map is fitted to leave room for them.
  const SHORT = matchMedia("(max-width: 860px) and (max-height: 760px)");
  // stats.js gets the same cache tag as this file (index.html sets ?v= on app.js and app.css)
  const ASSET_V = ((document.currentScript && document.currentScript.src) || "").split("?v=")[1] || "0";
  const RELEASE = { v: "3.4", date: "2026-11-20", first: "2026-11-16" };   // bump v and date on each published change; first = first public release (thesis D-213)
  const params = new URLSearchParams(location.search);
  const PRESENT = params.has("present");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = d3.format(",");
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } } };

  let D, N, dayOf, yOf, idx = 0, prevIdx = -1, scope = "NATIONAL", mode = "heat", playing = false, acc = 0, last = 0;
  let W = 0, H = 0, dpr = 1, proj, gpaths = {}, ppaths = [], landPath = null, gcent = {}, colors = {}, lut = null;
  const years = [];           // per year: {i0, i1, off, inc, names, px, py, loading}
  const map = $("map"), ctx = map.getContext("2d");
  const hit = document.createElement("canvas").getContext("2d");
  const shadow = document.createElement("canvas"), sctx = shadow.getContext("2d", { willReadFrequently: true });
  const heatc = document.createElement("canvas"), hctx = heatc.getContext("2d");
  const glowc = document.createElement("canvas"), gctx = glowc.getContext("2d");
  const canFilter = typeof gctx.filter === "string";
  let trail = null, basec = null;

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const TOKENS = ["--bg","--land","--psa","--gacc-line","--sel","--ink","--ink2","--muted","--pl1","--pl2","--pl3","--pl4","--pl5",
    "--heat0","--heat1","--heat2","--heat3","--heat4","--spark","--spark-fill","--cursor","--panel","--f-display",
    "--relief-ink","--relief-hi"];
  function readColors() {
    TOKENS.forEach(k => colors[k] = css(k));
    colors.plAlpha = parseFloat(css("--pl-alpha")) || .55;
    colors.rShadow = parseFloat(css("--relief-shadow")) || 0; colors.rLight = parseFloat(css("--relief-light")) || 0;
    colors.glow = parseFloat(css("--glow")) || 0;
    const g = document.createElement("canvas"); g.width = 256; g.height = 1; const c = g.getContext("2d");
    const gr = c.createLinearGradient(0, 0, 256, 0);
    ["--heat0","--heat1","--heat2","--heat3","--heat4"].forEach((k, i) => gr.addColorStop(i / 4, colors[k]));
    c.fillStyle = gr; c.fillRect(0, 0, 256, 1); lut = c.getImageData(0, 0, 256, 1).data;
    ["legheat", "legheat2"].forEach(id => {   // the map legend and the copy at the top of About
      const lh = $(id).getContext("2d"), lg = lh.createLinearGradient(0, 0, 120, 0);
      ["--heat0","--heat1","--heat2","--heat3","--heat4"].forEach((k, i) => lg.addColorStop(i / 4, colors[k]));
      lh.clearRect(0, 0, 120, 10); lh.fillStyle = lg; lh.fillRect(0, 0, 120, 10);
    });
    $("legpl").innerHTML = $("legpl2").innerHTML = [1,2,3,4,5].map(p => `<span class="sw" style="background:${colors["--pl" + p]}">${p}</span>`).join("")
      + `<span class="sw" style="background:${colors["--land"]};border:1px solid ${colors["--gacc-line"]}"></span><span>not listed</span>`;
  }
  const plColor = (p) => p ? colors["--pl" + p] : null;
  const isDark = () => colors.glow > 0;

  function fmtDate(s) { const d = new Date(s + "T00:00:00Z"); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
  const shortDate = (s) => { const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- theme ----------
  const THEMES = ["auto", "light", "dark"];
  const ICON = {
    auto: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></g></svg>',
    dark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 10.5A6 6 0 0 1 5.5 3a6 6 0 1 0 7.5 7.5z" fill="currentColor"/></svg>' };
  let theme = params.get("theme") || store.get("st-theme") || "auto";
  function applyTheme() {
    if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    ["theme", "themeM"].forEach(id => { $(id).innerHTML = ICON[theme] || ICON.auto; $(id).setAttribute("aria-label", "Colour theme: " + (theme === "auto" ? "automatic" : theme)); });
  }
  applyTheme();
  $("theme").onclick = $("themeM").onclick = () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set("st-theme", theme); applyTheme(); };
  if (PRESENT) document.body.classList.add("present");

  // ---------- incident years ----------
  function yearOf(i) { return years[yOf[i]]; }
  function loadYear(yi) {
    const Y = years[yi]; if (!Y || Y.inc || Y.loading) return Y && Y.loading;
    Y.loading = fetch(`data/inc/${Y.year}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(p => {
      Object.assign(Y, { off: p.off, inc: p.inc, names: p.names }); projectYear(Y); Y.loading = null;
      if (yOf[idx] === yi) { draw(); panel(); }
    }).catch(err => { Y.loading = null; console.error("year", Y.year, err); });
    return Y.loading;
  }
  function projectYear(Y) {
    if (!proj || !Y.inc) return;
    const n = Y.inc.length / F; Y.px = new Float32Array(n); Y.py = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * F;
      if (!Y.inc[o + C.has]) { Y.px[i] = NaN; continue; }
      const p = proj([Y.inc[o] / 100, Y.inc[o + 1] / 100]);
      if (p) { Y.px[i] = p[0]; Y.py[i] = p[1]; } else Y.px[i] = NaN;
    }
  }
  function rows(i) { // [Y, a, b] incident rows for report i, or null while that year loads
    const Y = yearOf(i); if (!Y || !Y.inc) return null;
    return [Y, Y.off[i - Y.i0], Y.off[i - Y.i0 + 1]];
  }

  // ---------- geometry ----------
  function layout() {
    const r = $("mapwrap").getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(2, window.devicePixelRatio || 1);
    map.width = Math.round(W * dpr); map.height = Math.round(H * dpr);
    const short = SHORT.matches;
    // short phones: room above the land for the pinned strip only while it shows (it shows once the top section
    // has scrolled away), and room below for the compact callout
    const stripOn = short && $("mini").classList.contains("on");
    const pad = W < 600 ? 12 : 40, top = stripOn ? 104 : short ? 56 : W < 600 ? 52 : 64, bottom = short ? 66 : W < 860 ? 12 : 48;
    proj = d3.geoAlbersUsa().fitExtent([[pad, top], [W - pad, H - bottom]], D.gacc);
    const path = d3.geoPath(proj);
    gpaths = {}; gcent = {}; landPath = new Path2D();
    D.gacc.features.forEach(f => { const s = path(f); if (s) { gpaths[f.properties.id] = new Path2D(s); landPath.addPath(gpaths[f.properties.id]); } });
    D.gacc.features.forEach(f => {
      let best = null, ba = -1;
      f.geometry.coordinates.forEach(poly => { const g = { type: "Polygon", coordinates: poly }; const a = path.area(g); if (a > ba) { ba = a; best = g; } });
      if (best) gcent[f.properties.id] = path.centroid(best);
    });
    ppaths = D.psa.features.map(f => { const s = path(f); return s ? new Path2D(s) : null; }).filter(Boolean);
    years.forEach(projectYear);
    shadow.width = Math.ceil(W / 2); shadow.height = Math.ceil(H / 2);
    heatc.width = glowc.width = shadow.width; heatc.height = glowc.height = shadow.height;
    trail = null; buildBase(); layoutTrack(); buildSparks(); draw(); if (D) intlPanel();
  }

  // Shaded relief: one hillshade image per albersUsa part, rendered offline in that part's own Albers projection,
  // so each is placed by an affine transform fitted to three control points. Shading is turned into a shadow and a
  // highlight overlay once per theme (and per detail level on small screens).
  const reliefs = {};   // name -> {levels: [{src, ctrl, img, over}]}, level 0 finest; each level shaded at its own scale
  function loadReliefs() {
    const M = D.meta.relief; if (!M) return;
    Object.keys(M).filter(k => k !== "flat").forEach(name => { reliefs[name] = { levels: M[name].map(l => ({ ...l })) }; });
  }
  function levelImage(L) {
    if (L.img || L.loading) return L.img && L.img.complete && L.img.naturalWidth ? L : null;
    L.loading = true; const im = new Image(); im.decoding = "async";
    im.onload = () => { L.img = im; L.loading = false; baseKey = ""; draw(); };
    im.onerror = () => { L.loading = false; };
    im.src = L.src; return null;
  }
  function affineFor(R) { // image pixel -> CSS pixel
    const P = R.ctrl.map(c => [c[2], c[3], proj([c[0], c[1]])]);
    if (P.some(q => !q[2])) return null;
    const [[u0, v0, s0], [u1, v1, s1], [u2, v2, s2]] = P, det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    const solve = (k) => { const a = ((s1[k] - s0[k]) * (v2 - v0) - (s2[k] - s0[k]) * (v1 - v0)) / det;
      const c = ((u1 - u0) * (s2[k] - s0[k]) - (u2 - u0) * (s1[k] - s0[k])) / det; return [a, c, s0[k] - a * u0 - c * v0]; };
    const [a, c, e] = solve(0), [b, d, f] = solve(1);
    return [a, b, c, d, e, f];
  }
  const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec((h || "").trim()); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16, (n >> 8) & 255, n & 255]; };
  function overlay(R) {
    const f = 1, key = `${colors.rShadow}|${colors.rLight}|${colors["--relief-ink"]}|${colors["--relief-hi"]}`;
    if (R.over && R.over.key === key) return R.over;
    const w = R.img.naturalWidth, h = R.img.naturalHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(R.img, 0, 0, w, h);
    const im = g.getImageData(0, 0, w, h), d = im.data, flat = D.meta.relief.flat || 180;
    // shadows in a tinted ink, highlights in a warm or cool white (theme tokens); full shadow 28 grey levels below
    // flat, full highlight 18 above (1st and 99th percentiles of the shading are about 20 and 10 from flat)
    const S = 255 * colors.rShadow, L = 255 * colors.rLight, ink = rgb(colors["--relief-ink"]), hi = rgb(colors["--relief-hi"]);
    for (let o = 0; o < d.length; o += 4) {
      const v = d[o];
      if (v < flat - 1) { d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2]; d[o + 3] = S * Math.pow(Math.min(1, (flat - v) / 28), .8); }
      else if (v > flat + 1) { d[o] = hi[0]; d[o + 1] = hi[1]; d[o + 2] = hi[2]; d[o + 3] = L * Math.pow(Math.min(1, (v - flat) / 18), .8); }
      else d[o + 3] = 0;
    }
    g.putImageData(im, 0, 0);
    R.over = { key, canvas: c, f };
    return R.over;
  }
  function drawRelief(b) {
    if (!landPath) return;
    b.save(); b.clip(landPath); b.imageSmoothingEnabled = true; b.imageSmoothingQuality = "high";
    Object.values(reliefs).forEach(R => {
      const A0 = affineFor(R.levels[0]); if (!A0) return;
      const s0 = Math.hypot(A0[0], A0[1]) * dpr;          // device pixels per finest-level image pixel
      let k = R.levels.findIndex((L, i) => s0 * 2 ** i >= .7); if (k < 0) k = R.levels.length - 1;
      let L = levelImage(R.levels[k]);                      // fall back to any loaded level while it loads
      if (!L) L = R.levels.filter(q => q.img).pop(); if (!L) return;
      const A = affineFor(L), o = overlay(L);
      b.setTransform(dpr * A[0], dpr * A[1], dpr * A[2], dpr * A[3], dpr * A[4], dpr * A[5]);
      b.drawImage(o.canvas, 0, 0);
    });
    b.restore(); b.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Static base for the current report: land, PL tint, relief, outlines. Rebuilt only when PL, scope or theme change.
  let baseKey = "";
  function buildBase() { basec = basec || document.createElement("canvas"); basec.width = map.width; basec.height = map.height; baseKey = ""; }
  function drawBase() {
    const key = D.gaccs.map(g => D.pl[g][idx] || 0).join("") + scope;
    if (key === baseKey) return; baseKey = key;
    const b = basec.getContext("2d"); b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.fillStyle = colors["--bg"]; b.fillRect(0, 0, W, H);
    D.gaccs.forEach(g => {
      const p = gpaths[g]; if (!p) return;
      b.fillStyle = colors["--land"]; b.fill(p);
      const pl = D.pl[g][idx];
      if (pl) { b.globalAlpha = colors.plAlpha * (scope === "NATIONAL" || scope === g ? 1 : .35); b.fillStyle = plColor(pl); b.fill(p); b.globalAlpha = 1; }
    });
    drawRelief(b);
    b.strokeStyle = colors["--psa"]; b.lineWidth = .6; b.globalAlpha = .7; ppaths.forEach(p => b.stroke(p)); b.globalAlpha = 1;
    b.strokeStyle = colors["--gacc-line"]; b.lineWidth = 1.1; D.gaccs.forEach(g => gpaths[g] && b.stroke(gpaths[g]));
    if (scope !== "NATIONAL" && gpaths[scope]) { b.strokeStyle = colors["--sel"]; b.lineWidth = 2; b.stroke(gpaths[scope]); }
  }

  // ---------- map drawing ----------
  function draw() {
    if (!D || !proj) return;
    drawBase();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(basec, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = rows(idx);
    $("yearload").hidden = !!R || mode === "pl";
    if (!R) $("yearload").textContent = `Loading ${yearOf(idx).year} incidents`;
    if (R && mode === "heat") drawHeat(R); else if (R && mode === "pts") drawPoints(R);
    if (R && mode !== "pl") pulse(R);
    labels();
    // the picked incident keeps its ring through any redraw (a relief image or year file arriving later, D-239)
    if (picked && picked.at !== idx) { picked = null; flashKey = ""; }   // a new report date clears the pick
    if (picked) { const Y = yearOf(idx); if (Y.px && !isNaN(Y.px[picked.i])) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ring(Y.px[picked.i], Y.py[picked.i], 11); } }
    prevIdx = idx;
  }
  function labels() {
    ctx.font = `600 ${W < 600 ? 10 : 12}px ${colors["--f-display"]}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    D.gaccs.forEach(g => {
      const c = gcent[g]; if (!c) return;
      const pl = D.pl[g][idx], label = g + (pl ? "  PL " + pl : "");
      ctx.lineJoin = "round"; ctx.lineWidth = 3.5; ctx.strokeStyle = colors["--bg"]; ctx.globalAlpha = .85; ctx.strokeText(label, c[0], c[1]);
      ctx.fillStyle = colors["--ink"]; ctx.globalAlpha = 1; ctx.fillText(label, c[0], c[1]);
    });
  }
  const weight = (p) => Math.min(1, .16 + .32 * Math.log10(1 + p / 15));
  const radius = (p) => Math.max(5, (7 + 3.2 * Math.sqrt(p / 40)) * Math.min(W, H) / 700);
  function drawHeat([Y, a, b]) {
    const sw = shadow.width, sh = shadow.height;
    sctx.clearRect(0, 0, sw, sh);
    for (let i = a; i < b; i++) {
      if (isNaN(Y.px[i])) continue;
      const p = Y.inc[i * F + C.pers], r = radius(p) / 2, x = Y.px[i] / 2, y = Y.py[i] / 2;
      const g = sctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
      sctx.globalAlpha = weight(p); sctx.fillStyle = g; sctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    sctx.globalAlpha = 1;
    const img = sctx.getImageData(0, 0, sw, sh), d = img.data, n = sw * sh;
    // Trail: while stepping forward in playback, heat cools over a few reports instead of vanishing.
    const step = idx - prevIdx, cont = trail && trail.length === n && step >= 1 && step <= 4 && (playing || PRESENT_STEP);
    if (!trail || trail.length !== n) trail = new Float32Array(n);
    const decay = Math.pow(.7, step);
    for (let k = 0; k < n; k++) {
      const v = d[k * 4 + 3], t = cont ? Math.max(v, trail[k] * decay) : v; trail[k] = t;
      const o = k * 4; if (t < 3) { d[o + 3] = 0; continue; }
      const j = Math.min(255, t | 0) * 4, fresh = v >= t - .5;
      d[o] = lut[j]; d[o + 1] = lut[j + 1]; d[o + 2] = lut[j + 2];
      d[o + 3] = Math.min(255, (fresh ? 40 : 18) + t * (fresh ? 1.1 : .9));
    }
    hctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(heatc, 0, 0, W, H);
    if (colors.glow > 0 && canFilter) {
      gctx.clearRect(0, 0, glowc.width, glowc.height);
      gctx.filter = `blur(${Math.max(3, Math.round(Math.min(W, H) / 160))}px)`; gctx.drawImage(heatc, 0, 0); gctx.filter = "none";
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = colors.glow; ctx.drawImage(glowc, 0, 0, W, H); ctx.restore();
    }
  }
  function drawPoints([Y, a, b]) {
    for (let i = b - 1; i >= a; i--) {
      if (isNaN(Y.px[i])) continue;
      const p = Y.inc[i * F + C.pers], r = Math.max(2.5, 1.6 * Math.sqrt(p / 25));
      ctx.beginPath(); ctx.arc(Y.px[i], Y.py[i], r, 0, Math.PI * 2);
      ctx.fillStyle = colors["--heat2"]; ctx.globalAlpha = .82; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1.2; ctx.strokeStyle = colors["--bg"]; ctx.stroke();
    }
  }
  function pulse([Y, a]) { // ring on the callout's largest incident, on the callout day
    const c = activeCallout(); if (!c || c.kind !== "peak" || c.i !== idx || a >= Y.off[idx - Y.i0 + 1] || isNaN(Y.px[a])) return;
    ctx.beginPath(); ctx.arc(Y.px[a], Y.py[a], 13, 0, Math.PI * 2); ctx.strokeStyle = colors["--sel"]; ctx.lineWidth = 2; ctx.stroke();
  }
  let PRESENT_STEP = false;

  // ---------- international help (thesis D-228) ----------
  // Flags: flag-icons 7.2.3 (MIT), 4:3 SVGs served from assets/flags (the page's CSP allows only its own origin).
  const FNAME = { AU: "Australia", NZ: "New Zealand", CA: "Canada", MX: "Mexico" };
  const flag = (code) => `<img class="flag" src="assets/flags/${code.toLowerCase()}.svg" alt="${FNAME[code] || code}" title="${FNAME[code] || code}" width="16" height="12">`;
  const flags = (p) => p.map(flag).join("");
  const provNames = (p) => { const n = p.map(c => FNAME[c] || c); return n.length < 2 ? n[0] : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; };
  const people = (s) => s.people && /crew/.test(s.what) ? s.people : null;
  const destName = (g) => g[0] === "US" ? "national support" : g.map(x => GNAME[x] || x).join(" and ");
  const activeIntl = () => (D.intl || []).filter(s => s.a <= idx && idx <= s.b);
  function intlPanel() {
    const act = activeIntl();
    $("intlwrap").hidden = !act.length;
    $("intllist").innerHTML = act.map(s => `<li><span class="fl">${flags(s.p)}</span><span class="tx"><b>${esc(s.what)}</b>`
      + `<span class="sub">From ${provNames(s.p)} &middot; ${destName(s.g)}${people(s) ? ` &middot; about ${fmt(people(s))} people` : ""}</span></span></li>`).join("");
  }
  function intlByArea() { // area -> {p: providers, n: people (single-area segments only)}
    const out = {};
    activeIntl().forEach(s => s.g.forEach(g => { const o = out[g] = out[g] || { p: new Set(), n: 0 }; s.p.forEach(c => o.p.add(c)); if (s.g.length === 1) o.n += s.people || 0; }));
    return out;
  }

  // ---------- callouts ----------
  const CALLOUT_DAYS = 9;
  function activeCallout() {
    let best = null, bd = Infinity;
    for (const c of D.callouts) { const dd = Math.abs(dayOf[c.i] - dayOf[idx]); if (dd <= CALLOUT_DAYS && dd < bd) { bd = dd; best = c; } }
    return best;
  }
  let shownCallout = null;
  function calloutPanel() {
    const c = activeCallout(), el = $("callout");
    if (c === shownCallout) return; shownCallout = c;
    if (!c) { el.classList.remove("on"); setTimeout(() => { if (!shownCallout) el.hidden = true; }, 360); return; }
    const y = c.date.slice(0, 4);
    el.innerHTML = c.kind === "intl"
      ? `<div class="ce">${y} &middot; International help arrives</div><div class="ct ci">${flags(c.p)}<span>${esc(c.what)}</span></div>
         <div class="cb">From ${provNames(c.p)} to ${destName(c.g)}, ${shortDate(c.date)}.${people(c) ? ` About ${fmt(people(c))} people.` : ""} Source: ${c.src === "IMSR" ? "NICC situation report" : esc(c.src)}.</div>`
      : c.kind === "peak"
      ? `<div class="ce">${y} &middot; busiest report of the year</div><div class="ct">${fmt(c.personnel)} personnel committed</div>
         <div class="cb">${shortDate(c.date)}. Largest incident: <b>${esc(c.top)}</b>${c.gacc ? ` (${GNAME[c.gacc] || c.gacc})` : ""}, ${fmt(c.top_personnel)} personnel.</div>`
      : `<div class="ce">${y} &middot; National PL 5</div><div class="ct">Top preparedness level</div>
         <div class="cb">${shortDate(c.date)} is the first report of ${y} at National PL 5. ${c.personnel != null ? fmt(c.personnel) + " personnel committed." : ""}</div>`;
    el.classList.remove("more");
    el.hidden = false; requestAnimationFrame(() => el.classList.add("on"));
    if (playing) {   // slow playback while it is read; the bar along its foot shows the time left (also under reduced motion, D-244)
      slowUntil = performance.now() + READ_MS;
      el.classList.remove("reading"); void el.offsetWidth; el.classList.add("reading");
    }
  }

  // ---------- panel ----------
  const CARDS = [
    { k: "personnel", label: "Personnel" }, { k: "crews", label: "Crews" }, { k: "engines", label: "Engines" },
    { k: "helicopters", label: "Helicopters" }, { k: "tank", label: "Large airtankers flying", short: "Airtankers" }];
  // Symbols in the National Park Service map-symbol style: white pictogram on a rounded brown square, 22 x 22 glyph grid.
  // personnel, crews (guide's pointer removed), airtankers: NPS symbol library (US government work, public domain [A]);
  // helicopters: Mapbox Maki "heliport" (CC0), scaled from its 15 grid; engines: drawn here in the NPS manner (no
  // public fire-engine symbol was found in the NPS, Maki or Temaki sets).
  const SYM = {
    personnel: '<polygon points="13,5 13,4 9,4 9,5 8,5 8,13 9,13 9,22 13,22 13,13 14,13 14,5"/><circle cx="11" cy="1.8" r="1.8"/>',
    crews: '<polygon points="19,7 19,6 16,6 16,7 15,7 15,13 16,13 16,20 17,20 17,14 18,14 18,20 19,20 19,13 20,13 20,7"/><circle cx="17.5" cy="3.5" r="1.5"/>'
      + '<polygon points="7,7 7,6 4,6 4,7 3,7 3,13 4,13 4,20 5,20 5,14 6,14 6,20 7,20 7,13 8,13 8,7"/><circle cx="5.5" cy="3.5" r="1.5"/>'
      + '<polygon points="13,7 13,6 10,6 10,7 9,7 9,13 10,13 10,20 11,20 11,14 12,14 12,20 13,20 13,13 14,13 14,7"/><circle cx="11.5" cy="3.5" r="1.5"/>',
    engines: '<path fill-rule="evenodd" d="M0.5,9h13v7.6h-13z M13.6,7h4.6l3.4,4.2v5.4h-8z M15,8.3v3h4.9l-2.4-3z"/>'
      + '<rect x="1.5" y="5.6" width="11" height="1.3"/><rect x="2.6" y="6.9" width="1" height="2.1"/><rect x="7" y="6.9" width="1" height="2.1"/><rect x="11.4" y="6.9" width="1" height="2.1"/>'
      + '<rect x="14.4" y="5.2" width="3" height="1.3" rx=".4"/><circle cx="5" cy="18.6" r="2.3"/><circle cx="17.2" cy="18.6" r="2.3"/>',
    helicopters: '<path transform="translate(0 2) scale(1.4667)" d="M4,2C3,2,3,3,4,3h4v1C7.723,4,7.5,4.223,7.5,4.5V5H5H3.9707H3.9316C3.7041,4.1201,2.9122,3.5011,2,3.5c-1.1046,0-2,0.8954-2,2s0.8954,2,2,2c0.3722-0.001,0.7368-0.1058,1.0527-0.3027L5.5,10.5C6.5074,11.9505,8.3182,12,9,12h5c0,0,1,0,1-1v-0.9941C15,9.2734,14.874,8.874,14.5,8.5l-3-3c0,0-0.5916-0.5-1.2734-0.5H9.5V4.5C9.5,4.223,9.277,4,9,4V3h4c1,0,1-1,0-1C13,2,4,2,4,2z M2,4.5c0.5523,0,1,0.4477,1,1s-0.4477,1-1,1s-1-0.4477-1-1C1,4.9477,1.4477,4.5,2,4.5z M10,6c0.5,0,0.7896,0.3231,1,0.5L13.5,9H10c0,0-1,0-1-1V7C9,7,9,6,10,6z"/>',
    tank: '<polygon points="10,1 11,0 12,1 12,8 22,14 22,16 21,16 12,13 12,19 13,20 14,21 14,22 13,22 12,21 10,21 9.1,22 8,22 8,21 9,20 10,19 10,13 1,16 0,16 0,14 10,8"/>'
  };
  const sym = (k) => `<svg class="sym" viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="6" fill="var(--sym-bg)"/><g transform="translate(4 4)" fill="var(--sym-fg)">${SYM[k]}</g></svg>`;
  let sparks = {};
  function cardsInit() {
    $("cards").innerHTML = CARDS.map(c => `<div class="card" id="c-${c.k}">
      <div class="card-top"><span class="k">${sym(c.k)}<span class="lf">${c.label}</span><span class="ls">${c.short || c.label}</span></span><span class="v" id="v-${c.k}">-</span></div>
      <div class="d" id="d-${c.k}">&nbsp;</div>
      <canvas id="s-${c.k}" role="img" aria-label="${c.label}, 2007 to 2025"></canvas>
      ${c.k === "tank" ? '<div class="note" id="n-tank"></div>' : ""}</div>`).join("");
    CARDS.forEach(c => {
      const cv = $("s-" + c.k);
      cv.addEventListener("mousemove", e => { if (!fromTouch()) sparkHover(c.k, e); });
      cv.addEventListener("mouseleave", hideTip);
      cv.addEventListener("click", e => { const i = sparkIndex(c.k, e); if (i != null) { stop(); setIdx(i); } });
    });
  }
  const seriesFor = (k) => k === "tank" ? D.tank.flying : D.res[scope][k];
  function buildSparks() {
    if (!D) return;
    CARDS.forEach(c => {
      const cv = $("s-" + c.k), r = cv.getBoundingClientRect(), w = Math.max(1, r.width), h = 34;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const s = seriesFor(c.k); let mx = 0; s.forEach(v => { if (v != null && v > mx) mx = v; });
      const off = document.createElement("canvas"); off.width = cv.width; off.height = cv.height;
      const o = off.getContext("2d"); o.setTransform(dpr, 0, 0, dpr, 0, 0);
      const x = i => dayX(i, w), y = v => h - 2 - (mx ? v / mx : 0) * (h - 6);
      o.beginPath(); let started = false, lastX = 0;
      for (let i = 0; i < N; i++) { const v = s[i]; if (v == null) { started = false; continue; } const X = x(i), Y = y(v); if (!started) { o.moveTo(X, h); o.lineTo(X, Y); started = true; } else o.lineTo(X, Y); lastX = X; }
      o.lineTo(lastX, h); o.closePath(); o.fillStyle = colors["--spark-fill"]; o.fill();
      o.beginPath(); started = false;
      for (let i = 0; i < N; i++) { const v = s[i]; if (v == null) { started = false; continue; } const X = x(i), Y = y(v); if (!started) { o.moveTo(X, Y); started = true; } else o.lineTo(X, Y); }
      o.strokeStyle = colors["--spark"]; o.lineWidth = 1; o.globalAlpha = .9; o.stroke();
      sparks[c.k] = { off, w, h, mx, y };
    });
    drawSparkCursors();
  }
  function drawSparkCursors() {
    CARDS.forEach(c => {
      const sp = sparks[c.k]; if (!sp) return; const cv = $("s-" + c.k), g = cv.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(sp.off, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const X = dayX(idx, sp.w), v = seriesFor(c.k)[idx];
      g.strokeStyle = colors["--cursor"]; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, sp.h); g.stroke();
      if (v != null) { g.beginPath(); g.arc(X, sp.y(v), 3.5, 0, Math.PI * 2); g.fillStyle = colors["--cursor"]; g.fill(); g.lineWidth = 2; g.strokeStyle = colors["--panel"]; g.stroke(); }
    });
  }
  function sparkIndex(k, e) { const sp = sparks[k]; if (!sp) return null; const r = e.target.getBoundingClientRect(); return nearestIdx((e.clientX - r.left) / sp.w); }
  function sparkHover(k, e) {
    const i = sparkIndex(k, e); if (i == null) return; const v = seriesFor(k)[i];
    showTip(e, `<b>${shortDate(D.dates[i])}</b><br><span class="m">${v == null ? "no data" : fmt(v)}</span><br><span class="m">Click to jump here</span>`);
  }
  function delta(k) {
    const s = seriesFor(k), v = s[idx]; if (v == null || idx === 0) return "&nbsp;";
    let j = idx - 1; while (j >= 0 && s[j] == null) j--; if (j < 0) return "&nbsp;";
    const dv = v - s[j], cls = dv > 0 ? "up" : dv < 0 ? "down" : "";
    return `<span class="${cls}">${dv > 0 ? "+" : dv < 0 ? "−" : "±"}${fmt(Math.abs(dv))}</span> since ${shortDate(D.dates[j])}`;
  }

  // Animated counters: ease to the new value unless playback is fast or motion is reduced.
  const tweens = new Map(); let tweenRaf = 0;
  function setNum(el, v) {
    if (v == null) { tweens.delete(el); el.textContent = "No data"; el._v = null; return; }
    const from = el._v, fast = playing && parseFloat($("speed").value) > 8;
    if (reduced || fast || PRESENT_STEP || from == null || from === v) { tweens.delete(el); el._v = v; el.textContent = fmt(v); return; }
    tweens.set(el, { from, to: v, t0: performance.now() }); el._v = v;
    if (!tweenRaf) tweenRaf = requestAnimationFrame(runTweens);
  }
  function runTweens(t) {
    tweenRaf = 0;
    tweens.forEach((tw, el) => {
      const f = Math.min(1, (t - tw.t0) / 380), e = 1 - Math.pow(1 - f, 3);
      el.textContent = fmt(Math.round(tw.from + (tw.to - tw.from) * e));
      if (f >= 1) tweens.delete(el);
    });
    if (tweens.size) tweenRaf = requestAnimationFrame(runTweens);
  }

  const HUDN = [["personnel", "Personnel"], ["crews", "Crews"], ["engines", "Engines"], ["helicopters", "Helis"], ["tank", "Airtankers"]];
  const MININ = HUDN;   // phones, pinned map: the same five figures as the HUD
  function hudInit() {
    const SHORTL = { personnel: "Pers", crews: "Crews", engines: "Eng", helicopters: "Helis", tank: "Tankers" };
    $("miniNums").innerHTML = MININ.map(([k, l]) => `<button type="button" class="hn" data-k="${k}" aria-pressed="false" title="Show the ${l.toLowerCase()} trend"><span class="l"><span class="lf">${l}</span><span class="ls">${SHORTL[k]}</span></span><span class="v" id="mv-${k}">-</span></button>`).join("");
    // show the strip once the HUD has (almost) scrolled out of view
    new IntersectionObserver(([e]) => {
      const was = $("mini").classList.contains("on"), on = e.intersectionRatio < .15;
      $("mini").classList.toggle("on", on); $("pinbadge").classList.toggle("on", on);
      document.querySelector(".stage").classList.toggle("pinned", on);
      placePinned();
      if (on !== was && SHORT.matches && D) layout();   // refit the map around the strip (D-241)
      document.querySelector(".app").classList.toggle("locked", e.intersectionRatio < .02);   // HUD fully away: the list scrolls (D-244)
    }, { threshold: [0, .02, .15, .3] }).observe($("hud"));
    $("hudnums").innerHTML = HUDN.map(([k, l]) => `<button type="button" class="hn" data-k="${k}" aria-pressed="false" title="Show the ${l.toLowerCase()} trend"><span class="l">${l}</span><span class="v" id="hv-${k}">-</span></button>`).join("");
    $("gtiles").innerHTML = D.gaccs.map(g => `<button type="button" class="gt" data-g="${g}" aria-pressed="false">
      <span class="gc">${g}</span><span class="plc" id="gl-${g}">-</span>
      <span class="gp" id="gp-${g}">-</span><span class="gi" id="gf-${g}" hidden></span></button>`).join("");
    [$("hudnums"), $("miniNums")].forEach(el => el.addEventListener("click", e => { const b = e.target.closest(".hn[data-k]"); if (b) setTrend(b.dataset.k); }));
    $("gtiles").addEventListener("click", e => { const b = e.target.closest("button[data-g]"); if (b) setScope(b.dataset.g === scope ? "NATIONAL" : b.dataset.g); });
  }
  // Phones: tap a figure to show its trend card above the incident list; tap it again to clear (desktop shows all cards).
  let trend = null;
  function setTrend(k) {
    trend = trend === k ? null : k;
    CARDS.forEach(c => $("c-" + c.k).classList.toggle("sel", c.k === trend));
    $("cards").classList.toggle("has-sel", !!trend);
    document.querySelectorAll(".hn[data-k]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === trend)));
    requestAnimationFrame(() => {
      buildSparks();   // the card was hidden, so its sparkline had no width
      // Phones: the map and scrubber are pinned over the page, so bring the card out from under them if needed
      if (!trend || !PHONE.matches) return;
      const box = document.querySelector(".rail-body"), top = $("c-" + trend).getBoundingClientRect().top, edge = box.getBoundingClientRect().top + 8;
      if (top < edge) box.scrollBy({ top: top - edge, behavior: reduced ? "auto" : "smooth" });   // the list box scrolls (D-242)
    });
  }
  function hud() {
    const np = D.natpl[idx], chip = $("natplM"); chip.textContent = np || "-"; chip.style.background = np ? plColor(np) : ""; chip.classList.toggle("pl5", np === 5);
    $("dateM").innerHTML = `${fmtDate(D.dates[idx])}<small id="scopeM">${scope === "NATIONAL" ? "National totals" : `${GNAME[scope]} (${scope})<span class="taphint"> &middot; tap again for national</span>`}</small>`;
    HUDN.forEach(([k]) => setNum($("hv-" + k), seriesFor(k)[idx]));
    MININ.forEach(([k]) => setNum($("mv-" + k), seriesFor(k)[idx]));
    for (const id of ["miniPl", "pbPl"]) { const c = $(id); c.textContent = np || "-"; c.style.background = np ? plColor(np) : ""; c.classList.toggle("pl5", np === 5); }
    $("pbDate").innerHTML = `${shortDate(D.dates[idx])}${scope === "NATIONAL" ? "" : `<small>${scope}</small>`}`;
    $("miniDate").innerHTML = `<span class="wd">${DOW[new Date(D.dates[idx] + "T00:00:00Z").getUTCDay()]} </span>${shortDate(D.dates[idx])}${scope === "NATIONAL" ? "" : `<small>${scope}</small>`}`;
    const nat = scope === "NATIONAL";   // airtankers have no area split
    $("hv-tank").previousElementSibling.textContent = nat ? "Airtankers" : "Tankers, US";
    const ml = $("mv-tank").previousElementSibling;
    ml.querySelector(".lf").textContent = nat ? "Airtankers" : "Tankers, US"; ml.querySelector(".ls").textContent = nat ? "Tankers" : "Tank US";
    const ia = intlByArea();
    D.gaccs.forEach(g => {
      const pl = D.pl[g][idx], p = D.res[g].personnel[idx], b = $("gtiles").querySelector(`[data-g="${g}"]`), l = $("gl-" + g), it = ia[g];
      l.textContent = pl || "-"; l.className = "plc" + (pl ? "" : " none") + (pl === 5 ? " pl5" : ""); l.style.background = pl ? plColor(pl) : "";
      $("gp-" + g).textContent = p == null ? "-" : fmt(p);
      const gf = $("gf-" + g), fl = it ? [...it.p].join() + "|" + it.n : "";
      if (gf.dataset.k !== fl) { gf.dataset.k = fl; gf.hidden = !it; gf.innerHTML = it ? flags([...it.p]) + (it.n ? `<span>+${fmt(it.n)}</span>` : "") : ""; }
      b.setAttribute("aria-pressed", String(g === scope));
      b.title = `${GNAME[g]}: ${pl ? "PL " + pl : "PL not listed"}, ${p == null ? "no data" : fmt(p) + " personnel"}`
        + (it ? `; help from ${provNames([...it.p])}${it.n ? `, about ${fmt(it.n)} people` : ""}` : "");
    });
  }
  function panel() {
    const s = D.dates[idx];
    $("date").innerHTML = `${fmtDate(s)}<small id="dategap">${gapNote()}</small>`;
    const np = D.natpl[idx], chip = $("natpl"); chip.textContent = np || "-"; chip.style.background = np ? plColor(np) : ""; chip.classList.toggle("pl5", np === 5);
    chip.setAttribute("aria-label", np ? "National preparedness level " + np : "National PL not printed");
    CARDS.forEach(c => { setNum($("v-" + c.k), seriesFor(c.k)[idx]); $("d-" + c.k).innerHTML = delta(c.k); });
    const av = D.tank.available[idx];
    $("n-tank").innerHTML = (av == null ? "Availability: no data" : `On availability: ${fmt(av)}`) + (scope !== "NATIONAL" ? " &middot; national total, no area split" : "");
    const R = rows(idx), list = [];
    let total = 0;
    if (R) {
      const [Y, a, b] = R, gi = D.gaccs.indexOf(scope);
      const phone = PHONE.matches, cap = phone ? (playing ? INC_SLOTS : Infinity) : 8;
      for (let i = a; i < b; i++) { if (scope !== "NATIONAL" && Y.inc[i * F + C.gacc] !== gi) continue; total++; if (list.length < cap) list.push(i); }
      $("inctitle").textContent = !total ? "Incidents with personnel"
        : phone && playing && total > INC_SLOTS ? `Largest ${INC_SLOTS} of ${fmt(total)} incidents · pause for all`
        : `Largest of ${fmt(total)} incident${total === 1 ? "" : "s"} with personnel`;
      const pad = phone ? `<li class="slot" aria-hidden="true"><span class="nm">&nbsp;</span><span class="sub">&nbsp;</span></li>`.repeat(Math.max(0, INC_SLOTS - Math.max(1, list.length))) : "";
      $("inclist").innerHTML = (list.length ? list.map(i => {
        const o = i * F, g = D.gaccs[Y.inc[o + C.gacc]] || "";
        return `<li tabindex="0" data-i="${i}"><span class="nm">${esc(Y.names[Y.inc[o + C.name]])}</span><span class="pp">${fmt(Y.inc[o + C.pers])}</span>
          <span class="sub"><span class="gchip">${g}</span>${fmt(Y.inc[o + C.crews])} crews &middot; ${fmt(Y.inc[o + C.eng])} eng &middot; ${fmt(Y.inc[o + C.heli])} heli${Y.inc[o + C.has] ? "" : `<span class="nopt" title="Not drawn on the map: no single location (for example a statewide team covering many fires)">no map point</span>`}</span></li>`;
      }).join("") : `<li class="empty">No incidents with committed personnel in this report.</li>`) + pad;
    } else { $("inctitle").textContent = "Incidents with personnel"; $("inclist").innerHTML = `<li class="empty">Loading incidents.</li>`; }
    hud();
    $("scopename").textContent = scope === "NATIONAL" ? "National" : `${GNAME[scope]} (${scope})`;
    let clr = $("clearscope");
    if (scope !== "NATIONAL" && !clr) { $("scope").insertAdjacentHTML("beforeend", '<button class="btn" id="clearscope" type="button">National</button>'); $("clearscope").onclick = () => setScope("NATIONAL"); }
    if (scope === "NATIONAL" && clr) clr.remove();
    intlPanel();
    calloutPanel();
  }
  function gapNote() {
    if (idx + 1 >= N) return "Last report in the record";
    const g = dayOf[idx + 1] - dayOf[idx];
    return g > 1 ? `Next report ${g} days later (weekly off season)` : "Daily reports";
  }

  // ---------- timeline ----------
  let T0, T1;
  const dayX = (i, w) => (dayOf[i] - T0) / (T1 - T0) * w;
  function nearestIdx(f) {
    const t = T0 + Math.max(0, Math.min(1, f)) * (T1 - T0);
    let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (dayOf[m] <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  function layoutTrack() {
    const tc = $("trackc"), r = tc.getBoundingClientRect(), w = Math.max(1, r.width), h = 30;
    tc.width = Math.round(w * dpr); tc.height = Math.round(h * dpr);
    const g = tc.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const y0 = 6, th = h - 8;
    g.fillStyle = colors["--land"]; g.fillRect(0, y0 + 2, w, th - 4);
    for (let i = 0; i < N; i++) {
      const p = D.natpl[i]; if (!p) continue;
      const x0 = dayX(i, w), x1 = i + 1 < N ? Math.min(dayX(i + 1, w), x0 + w / (T1 - T0) * 7) : x0 + 1;
      const hh = p >= 4 ? th : 6 + (th - 12) * (p / 5);
      g.fillStyle = plColor(p); g.fillRect(x0, y0 + (th - hh) / 2, Math.max(.6, x1 - x0), hh);
    }
    g.fillStyle = colors["--ink2"];
    D.callouts.forEach(c => { if (c.kind !== "peak") return; const x = dayX(c.i, w); g.beginPath(); g.moveTo(x - 3, 0); g.lineTo(x + 3, 0); g.lineTo(x, 4); g.closePath(); g.fill(); });
    g.fillStyle = colors["--cursor"]; (D.intl || []).forEach(s => { const x0 = dayX(s.a, w), x1 = Math.max(x0 + 1.5, dayX(s.b, w)); g.fillRect(x0, h - 2, x1 - x0, 2); });
    const yrs = $("years"); let html = "";
    const step = Math.max(1, Math.ceil(28 / (w / 19)));   // a year label every k years, at least 28 px apart (D-241)
    for (let y = 2007; y <= 2025; y++) { const f = (Date.UTC(y, 0, 1) / 864e5 - T0) / (T1 - T0); if ((y - 2007) % step === 0) html += `<span style="left:${(f * 100).toFixed(2)}%">${y}</span>`; }
    yrs.innerHTML = html;
    $("slider").max = String(Math.round(T1 - T0));
    moveThumb();
  }
  function moveThumb() { const w = $("trackc").getBoundingClientRect().width; $("thumb").style.left = (dayX(idx, w) - 1) + "px"; $("slider").value = String(dayOf[idx] - T0); $("slider").setAttribute("aria-valuetext", fmtDate(D.dates[idx])); }

  // ---------- state & URL ----------
  function setIdx(i) {
    idx = Math.max(0, Math.min(N - 1, i));
    loadYear(yOf[idx]); if (playing) loadYear(yOf[idx] + 1);
    draw(); panel(); drawSparkCursors(); moveThumb(); if (!playing) writeHash();
  }
  function setScope(s) { scope = s; baseKey = ""; buildSparks(); draw(); panel(); writeHash(); }
  function setMode(m) { mode = m; MODES.forEach(k => $("m-" + k).setAttribute("aria-pressed", String(k === m))); trail = null; draw(); writeHash(); }
  const PHONE = matchMedia("(max-width: 860px)"), INC_SLOTS = 5;
  PHONE.addEventListener("change", () => { if (D) panel(); });
  const READ_MS = 5000, READ_RATE = 2;   // reports per second while a new callout is read
  let slowUntil = 0;
  function play() {
    if (idx >= N - 1) idx = 0; playing = true; document.body.classList.add("playing"); $("play").innerHTML = "&#10074;&#10074;"; $("play").setAttribute("aria-label", "Pause"); if (PHONE.matches) panel();
    last = performance.now(); acc = 0; requestAnimationFrame(tick);
  }
  function stop() { if (!playing) return; playing = false; slowUntil = 0; $("callout").classList.remove("reading"); document.body.classList.remove("playing"); $("play").innerHTML = "&#9654;"; $("play").setAttribute("aria-label", "Play"); writeHash(); if (PHONE.matches) panel(); }
  function tick(t) {
    if (!playing) return;
    const sp = parseFloat($("speed").value);
    acc += (t - last) / 1000 * (t < slowUntil ? Math.min(sp, READ_RATE) : sp); last = t;
    if (acc >= 1) {
      const n = Math.floor(acc); acc -= n;
      if (rows(Math.min(N - 1, idx + n)) == null) { acc = 0; loadYear(yOf[Math.min(N - 1, idx + n)]); } // wait for next year's file
      else if (idx + n >= N - 1) { setIdx(N - 1); stop(); return; } else setIdx(idx + n);
    }
    requestAnimationFrame(tick);
  }
  function writeHash() {
    if (!D || PRESENT) return;
    const h = "#" + [D.dates[idx], scope !== "NATIONAL" ? scope : "", mode !== "heat" ? mode : ""].filter(Boolean).join("/");
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  function readHash() {
    const parts = decodeURIComponent(location.hash.slice(1)).split("/").filter(Boolean);
    const out = {};
    parts.forEach(p => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(p)) out.date = p;
      else if (D.gaccs.includes(p.toUpperCase())) out.scope = p.toUpperCase();
      else if (MODES.includes(p)) out.mode = p;
    });
    return out;
  }
  function idxForDate(s) { const t = Date.parse(s + "T00:00:00Z") / 864e5; return isNaN(t) ? null : nearestIdx((t - T0) / (T1 - T0)); }
  window.addEventListener("hashchange", () => {
    if (!D || location.hash.startsWith("#stats")) return; const h = readHash();
    if (h.scope || h.scope === undefined) scope = h.scope || "NATIONAL";
    if (h.mode) setMode(h.mode);
    if (h.date) { const i = idxForDate(h.date); if (i != null) { stop(); setIdx(i); } }
    baseKey = ""; buildSparks(); draw(); panel();
  });

  // ---------- tooltip & map hit ----------
  const tip = $("tip");
  // Tooltips are for a mouse. A tap fires a mouse move too, so ignore moves that follow a touch (v2.4).
  let lastTouch = -1e9;
  document.addEventListener("touchstart", () => { lastTouch = performance.now(); hideTip(); }, { passive: true, capture: true });
  const fromTouch = () => performance.now() - lastTouch < 1000;
  function showTip(e, html) {
    tip.innerHTML = html; tip.hidden = false;
    const host = $("mapwrap").contains(e.target) ? $("mapwrap") : document.body;
    if (tip.parentElement !== host) host.appendChild(tip);
    tip.style.position = host === document.body ? "fixed" : "absolute";
    const r = host === document.body ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : host.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > r.width - 8) x = e.clientX - r.left - tw - 14;
    if (y + th > r.height - 8) y = e.clientY - r.top - th - 14;
    tip.style.left = Math.max(4, x) + "px"; tip.style.top = Math.max(4, y) + "px";
  }
  function hideTip() { tip.hidden = true; }
  function incAt(x, y) {
    const R = rows(idx); if (!R) return null; const [Y, a, b] = R;
    let best = -1, bd = 14 * 14;
    for (let i = a; i < b; i++) { if (isNaN(Y.px[i])) continue; const dx = Y.px[i] - x, dy = Y.py[i] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best >= 0 ? [Y, best] : null;
  }
  function gaccAt(x, y) { for (const g of D.gaccs) if (gpaths[g] && hit.isPointInPath(gpaths[g], x, y)) return g; return null; }
  function mapPos(e) { const r = map.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  map.addEventListener("mousemove", e => {
    if (!D || fromTouch()) return; const [x, y] = mapPos(e);
    const f = mode !== "pl" ? incAt(x, y) : null;
    if (f) { const [Y, i] = f, o = i * F; showTip(e, `<b>${esc(Y.names[Y.inc[o + C.name]])}</b> <span class="gchip">${D.gaccs[Y.inc[o + C.gacc]] || ""}</span><br><span class="m">${fmt(Y.inc[o + C.pers])} personnel &middot; ${fmt(Y.inc[o + C.crews])} crews<br>${fmt(Y.inc[o + C.eng])} engines &middot; ${fmt(Y.inc[o + C.heli])} helicopters</span>`); map.style.cursor = "pointer"; return; }
    const g = gaccAt(x, y);
    if (g) { const pl = D.pl[g][idx], p = D.res[g].personnel[idx]; showTip(e, `<b>${GNAME[g]}</b> <span class="gchip">${g}</span><br><span class="m">${pl ? "PL " + pl : "PL not listed in this report"} &middot; ${p == null ? "no data" : fmt(p) + " personnel"}</span><br><span class="m">Click to show this area</span>`); map.style.cursor = "pointer"; }
    else { hideTip(); map.style.cursor = "default"; }
  });
  map.addEventListener("mouseleave", hideTip);
  map.addEventListener("click", e => { if (!D) return; const [x, y] = mapPos(e); const g = gaccAt(x, y); setScope(!g || g === scope ? "NATIONAL" : g); });

  // ---------- controls ----------
  $("play").onclick = () => playing ? stop() : play();
  MODES.forEach(m => $("m-" + m).onclick = () => setMode(m));
  function stepButton(el, d) {
    let hold = 0, rep = 0, held = false;
    const end = () => { clearTimeout(hold); clearInterval(rep); };
    el.addEventListener("pointerdown", () => { held = false; end(); hold = setTimeout(() => { held = true; rep = setInterval(() => setIdx(idx + d), 110); }, 420); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el.addEventListener(ev, end));
    el.addEventListener("click", () => { if (held) { held = false; return; } stop(); setIdx(idx + d); });
    el.addEventListener("contextmenu", e => e.preventDefault());   // long press on phones
  }
  stepButton($("prev"), -1); stepButton($("next"), 1);
  $("slider").addEventListener("input", e => { stop(); setIdx(nearestIdx(+e.target.value / (T1 - T0))); });
  $("trackc").parentElement.addEventListener("mousemove", e => {
    if (!D || fromTouch()) return; const r = $("trackc").getBoundingClientRect(); const i = nearestIdx((e.clientX - r.left) / r.width);
    showTip(e, `<b>${shortDate(D.dates[i])}</b><br><span class="m">National PL ${D.natpl[i] || "not printed"}</span>`);
  });
  $("trackc").parentElement.addEventListener("mouseleave", hideTip);
  $("inclist").addEventListener("mouseover", e => { const li = e.target.closest("li[data-i]"); if (li) flash(+li.dataset.i); });
  $("inclist").addEventListener("focusin", e => { const li = e.target.closest("li[data-i]"); if (li) flash(+li.dataset.i); });
  $("inclist").addEventListener("mouseleave", () => { stopFlash(); draw(); });
  // a tap or click also rings the incident (not every touch browser sends a mouseover on tap)
  $("inclist").addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) flash(+li.dataset.i); });
  // Incident ring (v2.7): dark halo, white ring, sky-blue dashes on top, so it reads on bright heat and on pale land.
  // A new pick pulses outward for about 1.5 s, then the ring stays. Under reduced motion (D-244) the rings do not
  // grow: a still glow behind the ring fades out over the same 1.5 s instead.
  const RING = { halo: "rgba(5, 7, 10, .8)", white: "#ffffff", blue: "#38bdf8" };
  let flashRaf = 0, flashKey = "", picked = null;
  function ring(x, y, r, a = 1) {
    ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 6; ctx.strokeStyle = RING.halo; ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = RING.white; ctx.stroke();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = RING.blue; ctx.stroke(); ctx.restore();
  }
  function stopFlash() { cancelAnimationFrame(flashRaf); flashRaf = 0; flashKey = ""; picked = null; }
  function flash(i) {
    const Y = yearOf(idx), key = idx + ":" + i;
    if (key === flashKey && picked) return;  // same incident, ring still showing: keep it
    stopFlash(); draw();
    if (!Y.px || isNaN(Y.px[i])) return;
    picked = { i, at: idx };
    const x = Y.px[i], y = Y.py[i], t0 = performance.now(), D_MS = 1500, at = idx;
    flashKey = key;
    // the map is drawn once and copied; each frame puts the copy back and draws only the rings
    const snap = document.createElement("canvas"); snap.width = map.width; snap.height = map.height;
    snap.getContext("2d").drawImage(map, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ring(x, y, 11);
    const step = (t) => {
      if (idx !== at || flashKey !== key) return;
      const f = (t - t0) / D_MS;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(snap, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (f < 1 && reduced) {
        ctx.save(); ctx.globalAlpha = .55 * (1 - f); ctx.fillStyle = RING.blue;
        ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ring(x, y, 11);
        flashRaf = requestAnimationFrame(step);
      } else if (f < 1) {
        for (const off of [0, .5]) {   // two waves, half a cycle apart
          const k = ((f * 3) + off) % 1;
          ring(x, y, 11 + 26 * k, (1 - k) * .9);
        }
        ring(x, y, 11);
        flashRaf = requestAnimationFrame(step);
      } else { ring(x, y, 11); flashRaf = 0; }
    };
    flashRaf = requestAnimationFrame(step);
  }
  const about = $("about");
  const openAbout = () => { stop(); about.showModal(); };
  $("aboutbtn").onclick = $("aboutM").onclick = openAbout; $("aboutlink").onclick = openAbout; $("aboutclose").onclick = () => about.close();
  about.addEventListener("click", e => { if (e.target === about) about.close(); });
  document.addEventListener("keydown", e => {
    if (!D || about.open) return;
    if (!$("stats").hidden) { if (e.key === "Escape") closeStats(); return; }
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName) && e.key !== " ") return;
    if (e.key === " " && document.activeElement.tagName !== "BUTTON") { e.preventDefault(); playing ? stop() : play(); }
    else if (e.key === "ArrowRight") { stop(); setIdx(idx + (e.shiftKey ? 30 : 1)); }
    else if (e.key === "ArrowLeft") { stop(); setIdx(idx - (e.shiftKey ? 30 : 1)); }
  });
  const ro = new ResizeObserver(() => { if (D) layout(); }); ro.observe($("mapwrap")); ro.observe($("cards"));
  // Phones: the stage is sticky with top = minus the HUD height, so the HUD scrolls away and map and scrubber stay.
  // The callout sits above the scrubber on desktop (offset by its height) and below it on phones.
  // Short phones, pinned (v3.2, D-242): the date/PL badge takes the arrows' place at the top right and the
  // arrows go to the bottom right beside the callout. Elsewhere both keep their usual places.
  function placePinned() {
    const swap = SHORT.matches && document.querySelector(".stage").classList.contains("pinned");
    const tools = document.querySelector(".maptools"), stage = document.querySelector(".stage");
    if (swap && $("pinbadge").parentElement !== tools) { tools.appendChild($("pinbadge")); stage.appendChild($("stepper")); }
    if (!swap && $("stepper").parentElement !== tools) { tools.appendChild($("stepper")); stage.appendChild($("pinbadge")); }
  }
  SHORT.addEventListener("change", placePinned);
  function stick() { const st = document.querySelector(".stage"); st.style.setProperty("--stick", -$("hud").offsetHeight + "px"); document.documentElement.style.setProperty("--hudh", $("hud").offsetHeight + "px"); st.style.setProperty("--scrubh", document.querySelector(".scrub").offsetHeight + "px"); }
  new ResizeObserver(stick).observe($("hud")); new ResizeObserver(stick).observe(document.querySelector(".scrub")); stick();
  const retheme = () => { if (!D) return; readColors(); baseKey = ""; trail = null; layoutTrack(); buildSparks(); draw(); panel(); };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retheme);
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // ---------- stats sheet (v3.0, thesis D-240) ----------
  // assets/stats.js loads on first use. Opening pushes a #stats/<tab> history entry, so a phone's Back button
  // closes the sheet; jumping to the map replaces that entry with the date.
  let statsLoad = null;
  const loadStats = () => window.StrainStats ? Promise.resolve() : (statsLoad = statsLoad || new Promise((ok, bad) => {
    const s = document.createElement("script"); s.src = "assets/stats.js?v=" + ASSET_V; s.onload = ok;
    s.onerror = () => { statsLoad = null; bad(new Error("stats.js")); }; document.head.appendChild(s); }));
  function showStats(tab, push) {
    if (!D) return; stop();
    loadStats().then(() => {
      const was = !$("stats").hidden;
      window.StrainStats.open(tab);
      const h = "#stats/" + window.StrainStats.tab;
      if (push && !was) history.pushState({ stats: 1 }, "", h); else history.replaceState(history.state, "", h);
    }).catch(err => console.error("stats", err));
  }
  function closeStats(fromPop) {
    if ($("stats").hidden) return;
    window.StrainStats.close();
    if (!fromPop && history.state && history.state.stats) history.back(); else if (!fromPop) writeHash();
    $("statsbtn").focus({ preventScroll: true });
  }
  function jumpTo(i, name) {   // from the stats sheet: open report i on the map, ring the named incident
    if (window.StrainStats) window.StrainStats.close();
    stop(); setIdx(i);         // writeHash replaces the #stats entry with the date
    window.scrollTo(0, 0);
    if (name) Promise.resolve(loadYear(yOf[i])).then(() => {
      const R = rows(idx); if (!R) return; const [Y, a, b] = R;
      for (let k = a; k < b; k++) if (Y.names[Y.inc[k * F + C.name]] === name) { flash(k); break; }
    });
  }
  $("statsbtn").onclick = () => showStats(undefined, true);
  // short phones: the callout shows its headline; a tap opens or folds the full text (D-241)
  $("callout").addEventListener("click", () => { if (SHORT.matches) $("callout").classList.toggle("more"); });
  $("statsclose").onclick = () => closeStats();
  window.addEventListener("popstate", () => {
    if (location.hash.startsWith("#stats")) { if ($("stats").hidden) showStats(location.hash.split("/")[1], false); }
    else closeStats(true);
  });

  // ---------- boot ----------
  fetch("data/core.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    D = d; N = D.dates.length; D.gaccs = D.meta.gaccs;
    dayOf = D.dates.map(s => Date.parse(s + "T00:00:00Z") / 864e5);
    T0 = Date.UTC(2007, 0, 1) / 864e5; T1 = Date.UTC(2026, 0, 1) / 864e5;
    yOf = new Int16Array(N);
    D.meta.years.forEach((y, k) => { years.push({ year: y.year, i0: y.i0, i1: y.i1 }); for (let i = y.i0; i < y.i1; i++) yOf[i] = k; });
    $("ver").textContent = `Version ${RELEASE.v}, released ${shortDate(RELEASE.date)}.
First released ${shortDate(RELEASE.first)}.
Created by SEC with the Claude Code`;
    const h = readHash();
    const p = D.res.NATIONAL.personnel; let best = 0; p.forEach((v, i) => { if (v != null && v > (p[best] || 0)) best = i; });
    idx = h.date ? (idxForDate(h.date) ?? best) : best;   // default: the busiest report in the record
    if (h.scope) scope = h.scope; if (h.mode) mode = h.mode;
    MODES.forEach(k => $("m-" + k).setAttribute("aria-pressed", String(k === mode)));
    $("loading").remove(); readColors(); cardsInit(); hudInit(); layout(); panel();
    loadYear(yOf[idx]); loadReliefs();
    if (location.hash.startsWith("#stats")) showStats(location.hash.split("/")[1], false);
    window.strainTimeline = api;
    document.dispatchEvent(new Event("strain-ready"));
  }).catch(err => { $("loading").textContent = "Could not load the data. Reload the page to try again."; console.error(err); });

  // Small API for scripted capture (video): deterministic stepping, waits for year files.
  const api = {
    get index() { return idx; }, get count() { return N; }, dates: () => D.dates,
    async go(dateOrIdx, opts = {}) {
      const i = typeof dateOrIdx === "number" ? dateOrIdx : idxForDate(dateOrIdx);
      await loadYear(yOf[i]); if (opts.scope) { scope = opts.scope; baseKey = ""; buildSparks(); }
      PRESENT_STEP = !!opts.trail; setIdx(i); PRESENT_STEP = false; return i;
    },
    setMode, setScope,
    data: () => D,
    yearData(y) { const yi = years.findIndex(Y => Y.year === y); return Promise.resolve(loadYear(yi)).then(() => years[yi]); },
    jump: (i, name) => jumpTo(i, name),
    caption(c, alpha = 1) {   // c: {t, s, u, big} or null; alpha 0..1, set per frame by the capture script
      const el = $("cap"); if (!c || alpha <= 0) { el.innerHTML = ""; el.className = ""; el.style.opacity = 0; return; }
      el.className = c.big ? "big" : ""; el.style.opacity = alpha;
      el.innerHTML = `<div class="box"><div class="t">${c.t || ""}</div>${c.s ? `<div class="s">${c.s}</div>` : ""}${c.u ? `<div class="u">${c.u}</div>` : ""}</div>`;
    },
    get ready() { return Object.values(reliefs).every(R => R.levels.some(L => L.img)) && !!rows(idx); }
  };
})();
