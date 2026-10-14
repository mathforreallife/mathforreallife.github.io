/* Math For Real Life: the owner's private stats page. Data comes from the analytics worker with a bearer key. */
(function () {
  const C = window.MFRL || {};
  const $ = (s, el = document) => el.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const tip = $("[data-tip]");
  let days = 30, data = null;

  const fmt = (v) => {
    v = +v || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (v >= 1e4) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
    return v.toLocaleString("en-US");
  };
  const niceMax = (m) => {
    if (m <= 4) return 4;
    if (m <= 40) return Math.ceil(m / 4) * 4;  // whole-number ticks for small counts
    const p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  };
  const el = (name, attrs = {}, parent) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const txt = (parent, x, y, s, cls, anchor = "start") => { const t = el("text", { x, y, class: cls, "text-anchor": anchor }, parent); t.textContent = s; return t; };
  const dayLabel = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  function showTip(e, title, rows) {
    tip.replaceChildren();
    const d = document.createElement("div"); d.className = "d"; d.textContent = title; tip.appendChild(d);
    rows.forEach(([color, value, label]) => {
      const r = document.createElement("div"); r.className = "r";
      const i = document.createElement("i"); i.style.background = color;
      const b = document.createElement("b"); b.textContent = fmt(value);
      const s = document.createElement("span"); s.textContent = label;
      r.append(i, b, s); tip.appendChild(r);
    });
    tip.hidden = false;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  function cardFrame(card, title, sub, rows, columns) {
    card.replaceChildren();
    const h = document.createElement("header");
    const t = document.createElement("div");
    const h2 = document.createElement("h2"); h2.textContent = title;
    const p = document.createElement("p"); p.className = "sub"; p.textContent = sub;
    t.append(h2, p);
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "tbtn"; btn.textContent = "Table";
    h.append(t, btn); card.appendChild(h);
    const body = document.createElement("div"); card.appendChild(body);
    const table = document.createElement("table"); table.hidden = true;
    const thead = document.createElement("tr");
    columns.forEach((c, i) => { const th = document.createElement("th"); th.textContent = c; if (i) th.className = "n"; thead.appendChild(th); });
    table.appendChild(thead);
    rows.forEach((r) => { const tr = document.createElement("tr"); r.forEach((v, i) => { const td = document.createElement("td"); td.textContent = i ? fmt(v) : v; if (i) td.className = "n"; tr.appendChild(td); }); table.appendChild(tr); });
    card.appendChild(table);
    btn.addEventListener("click", () => { const on = table.hidden; table.hidden = !on; body.hidden = on; btn.textContent = on ? "Chart" : "Table"; });
    if (!rows.length) { const e = document.createElement("div"); e.className = "empty"; e.textContent = "Nothing yet in this period."; body.appendChild(e); btn.hidden = true; return null; }
    return body;
  }

  function series(daily) {
    const map = new Map(daily.map((d) => [d.day, d]));
    const out = [];
    const end = new Date(); end.setUTCHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10);
      const r = map.get(d) || {};
      out.push({ day: d, views: +r.views || 0, unlocks: +r.unlocks || 0, amazon: +r.amazon || 0 });
    }
    return out;
  }

  function lineChart(card, pts) {
    const body = cardFrame(card, "Page views per day", "Every page of the site, counted once per visit to it", pts.map((p) => [p.day, p.views, p.unlocks, p.amazon]),
      ["Day", "Views", "Unlocks", "Amazon clicks"]);
    if (!body) return;
    const W = 1000, H = 260, L = 44, R = 18, T = 14, B = 28;
    const max = niceMax(Math.max(...pts.map((p) => p.views), 1));
    const x = (i) => L + (pts.length === 1 ? 0 : i * (W - L - R) / (pts.length - 1));
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Page views per day" }, body);
    for (let k = 0; k <= 4; k++) {
      const v = max * k / 4;
      el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: k ? "var(--grid)" : "var(--axis)", "stroke-width": 1 }, svg);
      txt(svg, L - 8, y(v) + 4, fmt(v), "tick", "end");
    }
    const step = Math.ceil(pts.length / 7);
    pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) txt(svg, x(i), H - 8, dayLabel(p.day), "tick", i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"); });
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.views)}`).join("");
    el("path", { d: `${d}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: "var(--series-1)", opacity: .1 }, svg);
    el("path", { d, fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    const last = pts[pts.length - 1];
    el("circle", { cx: x(pts.length - 1), cy: y(last.views), r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2 }, svg);
    const hair = el("line", { y1: T, y2: H - B, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" }, svg);
    const dot = el("circle", { r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2, visibility: "hidden" }, svg);
    const hit = el("rect", { x: L, y: T, width: W - L - R, height: H - T - B, class: "hit" }, svg);
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width * W;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round((fx - L) / ((W - L - R) / Math.max(pts.length - 1, 1)))));
      const p = pts[i];
      hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i)); hair.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.views)); dot.setAttribute("visibility", "visible");
      showTip(e, dayLabel(p.day), [["var(--series-1)", p.views, "page views"], ["var(--series-2)", p.unlocks, "bonus unlocks"], ["var(--series-3)", p.amazon, "Amazon clicks"]]);
    });
    hit.addEventListener("pointerleave", () => { hair.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); });
  }

  function columns(card, pts, key, title, sub, color, unit) {
    const body = cardFrame(card, title, sub, pts.filter((p) => p[key]).map((p) => [p.day, p[key]]), ["Day", unit]);
    if (!body) return;
    const W = 480, H = 200, L = 34, R = 8, T = 12, B = 26;
    const max = niceMax(Math.max(...pts.map((p) => p[key]), 1));
    const band = (W - L - R) / pts.length, bw = Math.min(24, Math.max(2, band * .62));
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title }, body);
    for (let k = 0; k <= 2; k++) {
      const v = max * k / 2;
      el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: k ? "var(--grid)" : "var(--axis)", "stroke-width": 1 }, svg);
      txt(svg, L - 6, y(v) + 4, fmt(v), "tick", "end");
    }
    txt(svg, L, H - 6, dayLabel(pts[0].day), "tick");
    txt(svg, W - R, H - 6, dayLabel(pts[pts.length - 1].day), "tick", "end");
    pts.forEach((p, i) => {
      const cx = L + band * i + band / 2, v = p[key];
      if (v) {
        const top = y(v), x0 = cx - bw / 2, base = y(0), r = Math.min(4, bw / 2, base - top);
        el("path", { class: "mark", fill: color, d: `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${base}Z` }, svg);
      }
      const h = el("rect", { x: L + band * i, y: T, width: band, height: H - T - B, class: "hit" }, svg);
      h.addEventListener("pointermove", (e) => showTip(e, dayLabel(p.day), [[color, v, unit.toLowerCase()]]));
      h.addEventListener("pointerleave", hideTip);
    });
  }

  function hbars(card, rows, title, sub, colLabel) {
    const body = cardFrame(card, title, sub, rows.map((r) => [r.label, r.n]), [colLabel, "Count"]);
    if (!body) return;
    const W = 480, rowH = 30, bh = 16, LBL = 170, R = 44;
    const H = rows.length * rowH + 4;
    const max = Math.max(...rows.map((r) => r.n), 1);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title }, body);
    el("line", { x1: LBL, x2: LBL, y1: 0, y2: H, stroke: "var(--axis)", "stroke-width": 1 }, svg);
    rows.forEach((r, i) => {
      const yc = i * rowH + rowH / 2, w = Math.max(3, (W - LBL - R) * r.n / max);
      const name = r.label.length > 24 ? r.label.slice(0, 23) + "…" : r.label;
      txt(svg, LBL - 10, yc + 4, name, "blabel", "end");
      const x0 = LBL, rr = Math.min(4, w / 2);
      el("path", { class: "mark", fill: "var(--series-1)", d: `M${x0},${yc - bh / 2}H${x0 + w - rr}Q${x0 + w},${yc - bh / 2} ${x0 + w},${yc - bh / 2 + rr}V${yc + bh / 2 - rr}Q${x0 + w},${yc + bh / 2} ${x0 + w - rr},${yc + bh / 2}H${x0}Z` }, svg);
      txt(svg, x0 + w + 6, yc + 4, fmt(r.n), "bval");
      const h = el("rect", { x: 0, y: i * rowH, width: W, height: rowH, class: "hit" }, svg);
      h.addEventListener("pointermove", (e) => showTip(e, r.label, [["var(--series-1)", r.n, colLabel === "Page" ? "views" : "visits"]]));
      h.addEventListener("pointerleave", hideTip);
    });
  }

  function tiles(d) {
    const box = $("[data-tiles]"); box.replaceChildren();
    const t = d.totals || {}, p = d.previous || {}, a = d.allTime || {};
    [["views", "Page views", true], ["unlocks", "Bonus unlocks"], ["amazon", "Amazon button clicks"], ["downloads", "Bonus downloads"]].forEach(([k, label, hero]) => {
      const v = +t[k] || 0, pv = +p[k] || 0;
      const div = document.createElement("div"); div.className = "tile" + (hero ? " hero" : "");
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const val = document.createElement("div"); val.className = "value"; val.textContent = fmt(v);
      const dl = document.createElement("div"); dl.className = "delta";
      if (pv) { const ch = Math.round((v - pv) / pv * 100); dl.textContent = `${ch >= 0 ? "+" : "−"}${Math.abs(ch)}% vs the previous ${days} days`; dl.classList.add(ch >= 0 ? "up" : "down"); }
      else dl.textContent = `no data for the previous ${days} days`;
      div.append(l, val, dl);
      if (k in a) { const al = document.createElement("div"); al.className = "all"; al.textContent = `${fmt(a[k])} all time`; div.appendChild(al); }
      box.appendChild(div);
    });
  }

  function render() {
    const d = data;
    $("[data-since]").textContent = d.allTime && d.allTime.first ? `Counting since ${dayLabel(d.allTime.first)}` : "No visits recorded yet";
    tiles(d);
    const pts = series(d.daily || []);
    const card = (k) => $(`[data-chart="${k}"]`);
    lineChart(card("views"), pts);
    columns(card("unlocks"), pts, "unlocks", "Bonus unlocks per day", "Codes that opened the presentation", "var(--series-2)", "Unlocks");
    columns(card("amazon"), pts, "amazon", "Amazon button clicks per day", "Visitors sent to the book on Amazon", "var(--series-3)", "Clicks");
    hbars(card("params"), (d.params || []).map((r) => ({ label: [r.src, r.medium, r.campaign].filter(Boolean).join(" / "), n: +r.n })), "Traffic from your links", "Visits that came with ?src= or UTM tags", "Link tag");
    hbars(card("refs"), (d.refs || []).map((r) => ({ label: r.label, n: +r.n })), "Where visitors came from", "The website that linked them here", "Source");
    hbars(card("countries"), (d.countries || []).map((r) => ({ label: r.label, n: +r.n })), "Countries", "From the visitor's network, no location tracking", "Country");
    hbars(card("devices"), (d.devices || []).map((r) => ({ label: r.label, n: +r.n })), "Devices", "Phone, tablet or computer", "Device");
    hbars(card("pages"), (d.pages || []).map((r) => ({ label: r.label, n: +r.n })), "Pages", "Most visited pages", "Page");
    hbars(card("stores"), (d.stores || []).map((r) => ({ label: "Amazon " + r.label, n: +r.n })), "Amazon store clicked", "Which country's store", "Store");
  }

  async function load() {
    const token = localStorage.getItem("mfrl-stats");
    document.querySelectorAll(".card").forEach((c) => c.classList.add("loading"));
    const res = await fetch(`${C.analytics}/stats?days=${days}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    document.querySelectorAll(".card").forEach((c) => c.classList.remove("loading"));
    if (!res || res.status === 401) {
      localStorage.removeItem("mfrl-stats");
      $("[data-dash]").hidden = true; $("[data-login]").hidden = false; $("[data-signout]").hidden = true;
      $("[data-loginerr]").textContent = res ? "That key isn't right." : "The stats service didn't answer. Try again in a minute.";
      return;
    }
    data = await res.json();
    $("[data-login]").hidden = true; $("[data-dash]").hidden = false; $("[data-signout]").hidden = false;
    render();
  }

  document.querySelectorAll("[data-days]").forEach((b) => b.addEventListener("click", () => {
    days = +b.dataset.days;
    document.querySelectorAll("[data-days]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    load();
  }));
  $("[data-loginform]").addEventListener("submit", (e) => { e.preventDefault(); localStorage.setItem("mfrl-stats", $("[data-token]").value.trim()); $("[data-loginerr]").textContent = ""; load(); });
  $("[data-signout]").addEventListener("click", () => { localStorage.removeItem("mfrl-stats"); location.reload(); });

  if (!C.analytics) {
    $("[data-login]").hidden = false;
    $("[data-loginform]").hidden = true;
    $("[data-loginerr]").textContent = "The stats service isn't switched on yet (see the project checklist).";
  } else if (localStorage.getItem("mfrl-stats")) load();
  else $("[data-login]").hidden = false;
})();
