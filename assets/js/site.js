/* Math For Real Life: shared site script (theme, analytics, Amazon button, 3D book, reviews, socials). */
(function () {
  const C = window.MFRL || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* ---- theme: follows the device until the visitor picks one ---- */
  const saved = localStorage.getItem("mfrl-theme");
  if (saved) document.documentElement.dataset.theme = saved;
  function currentTheme() {
    return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  $$("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("mfrl-theme", next);
  }));
  const top = $(".top");
  if (top) addEventListener("scroll", () => top.classList.toggle("scrolled", scrollY > 8), { passive: true });

  /* ---- analytics: anonymous events, no cookies, no identifiers ---- */
  const params = new URLSearchParams(location.search);
  const q = {
    src: params.get("utm_source") || params.get("src") || params.get("ref") || params.get("from") || null,
    medium: params.get("utm_medium") || null,
    campaign: params.get("utm_campaign") || null,
  };
  if (q.src || q.medium || q.campaign) {
    ["utm_source", "utm_medium", "utm_campaign", "src", "ref", "from"].forEach((k) => params.delete(k));
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  }
  let refHost = null;
  try { refHost = document.referrer ? new URL(document.referrer).hostname : null; } catch (e) { refHost = null; }
  if (refHost === location.hostname) refHost = null;
  function track(type, extra) {
    if (!C.analytics || navigator.webdriver) return;
    const body = JSON.stringify({ t: type, p: location.pathname, r: refHost, q, x: extra || null });
    try {
      if (!navigator.sendBeacon || !navigator.sendBeacon(C.analytics + "/e", new Blob([body], { type: "text/plain" }))) {
        fetch(C.analytics + "/e", { method: "POST", body, keepalive: true, mode: "cors" }).catch(() => {});
      }
    } catch (e) { /* analytics must never break the page */ }
  }
  window.MFRLtrack = track;
  if (!document.body.hasAttribute("data-no-track")) track("view");

  /* ---- Amazon: the visitor's own store, from their country (Cloudflare, via the analytics worker), else the browser language ---- */
  const stores = (C.stores || []).filter((s) => s.url);
  const STORE_OF = { GB: "UK", GG: "UK", JE: "UK", IM: "UK", IE: "IE", DE: "DE", AT: "DE", CH: "DE", LI: "DE", LU: "DE", DK: "DE", SE: "DE",
    NO: "DE", FI: "DE", CZ: "DE", SK: "DE", HU: "DE", SI: "DE", HR: "DE", FR: "FR", BE: "FR", MC: "FR", ES: "ES", PT: "ES", AD: "ES",
    IT: "IT", SM: "IT", VA: "IT", MT: "IT", NL: "NL", PL: "PL", LT: "PL", LV: "PL", EE: "PL", CA: "CA", AU: "AU", NZ: "AU", JP: "JP" };
  const LANG_OF = { de: "DE", fr: "FR", es: "ES", it: "IT", nl: "NL", pl: "PL", ja: "JP" };
  const lang = (navigator.language || "en-US").toLowerCase();
  function storeFor(country) {
    if (country === "BE" && lang.startsWith("nl")) country = "NL";
    const code = country ? STORE_OF[country] || "US" : null;
    return stores.find((s) => s.code === code);
  }
  function guessStore() {
    const region = (lang.split("-")[1] || "").toUpperCase();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return (region && storeFor(region)) || (tz === "Europe/London" && storeFor("GB")) || (tz === "Europe/Madrid" && storeFor("ES")) ||
      stores.find((s) => s.code === LANG_OF[lang.slice(0, 2)]) || stores.find((s) => s.code === "US") || stores[0];
  }
  // calls back with the best store: at once from the browser language, then again if the country lookup answers within 2 s
  function pickStore(cb) {
    if (!stores.length) return;
    cb(guessStore(), false);
    if (!C.analytics) return;
    const ctl = "AbortController" in window ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 2000);
    fetch(C.analytics + "/geo", { signal: ctl && ctl.signal, cache: "no-store" }).then((r) => r.json()).then((g) => {
      clearTimeout(timer);
      const s = storeFor(g && g.country);
      if (s) cb(s, true);
    }).catch(() => {});
  }
  window.MFRLpickStore = pickStore;
  const buy = $("[data-buy]");
  if (buy) {
    const select = $("[data-store]");
    if (!stores.length) {
      buy.setAttribute("aria-disabled", "true");
      buy.removeAttribute("href");
      $("[data-buy-label]").textContent = "Coming soon to Amazon";
      $("[data-store-wrap]").hidden = true;
    } else {
      let chosen = stores[0], touched = false;
      stores.forEach((s) => { const o = document.createElement("option"); o.value = s.code; o.textContent = s.name; select.appendChild(o); });
      const apply = () => { buy.href = chosen.url; select.value = chosen.code; };
      pickStore((s) => { if (!touched) { chosen = s; apply(); } });
      select.addEventListener("change", () => { touched = true; chosen = stores.find((s) => s.code === select.value); apply(); });
      if (stores.length < 2) $("[data-store-wrap]").hidden = true;
      buy.target = "_blank";
      buy.addEventListener("click", () => track("amazon", chosen.code));
    }
  }

  /* ---- the 3D book: idles at an angle, follows the pointer, turns when dragged ---- */
  const stage = $("[data-stage]"), book = $("[data-book]");
  if (stage && book) {
    const rest = { ry: 26, rx: 4 };
    let ry = rest.ry, rx = rest.rx, drag = null, timer = null;
    const set = () => { book.style.setProperty("--ry", ry + "deg"); book.style.setProperty("--rx", rx + "deg"); };
    const settle = () => { clearTimeout(timer); timer = setTimeout(() => { ry = rest.ry; rx = rest.rx; set(); }, 2200); };
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      if (drag) {
        ry = drag.ry + (e.clientX - drag.x) * 0.45;
        rx = Math.max(-12, Math.min(16, drag.rx - (e.clientY - drag.y) * 0.15));
        set();
      } else if (e.pointerType === "mouse") {
        ry = rest.ry + ((e.clientX - r.left) / r.width - .5) * 22;
        rx = rest.rx - ((e.clientY - r.top) / r.height - .5) * 10;
        set(); settle();
      }
    });
    stage.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, ry, rx };
      book.classList.add("dragging");
      stage.setPointerCapture(e.pointerId);
    });
    const end = () => {
      if (!drag) return;
      drag = null; book.classList.remove("dragging");
      ry = Math.round((ry - rest.ry) / 180) * 180 + rest.ry;  // land on the front or the back
      set(); settle();
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("pointerleave", () => { if (!drag) settle(); });
  }

  /* ---- reviews: only real ones, only when switched on ---- */
  const reviews = C.reviews || [];
  const track_ = $("[data-track]");
  if (track_ && reviews.length) {
    $("#reviews").hidden = false;
    const early = C.reviewsSource === "early";
    if (early) {
      $("[data-reviews-title]").textContent = "What readers say";
      $("[data-reviews-intro]").textContent = "From readers who enjoyed the book.";
    }
    $$("[data-reviews-link]").forEach((a) => (a.hidden = false));
    const star = (n) => {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 110 20");
      svg.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 5; i++) {
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d", "M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z");
        p.setAttribute("transform", `translate(${i * 22} 0)`);
        p.setAttribute("fill", i < n ? "var(--star)" : "none");
        p.setAttribute("stroke", "var(--star)");
        p.setAttribute("stroke-width", "1.3");
        svg.appendChild(p);
      }
      return svg;
    };
    const card = (r) => {
      const el = document.createElement("article");
      el.className = "review";
      const who = document.createElement("div"); who.className = "who";
      const av = document.createElement("span"); av.className = "av"; av.textContent = (r.name || "?").trim().charAt(0).toUpperCase();
      const nm = document.createElement("span"); nm.textContent = r.name;
      who.append(av, nm);
      const st = document.createElement("div"); st.className = "stars";
      st.append(star(r.stars));
      const ttl = document.createElement("b"); ttl.textContent = r.title || ""; st.append(ttl);
      const meta = document.createElement("div"); meta.className = "meta";
      meta.textContent = early ? [r.country, r.date].filter(Boolean).join(" · ") : `Reviewed in ${r.country} on ${r.date}`;
      const p = document.createElement("p"); p.textContent = r.text;
      const sr = document.createElement("span"); sr.className = "sr"; sr.textContent = `${r.stars} out of 5 stars.`;
      el.append(who, sr, st, meta, p);
      return el;
    };
    // one or two reviews: shown still and centered (a scroller would repeat the same card over and over)
    if (reviews.length < 3) {
      track_.parentElement.classList.add("few");
      reviews.forEach((r) => track_.appendChild(card(r)));
    } else {
      // two copies side by side make a seamless loop; at least 8 cards so the strip is wider than any screen
      let list = reviews.slice();
      while (list.length < 8) list = list.concat(reviews);
      [...list, ...list].forEach((r, i) => { const c = card(r); if (i >= list.length) c.setAttribute("aria-hidden", "true"); track_.appendChild(c); });
      track_.style.setProperty("--dur", list.length * 5 + "s");
    }
  }

  /* ---- socials and legal notice ---- */
  const icons = {
    youtube: "M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.8 15.1V8.9l5.8 3.1z",
    tiktok: "M16.6 3c.3 2.2 1.7 3.6 3.9 3.8v3a7 7 0 0 1-3.9-1.2v6.1a5.7 5.7 0 1 1-5.7-5.7l.6.1v3.1a2.7 2.7 0 1 0 2 2.6V3z",
    instagram: "M12 7.4A4.6 4.6 0 1 0 16.6 12 4.6 4.6 0 0 0 12 7.4zm0 7.6a3 3 0 1 1 3-3 3 3 0 0 1-3 3zm4.8-8.9a1.1 1.1 0 1 0 1.1 1.1 1.1 1.1 0 0 0-1.1-1.1zM21 7.3a5.3 5.3 0 0 0-1.4-3.7A5.3 5.3 0 0 0 15.9 2.2C14.4 2.1 9.6 2.1 8.1 2.2a5.3 5.3 0 0 0-3.7 1.4A5.3 5.3 0 0 0 3 7.3c-.1 1.5-.1 6 0 7.5a5.3 5.3 0 0 0 1.4 3.7 5.3 5.3 0 0 0 3.7 1.4c1.5.1 6.3.1 7.8 0a5.3 5.3 0 0 0 3.7-1.4 5.3 5.3 0 0 0 1.4-3.7c.1-1.5.1-6 0-7.5z",
    facebook: "M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3a21 21 0 0 0-2.3-.1c-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z",
    pinterest: "M12.2 2.5a9.5 9.5 0 0 0-3.5 18.3 8.8 8.8 0 0 1 0-2.7l1.1-4.7a3.4 3.4 0 0 1-.3-1.4c0-1.3.8-2.3 1.7-2.3a1.2 1.2 0 0 1 1.2 1.4c0 .8-.5 2-.8 3.2a1.4 1.4 0 0 0 1.4 1.7c1.7 0 3-1.8 3-4.4a3.8 3.8 0 0 0-4-3.9 4.1 4.1 0 0 0-4.3 4.1 3.7 3.7 0 0 0 .7 2.2.3.3 0 0 1 .1.3l-.3 1c0 .2-.1.2-.3.1-1.2-.6-2-2.4-2-3.8 0-3.1 2.3-6 6.5-6 3.4 0 6.1 2.4 6.1 5.7 0 3.4-2.1 6.1-5.1 6.1a2.6 2.6 0 0 1-2.2-1.1l-.6 2.3a10.5 10.5 0 0 1-1.2 2.5 9.5 9.5 0 1 0 2.8-18.6z",
    x: "M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z",
  };
  const box = $("[data-socials]");
  if (box && C.socials) {
    Object.entries(C.socials).forEach(([k, url]) => {
      if (!url || !icons[k]) return;
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener"; a.setAttribute("aria-label", k);
      a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${icons[k]}"/></svg>`;
      box.appendChild(a);
    });
  }
  if (C.legal) $$("[data-legal-link]").forEach((a) => (a.hidden = false));
})();
