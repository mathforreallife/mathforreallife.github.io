/* Math For Real Life: unlock and view the free bonus.
   The code carries the secret S (masked); S, stretched with PBKDF2, is the AES-GCM key of the encrypted files.
   Nothing secret is stored on this website: without a code from the book, the files can't be read. */
(function () {
  const $ = (s) => document.querySelector(s);
  const BASE = "/bonus/";
  let manifest = null, key = null, slides = [], n = 1;
  const cache = new Map();

  const msg = (text, err) => { const m = $("[data-msg]"); m.textContent = text; m.classList.toggle("err", !!err); };
  const track = (t, x) => window.MFRLtrack && window.MFRLtrack(t, x);

  function normalize(code) {
    return code.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
  }

  // Crockford base32 -> BigInt
  function unb32(text, alphabet) {
    let v = 0n;
    for (const ch of text) v = (v << 5n) | BigInt(alphabet.indexOf(ch));
    return v;
  }

  async function secretBytes(code) {
    const A = manifest.alphabet;
    const c = normalize(code);
    if (c.length !== 16 || [...c].some((ch) => !A.includes(ch))) return null;
    const sum = [...c.slice(0, 15)].reduce((s, ch, i) => s + (i + 1) * A.indexOf(ch), 0);
    if (A[sum % 32] !== c[15]) return null;
    const r = unb32(c.slice(0, 4), A), m = unb32(c.slice(4, 15), A);
    const rb = new Uint8Array([Number((r >> 16n) & 255n), Number((r >> 8n) & 255n), Number(r & 255n)]);
    const prefix = new TextEncoder().encode("MFRL-mask-v1");
    const buf = new Uint8Array(prefix.length + 3); buf.set(prefix); buf.set(rb, prefix.length);
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    let mask = 0n;
    for (let i = 0; i < 7; i++) mask = (mask << 8n) | BigInt(h[i]);
    mask >>= BigInt(56 - manifest.s_bits);
    const s = m ^ mask;
    const out = new Uint8Array(7);
    for (let i = 6, v = s; i >= 0; i--, v >>= 8n) out[i] = Number(v & 255n);
    return out;
  }

  async function deriveKey(sBytes) {
    const k = manifest.kdf;
    const base = await crypto.subtle.importKey("raw", sBytes, "PBKDF2", false, ["deriveKey"]);
    const salt = Uint8Array.from(atob(k.salt), (ch) => ch.charCodeAt(0));
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: k.hash, salt, iterations: k.iterations }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }

  async function open(file) {
    const data = new Uint8Array(await (await fetch(BASE + file)).arrayBuffer());
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12));
  }

  async function tryCode(code) {
    const s = await secretBytes(code);
    if (!s) return false;
    const k = await deriveKey(s);
    const data = new Uint8Array(await (await fetch(BASE + manifest.check)).arrayBuffer());
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, k, data.slice(12));
      if (new TextDecoder().decode(plain) !== "MFRL-OK") return false;
    } catch (e) { return false; }
    key = k;
    return true;
  }

  async function slideUrl(i) {
    if (!cache.has(i)) {
      const f = slides[i - 1];
      cache.set(i, open(f.file).then((buf) => URL.createObjectURL(new Blob([buf], { type: f.type }))));
    }
    return cache.get(i);
  }

  async function show(i) {
    n = Math.max(1, Math.min(slides.length, i));
    $("[data-count]").textContent = `${n} / ${slides.length}`;
    $("[data-range]").value = n;
    const img = $("[data-slide]");
    img.alt = `Slide ${n} of ${slides.length}`;
    img.src = await slideUrl(n);
    if (n < slides.length) slideUrl(n + 1);
    if (n > 1) slideUrl(n - 1);
  }

  function save(buf, name, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  function buildViewer() {
    slides = manifest.files.filter((f) => f.kind === "slide");
    $("[data-range]").max = slides.length;
    const actions = $("[data-actions]");
    manifest.files.filter((f) => f.kind !== "slide").forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f.kind === "demo" ? "Open the live demo" : `Download ${f.label.replace("Presentation (", "").replace(")", "")}`;
      if (f.kind === "demo") b.className = "primary";
      b.addEventListener("click", async () => {
        const win = f.kind === "demo" ? window.open("", "_blank") : null;
        b.disabled = true;
        const buf = await open(f.file);
        b.disabled = false;
        if (f.kind === "demo") {
          const url = URL.createObjectURL(new Blob([buf], { type: "text/html" }));
          if (win) win.location = url; else location.href = url;
          track("demo", "demo");
        } else {
          save(buf, f.name, f.type);
          track("download", f.label);
        }
      });
      actions.appendChild(b);
    });
    $("[data-prev]").addEventListener("click", () => show(n - 1));
    $("[data-next]").addEventListener("click", () => show(n + 1));
    $("[data-range]").addEventListener("input", (e) => show(+e.target.value));
    $("[data-fs]").addEventListener("click", () => {
      const s = $("[data-screen]");
      if (document.fullscreenElement) document.exitFullscreen(); else if (s.requestFullscreen) s.requestFullscreen();
    });
    addEventListener("keydown", (e) => {
      if ($("[data-viewer]").hidden) return;
      if (e.key === "ArrowRight") show(n + 1);
      if (e.key === "ArrowLeft") show(n - 1);
    });
    let x0 = null;
    const scr = $("[data-screen]");
    scr.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
    scr.addEventListener("pointerup", (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) show(n + (e.clientX < x0 ? 1 : -1)); x0 = null; });
    $("[data-lock]").hidden = true;
    $("[data-viewer]").hidden = false;
    show(1);
  }

  async function unlock(code, quiet) {
    const btn = $("[data-submit]");
    btn.disabled = true;
    if (!quiet) msg("Unlocking…");
    const ok = await tryCode(code).catch(() => false);
    btn.disabled = false;
    if (!ok) {
      if (!quiet) { msg("That code doesn't open the bonus. Check it against page 159 (0 is zero, not the letter O).", true); track("unlock_fail"); }
      localStorage.removeItem("mfrl-code");
      return;
    }
    if ($("[data-remember]").checked) localStorage.setItem("mfrl-code", normalize(code)); else localStorage.removeItem("mfrl-code");
    if (!quiet) track("unlock");
    msg("");
    buildViewer();
  }

  async function init() {
    if (!(window.crypto && crypto.subtle)) { msg("This browser can't open the bonus. Please try an up-to-date browser.", true); return; }
    manifest = await (await fetch(BASE + "manifest.json")).json();
    const input = $("#code");
    input.addEventListener("input", () => {
      const c = normalize(input.value).slice(0, 16);
      input.value = c.match(/.{1,4}/g) ? c.match(/.{1,4}/g).join("-") : "";
    });
    $("[data-form]").addEventListener("submit", (e) => { e.preventDefault(); unlock(input.value); });
    const remembered = localStorage.getItem("mfrl-code");
    if (remembered) unlock(remembered, true);
  }
  init();
})();
