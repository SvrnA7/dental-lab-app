/* Verbindung der App zum eigenen Server (Netlify oder Node).
   Stellt window.claude.use("db" | "sample" | "assets" | "user") bereit.
   Ohne Server (z. B. reines Hosting auf Vercel) läuft die App im Demo-Modus: Daten nur in diesem Browser. */
(function () {
  "use strict";
  const COLLS = ["employees", "absences", "machines", "jobtypes", "orders", "notes", "materials", "cases", "positions", "offers", "config"];
  const LS_DEMO = "laborplaner-demo-v1";
  const POLL_MS = 30000;
  const SEED_BASE = "2026-10-22";
  // Barcode-Erkennung für Geräte ohne eingebaute Erkennung (z. B. iPad) liegt mit im Paket
  window.LP_BARCODE_LIB = new URL("vendor/barcode-detector.js", document.baseURI).href;

  /* ---------- kleine Hilfen ---------- */
  const err = (code, extra) => Object.assign(new Error(code), { code }, extra || {});
  const clone = o => JSON.parse(JSON.stringify(o));
  function colSnap(docs) { const list = Object.keys(docs).map(id => ({ id, exists: true, data: () => clone(docs[id]) })); return { docs: list, size: list.length, empty: !list.length }; }
  function docSnap(id, d) { return { id, exists: !!d, data: () => (d ? clone(d) : undefined) }; }

  function shiftSeed(seed) {
    const p = SEED_BASE.split("-").map(Number), now = new Date();
    const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(p[0], p[1] - 1, p[2])) / 864e5 / 7) * 7;
    if (!days) return seed;
    const isDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s);
    const sh = s => { const d = new Date(s.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) + s.slice(10); };
    const walk = (x, k) => {
      if (k === "holidays") return x;
      if (Array.isArray(x)) return x.map(v => walk(v));
      if (x && typeof x === "object") { const o = {}; Object.keys(x).forEach(key => { o[isDate(key) ? sh(key) : key] = walk(x[key], key); }); return o; }
      return isDate(x) ? sh(x) : x;
    };
    return walk(seed);
  }

  /* ---------- Hinweisleiste unten (Demo / offline) ---------- */
  function pill(text, tone) {
    let el = document.getElementById("lp-pill");
    if (!text) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div"); el.id = "lp-pill"; el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + " + (innerWidth <= 900 ? 74 : 16) + "px);z-index:60;padding:6px 12px;border-radius:999px;font:500 12.5px/1.3 Figtree,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.12);max-width:calc(100vw - 32px);text-align:center;cursor:pointer";
      el.title = "Ausblenden"; el.onclick = () => el.remove();
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.background = tone === "bad" ? "#FCE7E4" : "#FDF1DE";
    el.style.color = tone === "bad" ? "#8F2B20" : "#7A4D0F";
  }

  /* ---------- Login-Maske für den Laborcode ---------- */
  function askCode(msg) {
    return new Promise(resolve => {
      const wrap = document.createElement("div");
      wrap.id = "lp-login";
      wrap.style.cssText = "position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:#F6F7F5;padding:16px;font-family:Figtree,system-ui,sans-serif";
      wrap.innerHTML = '<form style="width:100%;max-width:360px;background:#fff;border:1px solid #E4E8E3;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.06)">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><img src="icon.svg" width="36" height="36" alt=""><b style="font-size:18px;color:#1B2420">Dentlab Plattform</b></div>' +
        '<p style="margin:0 0 14px;color:#6B756F;font-size:14px">Bitte den Laborcode eingeben. Danach meldet sich jedes Teammitglied wie gewohnt mit seiner PIN an.</p>' +
        '<input name="c" type="password" autocomplete="current-password" required placeholder="Laborcode" style="width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:11px 12px;border:1px solid #CBD3CC;border-radius:10px">' +
        '<div id="lp-msg" style="min-height:20px;margin:8px 0;color:#C24133;font-size:13.5px"></div>' +
        '<button style="width:100%;font:inherit;font-weight:600;font-size:15px;padding:11px;border:0;border-radius:10px;background:#1F4D3F;color:#fff;cursor:pointer">Anmelden</button></form>';
      document.body.appendChild(wrap);
      const form = wrap.querySelector("form"), m = wrap.querySelector("#lp-msg");
      if (msg) m.textContent = msg;
      form.c.focus();
      form.onsubmit = async e => {
        e.preventDefault(); m.textContent = "";
        const b = form.querySelector("button"); b.disabled = true;
        try {
          const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: form.c.value }), credentials: "same-origin" });
          if (r.ok) { wrap.remove(); resolve(); return; }
          m.textContent = r.status === 401 ? "Der Laborcode stimmt nicht." : "Anmeldung gerade nicht möglich.";
        } catch (x) { m.textContent = "Keine Verbindung zum Server."; }
        b.disabled = false; form.c.select();
      };
    });
  }
  function setupHint() {
    document.body.insertAdjacentHTML("beforeend", '<div style="position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:#F6F7F5;padding:16px;font-family:Figtree,system-ui,sans-serif"><div style="max-width:420px;background:#fff;border:1px solid #E4E8E3;border-radius:16px;padding:24px"><b style="font-size:18px">Fast fertig</b><p style="color:#6B756F">Auf dem Server ist noch kein Laborcode hinterlegt. Bitte die Umgebungsvariable <code>LAB_CODE</code> setzen (siehe Anleitung) und die Seite neu laden.</p></div></div>');
  }

  /* ---------- Server-Datenbank mit Abgleich ---------- */
  function serverDb() {
    const docs = {}, vers = {}, pending = {}, colL = {}, docL = {};
    COLLS.forEach(c => { docs[c] = {}; colL[c] = []; });
    let timer = null, polling = null, again = false, offline = false, relogin = null, fails = 0, retryT = null;

    const view = c => { const d = Object.assign({}, docs[c]); Object.keys(pending).forEach(k => { const [pc, id] = k.split("/"); if (pc === c) { if (pending[k].data === null) delete d[id]; else d[id] = pending[k].data; } }); return d; };
    const emit = c => {
      const d = view(c);
      if (c === "config") (docL["config/main"] || []).forEach(f => f(docSnap("main", d.main)));
      else colL[c].forEach(f => f(colSnap(d)));
    };
    async function api(path, opts) {
      for (;;) {
        const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opts || {}));
        if (r.status !== 401) return r;
        if (!relogin) relogin = askCode("Die Anmeldung ist abgelaufen.").then(() => { relogin = null; });
        await relogin;
      }
    }
    async function poll() {
      if (polling) { again = true; return polling; }
      polling = (async () => {
        try {
          const known = Object.keys(vers).map(c => c + ":" + vers[c]).join(",");
          const r = await api("/api/sync?known=" + encodeURIComponent(known));
          if (!r.ok) { let j = {}; try { j = await r.json(); } catch (x) {} throw err("sync", { status: r.status, detail: j.error || j.code || "" }); }
          const j = await r.json();
          Object.keys(j.colls || {}).forEach(c => { docs[c] = j.colls[c].docs || {}; vers[c] = j.colls[c].v || 0; emit(c); });
          fails = 0;
          if (offline) { offline = false; pill(""); }
        } catch (e) {
          fails++;
          if (e && e.status) console.warn("Abgleich fehlgeschlagen:", e.status, e.detail);
          // erst nach dem zweiten Fehlschlag melden, dann zügig neu versuchen
          if (fails >= 2) { offline = true; pill("Keine Verbindung zum Server" + (e && e.status ? " (Fehler " + e.status + ")" : "") + ". Neuer Versuch läuft …", "bad"); }
          clearTimeout(retryT); retryT = setTimeout(poll, Math.min(10000, 1500 * fails));
        }
        polling = null;
        if (again) { again = false; poll(); }
      })();
      return polling;
    }
    const schedule = () => { clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === "visible") poll(); }, POLL_MS); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poll(); });
    window.addEventListener("focus", () => poll());
    window.addEventListener("online", () => { flush(); poll(); });

    const queue = [];
    let flushing = false;
    async function flush() {
      if (flushing) return; flushing = true;
      while (queue.length) {
        const w = queue[0];
        try {
          const r = await api("/api/write", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w.body) });
          if (r.status === 400) { queue.shift(); delete pending[w.key]; w.reject(err("invalid_argument")); emit(w.body.coll); continue; }
          if (!r.ok) throw err("write");
          queue.shift();
          if (pending[w.key] === w.entry) delete pending[w.key];
          w.resolve();
        } catch (e) {
          offline = true; pill("Keine Verbindung zum Server. Änderungen werden gesendet, sobald sie wieder da ist.", "bad");
          flushing = false; setTimeout(flush, 5000); return;
        }
      }
      flushing = false;
      poll();
    }
    function write(coll, id, data) {
      const key = coll + "/" + id, entry = { data: data === null ? null : clone(data) };
      pending[key] = entry;
      return new Promise((resolve, reject) => { queue.push({ key, entry, body: { coll, id, data: entry.data }, resolve, reject }); flush(); });
    }
    function docRef(coll, id) { return { id, set: d => write(coll, id, d), delete: () => write(coll, id, null) }; }

    const db = {
      collection(c) {
        return {
          doc: id => docRef(c, id),
          onSnapshot(cb) { colL[c].push(cb); if (vers[c] !== undefined) cb(colSnap(view(c))); return () => { colL[c] = colL[c].filter(f => f !== cb); }; }
        };
      },
      doc(p) {
        const [c, id] = p.split("/");
        return Object.assign(docRef(c, id), {
          onSnapshot(cb) { (docL[p] = docL[p] || []).push(cb); if (vers[c] !== undefined) cb(docSnap(id, view(c)[id])); return () => { docL[p] = docL[p].filter(f => f !== cb); }; }
        });
      }
    };
    return { db, start: async () => { await poll(); schedule(); } };
  }

  /* ---------- Demo-Modus: alles im Browser ---------- */
  async function localDb() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(LS_DEMO) || "null"); } catch (e) {}
    if (!state) {
      state = {};
      try { const seed = shiftSeed(await (await fetch("seed.json")).json()); COLLS.forEach(c => { state[c] = c === "config" ? { main: seed.config || {} } : (seed[c] || {}); }); }
      catch (e) { COLLS.forEach(c => { state[c] = {}; }); }
    }
    const save = () => { try { localStorage.setItem(LS_DEMO, JSON.stringify(state)); } catch (e) {} };
    save();
    const colL = {}, docL = {};
    const emit = c => { if (c === "config") (docL["config/main"] || []).forEach(f => f(docSnap("main", state.config.main))); else (colL[c] || []).forEach(f => f(colSnap(state[c]))); };
    const ref = (c, id) => ({ id, set: async d => { state[c][id] = clone(d); save(); emit(c); }, delete: async () => { delete state[c][id]; save(); emit(c); } });
    pill("Demo-Modus: Daten werden nur in diesem Browser gespeichert.");
    return {
      collection: c => ({ doc: id => ref(c, id), onSnapshot(cb) { (colL[c] = colL[c] || []).push(cb); setTimeout(() => cb(colSnap(state[c] || {}))); return () => {}; } }),
      doc(p) { const [c, id] = p.split("/"); return Object.assign(ref(c, id), { onSnapshot(cb) { (docL[p] = docL[p] || []).push(cb); setTimeout(() => cb(docSnap(id, state[c][id]))); return () => {}; } }); }
    };
  }

  /* ---------- KI-Fragen ---------- */
  function sample(health) {
    if (!health || !health.ai) return null;
    return async function (input, opts) {
      opts = opts || {};
      let r;
      try { r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ input, tier: opts.modelTier || "" }), signal: opts.signal }); }
      catch (e) { throw err(e && e.name === "AbortError" ? "cancelled" : "unavailable"); }
      if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw err(j.code === "session_expired" ? "session_expired" : (j.code || "unavailable")); }
      const rd = r.body.getReader(), dec = new TextDecoder();
      let text = "";
      try {
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          text += dec.decode(value, { stream: true });
          if (opts.onText) opts.onText({ text });
        }
      } catch (e) { throw err(e && e.name === "AbortError" ? "cancelled" : "unavailable", { text }); }
      if (!text.trim()) throw err("empty_completion");
      return { text };
    };
  }

  /* ---------- Dateien (Fotos, PDFs) ---------- */
  const assets = {
    async upload(blob, opts) {
      const type = (opts && opts.type) || blob.type || "application/octet-stream";
      if (blob.size > 6 * 1048576) throw err("too_large");
      let r;
      try { r = await fetch("/api/blob", { method: "POST", headers: { "content-type": type, "x-file-name": encodeURIComponent(blob.name || "") }, credentials: "same-origin", body: blob }); }
      catch (e) { throw err("store_unavailable"); }
      if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw err(j.code || "store_unavailable"); }
      return r.json();
    }
  };

  /* ---------- Start ---------- */
  const ready = (async () => {
    if (document.readyState === "loading") await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
    let health = null;
    try { const r = await fetch("/api/health", { credentials: "same-origin", cache: "no-store" }); if (r.headers.get("content-type")?.includes("json")) health = await r.json(); } catch (e) {}
    if (!health) return { db: await localDb(), health: null };
    if (health.setup) { setupHint(); return new Promise(() => {}); }
    if (health.auth === "required") await askCode();
    const s = serverDb();
    await s.start();
    return { db: s.db, health };
  })();

  window.claude = {
    use(name) {
      if (name === "db") return ready.then(x => x.db);
      if (name === "sample") return ready.then(x => sample(x.health));
      if (name === "assets") return ready.then(x => (x.health ? assets : null));
      if (name === "user") return Promise.resolve({ isOwner: () => Promise.resolve(false) });
      return Promise.resolve(null);
    }
  };
})();
