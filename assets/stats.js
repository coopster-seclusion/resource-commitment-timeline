/* Stats sheet (v3.0, thesis D-240). Loaded on first use by app.js; reads the data the page already holds
   (window.strainTimeline.data()) and, for the incident leaderboard only, the per-year incident files.
   Four tabs: Seasons (calendar, area season shapes), Years (year in review), Records (records, biggest incidents),
   Thesis view (preparedness level against committed personnel). Every tappable item can open the map on its date. */
(() => {
  "use strict";
  const T = () => window.strainTimeline;
  const $ = (id) => document.getElementById(id);
  const fmt = d3.format(",");
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const GNAME = { NWCC: "Northwest", ONCC: "Northern California", OSCC: "Southern California", NRCC: "Northern Rockies",
    GBCC: "Great Basin", SWCC: "Southwest", RMCC: "Rocky Mountain", EACC: "Eastern Area", SACC: "Southern Area", AICC: "Alaska" };
  const TABS = [["seasons", "Seasons"], ["years", "Years"], ["records", "Records"], ["thesis", "Thesis view"]];
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const ymd = (s) => [+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)];
  const shortDate = (s) => { const [y, m, d] = ymd(s); return `${d} ${MON[m]} ${y}`; };
  const doy = (s) => { const [y, m, d] = ymd(s); return (Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 864e5; };
  const week = (s) => Math.min(52, Math.floor(doy(s) / 7));
  const part = (d) => d <= 10 ? "early" : d <= 20 ? "mid" : "late";
  const weekLabel = (w) => { const t = new Date(Date.UTC(2021, 0, 1 + w * 7 + 3)); return `${part(t.getUTCDate())} ${MON[t.getUTCMonth()]}`; };

  let D = null, N = 0, YEARS = [], tab = "seasons", calScope = "NATIONAL", yearMetric = "peak", plMode = "national";
  let calSel = null, yearSel = null, thesisSel = null, top = null, topLoading = null;

  function init() {
    if (D) return;
    D = T().data(); N = D.dates.length;
    YEARS = D.meta.years.map(y => y.year);
  }

  // ---------- derived series ----------
  const series = (scope, f = "personnel") => D.res[scope][f];
  function weekly(scope) {   // {v[year][week], i[year][week]}: busiest report in each week
    const s = series(scope), v = YEARS.map(() => new Array(53).fill(null)), ix = YEARS.map(() => new Array(53).fill(-1));
    for (let i = 0; i < N; i++) {
      const y = +D.dates[i].slice(0, 4) - YEARS[0], w = week(D.dates[i]), x = s[i];
      if (x == null) continue;
      if (v[y][w] == null || x > v[y][w]) { v[y][w] = x; ix[y][w] = i; }
    }
    return { v, ix };
  }
  function yearStats() {
    const nat = series("NATIONAL");
    return D.meta.years.map(Y => {
      let pk = Y.i0, pl45 = 0, areas = 0, areasI = Y.i0, first5 = null;
      for (let i = Y.i0; i < Y.i1; i++) {
        if ((nat[i] || 0) > (nat[pk] || 0)) pk = i;
        if (D.natpl[i] >= 4) pl45++;
        if (D.natpl[i] === 5 && first5 == null) first5 = i;
        const n = D.meta.gaccs.reduce((t, g) => t + (D.pl[g][i] >= 4 ? 1 : 0), 0);
        if (n > areas) { areas = n; areasI = i; }
      }
      const busiest = D.meta.gaccs.reduce((b, g) => (series(g)[pk] || 0) > (series(b)[pk] || 0) ? g : b, D.meta.gaccs[0]);
      const call = D.callouts.find(c => c.kind === "peak" && c.date.slice(0, 4) === String(Y.year));
      return { year: Y.year, pk, peak: nat[pk] || 0, pl45, areas, areasI, first5, busiest, call };
    });
  }

  const availWidth = () => Math.max(280, Math.min(980, ($("statsbody").clientWidth || 360) - 32));

  // ---------- shell ----------
  function open(t) {
    init();
    if (t && TABS.some(([k]) => k === t)) tab = t;
    const el = $("stats");
    el.hidden = false; document.body.classList.add("stats-open");
    $("statstabs").innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("");
    render();
    $("statsclose").focus({ preventScroll: true });
  }
  function close() { $("stats").hidden = true; document.body.classList.remove("stats-open"); }
  function setTab(k) {
    tab = k;
    $("statstabs").querySelectorAll("[role=tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === k)));
    render(); $("statsbody").scrollTop = 0;
    history.replaceState(history.state, "", "#stats/" + k);
  }
  function render() {
    if (!D || $("stats").hidden) return;
    const b = $("statsbody");
    b.innerHTML = tab === "seasons" ? seasonsHTML() : tab === "years" ? yearsHTML() : tab === "records" ? recordsHTML() : thesisHTML();
    if (tab === "records") loadTop();
  }
  const go = (i, name) => T().jump(+i, name || null);

  // ---------- Seasons ----------
  function seasonsHTML() {
    const { v, ix } = weekly(calScope);
    let mx = 0; v.forEach(r => r.forEach(x => { if (x > mx) mx = x; }));
    const heat = ["--heat0", "--heat1", "--heat2", "--heat3", "--heat4"].map(css);
    const col = d3.scaleLinear().domain([0, .25, .5, .75, 1]).range(heat).interpolate(d3.interpolateRgb).clamp(true);
    // drawn at the sheet's real width, so labels keep their size on a phone (redrawn on resize)
    const avail = availWidth(), LW = 34, CW = (avail - LW) / 53, CH = avail < 500 ? 12 : 15, TOP = 16;
    const W = avail, H = TOP + YEARS.length * (CH + 1);
    const cur = +D.dates[T().index].slice(0, 4);
    let cells = "";
    YEARS.forEach((yr, y) => {
      cells += `<text x="${LW - 6}" y="${TOP + y * (CH + 1) + CH * .72}" text-anchor="end" class="ax${yr === cur ? " cur" : ""}">${yr}</text>`;
      for (let w = 0; w < 53; w++) {
        const x = v[y][w]; if (x == null) continue;
        const sel = calSel && calSel.y === y && calSel.w === w;
        cells += `<rect x="${(LW + w * CW).toFixed(1)}" y="${TOP + y * (CH + 1)}" width="${Math.max(1, CW - 1).toFixed(1)}" height="${CH}" rx="1.5" data-y="${y}" data-w="${w}"`
          + ` fill="${x > 0 ? col(Math.sqrt(x / mx)) : "var(--land)"}"${sel ? ' class="sel"' : ""}><title>${shortDate(D.dates[ix[y][w]])}: ${fmt(x)}</title></rect>`;
      }
    });
    for (let m = 0; m < 12; m++) {
      const w = doy(`2021-${String(m + 1).padStart(2, "0")}-01`) / 7;
      if (avail >= 500 || m % 2 === 0) cells += `<text x="${(LW + w * CW).toFixed(1)}" y="10" class="ax">${MON[m]}</text>`;
    }
    const opts = ["NATIONAL", ...D.meta.gaccs].map(g => `<option value="${g}"${g === calScope ? " selected" : ""}>${g === "NATIONAL" ? "National" : GNAME[g] + " (" + g + ")"}</option>`).join("");
    let info = `<span class="muted">Tap a week to see its busiest report.</span>`;
    if (calSel && ix[calSel.y][calSel.w] >= 0) {
      const i = ix[calSel.y][calSel.w];
      info = `<span><b>${shortDate(D.dates[i])}</b>: ${fmt(v[calSel.y][calSel.w])} personnel committed${calScope === "NATIONAL" ? "" : " in " + esc(GNAME[calScope])} (busiest report that week)</span>`
        + `<button type="button" class="st-go" data-i="${i}">Open on map</button>`;
    }
    return `<section class="st-sec">
      <div class="st-row"><h3>Season calendar</h3><select id="calscope" aria-label="Area">${opts}</select></div>
      <p class="st-lead">Each row is a year, each cell a week, coloured by the most personnel committed on any report that week.</p>
      <svg class="cal" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly committed personnel, 2007 to 2025">${cells}</svg>
      <div class="st-key"><span>fewer</span><span class="ramp" style="background:linear-gradient(90deg,${heat.join(",")})"></span><span>more personnel</span><span class="sw0"></span><span>none listed</span></div>
      <div class="st-info" id="calinfo">${info}</div>
    </section>
    <section class="st-sec">
      <h3>When each area peaks</h3>
      <p class="st-lead">Average season shape, 2007 to 2025: each area's busiest report per week, averaged over the years and scaled to its own highest week. Areas peak at different times, which one national number hides.</p>
      <div class="peaks">${peaksHTML()}</div>
    </section>`;
  }
  function peaksHTML() {
    return D.meta.gaccs.map(g => {
      const { v } = weekly(g), m = new Array(53).fill(0), n = new Array(53).fill(0);
      v.forEach(r => r.forEach((x, w) => { if (x != null) { m[w] += x; n[w]++; } }));
      const avg = m.map((s, w) => n[w] ? s / n[w] : 0), mx = Math.max(...avg) || 1, pw = avg.indexOf(mx);
      const W = 160, H = 46, xs = (w) => w / 52 * W, ys = (a) => H - 2 - a / mx * (H - 6);
      const line = avg.map((a, w) => `${w ? "L" : "M"}${xs(w).toFixed(1)},${ys(a).toFixed(1)}`).join("");
      return `<div class="peak"><div class="pk-t"><b>${esc(GNAME[g])}</b><span>${g}</span></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${line}L${W},${H}L0,${H}Z" class="pk-a"/><path d="${line}" class="pk-l"/>
        <line x1="${xs(pw)}" x2="${xs(pw)}" y1="0" y2="${H}" class="pk-m"/></svg>
        <div class="pk-s">Peaks ${weekLabel(pw)} · about ${fmt(Math.round(mx / 10) * 10)} personnel then</div></div>`;
    }).join("");
  }

  // ---------- Years ----------
  const METRICS = { peak: ["Peak personnel", s => s.peak, s => fmt(s.peak)],
    pl45: ["Report days at National PL 4 or 5", s => s.pl45, s => fmt(s.pl45)],
    areas: ["Most areas at PL 4 or 5 at once", s => s.areas, s => `${s.areas} of 10`] };
  function yearsHTML() {
    const ys = yearStats(), [label, val, show] = METRICS[yearMetric], mx = Math.max(...ys.map(val)) || 1;
    const cur = +D.dates[T().index].slice(0, 4);
    const seg = Object.entries(METRICS).map(([k, [l]]) => `<button type="button" data-metric="${k}" aria-pressed="${k === yearMetric}">${{ peak: "Peak", pl45: "Days PL 4–5", areas: "Areas PL 4+" }[k]}</button>`).join("");
    const rows = ys.map(s => {
      const open = yearSel === s.year;
      let det = "";
      if (open) {
        const c = s.call;
        det = `<div class="yr-det">
          <div><span class="k">Busiest report</span><b>${shortDate(D.dates[s.pk])}</b>, ${fmt(s.peak)} personnel; most in ${esc(GNAME[s.busiest])}</div>
          ${c && c.top ? `<div><span class="k">Largest incident that day</span><b>${esc(c.top)}</b>${c.gacc ? ` (${esc(GNAME[c.gacc] || c.gacc)})` : ""}, ${fmt(c.top_personnel)} personnel</div>` : ""}
          <div><span class="k">First National PL 5</span>${s.first5 != null ? `<b>${shortDate(D.dates[s.first5])}</b>` : "not reached"}</div>
          <div><span class="k">At National PL 4 or 5</span>${fmt(s.pl45)} report days · up to ${s.areas} of 10 areas at PL 4+ at once</div>
          <div class="yr-go"><button type="button" class="st-go" data-i="${s.pk}">Open busiest report on map</button>${s.first5 != null ? `<button type="button" class="st-go ghost" data-i="${s.first5}">Open first PL 5</button>` : ""}</div></div>`;
      }
      return `<li><button type="button" class="yr${open ? " open" : ""}${s.year === cur ? " cur" : ""}" data-year="${s.year}" aria-expanded="${open}">
        <span class="yr-y">${s.year}</span><span class="yr-bar"><span style="width:${(val(s) / mx * 100).toFixed(1)}%"></span></span><span class="yr-v">${show(s)}</span></button>${det}</li>`;
    }).join("");
    return `<section class="st-sec"><h3>Year in review</h3>
      <div class="seg" role="group" aria-label="Measure">${seg}</div>
      <p class="st-lead">${label}, 2007 to 2025. Tap a year for its busiest day and first PL 5.${yearMetric === "pl45" ? " Reports are daily in the fire season, so report days at PL 4 or 5 are close to calendar days." : ""}</p>
      <ul class="years">${rows}</ul></section>`;
  }

  // ---------- Records ----------
  function records() {
    const nat = series("NATIONAL"), arg = (a) => { let b = 0; for (let i = 1; i < a.length; i++) if ((a[i] || 0) > (a[b] || 0)) b = i; return b; };
    const out = [];
    const p = arg(nat); out.push(["Busiest report", `${fmt(nat[p])} personnel`, p]);
    for (const [f, l] of [["crews", "crews"], ["engines", "engines"], ["helicopters", "helicopters"]]) { const i = arg(series("NATIONAL", f)); out.push([`Most ${l} committed`, fmt(series("NATIONAL", f)[i]), i]); }
    let best = [0, -1, -1], run = 0, start = -1;   // longest run of consecutive reports at National PL 5
    for (let i = 0; i < N; i++) { if (D.natpl[i] === 5) { if (!run) start = i; run++; if (run > best[0]) best = [run, start, i]; } else run = 0; }
    if (best[1] >= 0) out.push(["Longest run at National PL 5", `${best[0]} reports`, best[1], `${shortDate(D.dates[best[1]])} to ${shortDate(D.dates[best[2]])}`]);
    const p5 = D.callouts.filter(c => c.kind === "pl5").sort((a, b) => doy(a.date) - doy(b.date));
    if (p5.length) out.push(["Earliest National PL 5 in a year", shortDate(p5[0].date), p5[0].i, "the year's first report at PL 5"]);
    let am = 0, ai = 0; for (let i = 0; i < N; i++) { const n = D.meta.gaccs.reduce((t, g) => t + (D.pl[g][i] >= 4 ? 1 : 0), 0); if (n > am) { am = n; ai = i; } }
    out.push(["Most areas at PL 4 or 5 at once", `${am} of 10`, ai]);
    const tf = D.tank.flying, ti = arg(tf); if (tf[ti] != null) out.push(["Most large airtankers flying in a day", fmt(tf[ti]), ti]);
    return out;
  }
  function recordsHTML() {
    const cards = records().map(([k, v, i, sub]) => `<button type="button" class="rec st-go" data-i="${i}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${sub || shortDate(D.dates[i])}</span></button>`).join("");
    return `<section class="st-sec"><h3>Records, 2007 to 2025</h3><p class="st-lead">National figures from the situation reports. Tap a record to open that day on the map.</p>
      <div class="recs">${cards}</div></section>
      <section class="st-sec"><h3>Biggest incidents</h3><p class="st-lead">The 20 incidents with the most personnel committed on a single report. Tap one to open its peak day on the map with the incident ringed.</p>
      <ol class="top" id="toplist">${topHTML()}</ol></section>`;
  }
  function topHTML() {
    if (!top) return `<li class="muted">Loading 19 years of incidents</li>`;
    return top.map((t, k) => `<li><button type="button" class="st-go" data-i="${t.i}" data-name="${esc(t.name)}"><span class="rk">${k + 1}</span>`
      + `<span class="nm">${esc(t.name)}<small>${t.year} · ${t.gacc} · peak ${shortDate(D.dates[t.i])}${t.has ? "" : " · no map point"}</small></span><span class="pp">${fmt(t.pers)}</span></button></li>`).join("");
  }
  function loadTop() {
    if (top || topLoading) return;
    topLoading = Promise.all(YEARS.map(y => T().yearData(y))).then(Ys => {
      const best = new Map();
      Ys.forEach(Y => {
        if (!Y || !Y.inc) return;
        for (let d = 0; d < Y.off.length - 1; d++) for (let r = Y.off[d]; r < Y.off[d + 1]; r++) {
          const o = r * 9, name = Y.names[Y.inc[o + 6]], key = Y.year + "|" + name, p = Y.inc[o + 2];
          const b = best.get(key);
          if (!b || p > b.pers) best.set(key, { name, year: Y.year, pers: p, i: Y.i0 + d, gacc: D.meta.gaccs[Y.inc[o + 7]] || "", has: !!Y.inc[o + 8] });
        }
      });
      top = [...best.values()].sort((a, b) => b.pers - a.pers).slice(0, 20);
      if (tab === "records" && $("toplist")) $("toplist").innerHTML = topHTML();
    }).catch(e => { topLoading = null; if ($("toplist")) $("toplist").innerHTML = `<li class="muted">Could not load the incident files.</li>`; console.error(e); });
  }

  // ---------- Thesis view ----------
  function plData() {
    const by = [[], [], [], [], []];
    if (plMode === "national") {
      const s = series("NATIONAL");
      for (let i = 0; i < N; i++) if (D.natpl[i] && s[i] != null) by[D.natpl[i] - 1].push(s[i]);
    } else {
      D.meta.gaccs.forEach(g => {
        const s = series(g), vals = s.filter(x => x != null).sort(d3.ascending), p95 = d3.quantile(vals, .95) || 1;
        for (let i = 0; i < N; i++) if (D.pl[g][i] && s[i] != null) by[D.pl[g][i] - 1].push(s[i] / p95);
      });
    }
    return by.map(a => a.sort(d3.ascending));
  }
  function thesisHTML() {
    const by = plData(), nat = plMode === "national";
    const q = (a, p) => a.length ? d3.quantile(a, p) : null;
    const cap = nat ? Math.max(...by.flat()) : 3, clipped = nat ? 0 : by.flat().filter(x => x > cap).length;
    const W = availWidth(), H = Math.round(Math.max(260, Math.min(380, W * .62))), L = 48, R = 8, TP = 12, B = 30, bw = (W - L - R) / 5;
    const y = d3.scaleLinear().domain([0, cap]).range([H - B, TP]).nice();
    let g = "", sampled = false;
    y.ticks(5).forEach(t => { g += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" class="ax">${nat ? d3.format("~s")(t) : t}</text>`; });
    by.forEach((a, k) => {
      const cx = L + bw * (k + .5), half = bw * .28, pl = k + 1;
      const step = Math.max(1, Math.ceil(a.length / 1200));   // dots: an even sample above 1,200 per level
      if (step > 1) sampled = true;
      for (let j = 0; j < a.length; j += step) {   // deterministic jitter
        const jx = cx + (((j * 2654435761) % 1000) / 1000 - .5) * bw * .7;
        g += `<circle cx="${jx.toFixed(1)}" cy="${y(Math.min(a[j], cap)).toFixed(1)}" r="1.6" class="dot" style="fill:var(--pl${pl})"/>`;
      }
      if (a.length) {
        const [p5, p25, p50, p75, p95] = [.05, .25, .5, .75, .95].map(p => q(a, p));
        g += `<g class="box${thesisSel === k ? " sel" : ""}" data-k="${k}"><rect x="${cx - bw / 2}" y="${TP}" width="${bw}" height="${H - B - TP}" class="hit"/>`
          + `<line x1="${cx}" x2="${cx}" y1="${y(p5)}" y2="${y(p25)}"/><line x1="${cx}" x2="${cx}" y1="${y(p75)}" y2="${y(Math.min(p95, cap))}"/>`
          + `<rect x="${cx - half}" y="${y(p75)}" width="${half * 2}" height="${Math.max(1, y(p25) - y(p75))}" class="iqr"/>`
          + `<line x1="${cx - half}" x2="${cx + half}" y1="${y(p50)}" y2="${y(p50)}" class="med"/></g>`;
      }
      g += `<text x="${cx}" y="${H - 12}" text-anchor="middle" class="ax">PL ${pl}</text>`;
    });
    // overlap: share of PL k reports above the median of PL k+1
    const ov = [2, 3].map(k => { const a = by[k - 1], m = q(by[k], .5); return m == null || !a.length ? null : [k, a.filter(x => x > m).length / a.length]; }).filter(Boolean);
    const unit = nat ? "national personnel" : "area personnel relative to that area's own 95th percentile";
    let info = `<span class="muted">Tap a level for its numbers.</span>`;
    if (thesisSel != null && by[thesisSel].length) {
      const a = by[thesisSel], f = (x) => nat ? fmt(Math.round(x)) : x.toFixed(2);
      info = `<span><b>PL ${thesisSel + 1}</b>: ${fmt(a.length)} ${nat ? "reports" : "area-reports"}; median ${f(q(a, .5))}, middle half ${f(q(a, .25))} to ${f(q(a, .75))}, 5th to 95th percentile ${f(q(a, .05))} to ${f(q(a, .95))}</span>`;
    }
    return `<section class="st-sec"><h3>Preparedness level against committed personnel</h3>
      <div class="seg" role="group" aria-label="Scale"><button type="button" data-plmode="national" aria-pressed="${nat}">National</button><button type="button" data-plmode="areas" aria-pressed="${!nat}">Areas</button></div>
      <p class="st-lead">${nat ? "Each dot is one report: National PL against national committed personnel." : "Each dot is one area on one report: that area's PL against its committed personnel, divided by the area's own 95th percentile over 2007 to 2025 (1 = a very busy day for that area)."} Boxes show the middle half, the bar the median, the whiskers the 5th to 95th percentile.</p>
      <svg class="plbox" viewBox="0 0 ${W} ${H}" role="img" aria-label="Box plot of ${unit} by preparedness level">${g}</svg>
      ${clipped || sampled ? `<p class="st-note">${clipped ? `${fmt(clipped)} area-reports above 3 are drawn at 3. ` : ""}${sampled ? "Dots are an even sample where a level has more than 1,200; boxes and figures use every value." : ""}</p>` : ""}
      <div class="st-info" id="plinfo">${info}</div>
      <div class="st-callout">${ov.map(([k, s]) => `<p>On <b>${Math.round(s * 100)}%</b> of PL ${k} ${nat ? "reports" : "area-reports"}, committed personnel was above the median PL ${k + 1} ${nat ? "report" : "area-report"}.</p>`).join("")}
      <p class="muted">${nat ? "Nationally the levels step up with committed personnel, with a wide range inside each level. Switch to Areas to see each area against its own busy days." : "Area by area, the levels overlap more: an area at a lower level can carry more of its usual load than one at a higher level."} This view shows how committed personnel varies within each level; it does not say how levels are set. The thesis works on a finer, area-level measure of strain than five levels.</p></div></section>`;
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    if ($("stats").hidden || !$("stats").contains(e.target)) return;
    const t = e.target.closest("[data-tab],[data-metric],[data-plmode],[data-year],.st-go,.cal rect,.box");
    if (!t) return;
    if (t.dataset.tab) return setTab(t.dataset.tab);
    if (t.dataset.metric) { yearMetric = t.dataset.metric; return render(); }
    if (t.dataset.plmode) { plMode = t.dataset.plmode; thesisSel = null; return render(); }
    if (t.dataset.year) { yearSel = yearSel === +t.dataset.year ? null : +t.dataset.year; return render(); }
    if (t.classList.contains("st-go")) return go(t.dataset.i, t.dataset.name);
    if (t.tagName === "rect" && t.dataset.y != null) { calSel = { y: +t.dataset.y, w: +t.dataset.w }; return render(); }
    if (t.classList.contains("box")) { thesisSel = +t.dataset.k; return render(); }
  });
  document.addEventListener("change", (e) => { if (e.target.id === "calscope") { calScope = e.target.value; calSel = null; render(); } });
  const rerender = () => { if (D && !$("stats").hidden) render(); };
  let lastW = 0;
  new ResizeObserver(() => { const w = availWidth(); if (Math.abs(w - lastW) > 8) { lastW = w; if (tab === "seasons" || tab === "thesis") rerender(); } }).observe($("statsbody"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerender);
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  window.StrainStats = { open, close, render, get tab() { return tab; } };
})();
