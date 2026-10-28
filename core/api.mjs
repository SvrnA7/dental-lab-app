// Gemeinsamer Server-Kern: Daten-API, Dateien, Anmeldung. Speicher kommt als Adapter (Netlify Blobs oder Dateisystem).
import { authMode, isAuthed, loginCookie, logoutCookie } from "./auth.mjs";

export const COLLS = ["employees", "absences", "machines", "jobtypes", "orders", "notes", "materials", "cases", "positions", "offers", "config"];
const SEED_BASE = "2026-10-22"; // Stichtag der Beispieldaten

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const fail = (code, status) => json({ code }, status);

/* Beispieldaten auf heute verschieben (in ganzen Wochen, damit Wochentage gleich bleiben) */
export function shiftSeed(seed, now = new Date()) {
  const base = Date.UTC(...SEED_BASE.split("-").map((v, i) => i === 1 ? v - 1 : +v));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - base) / 864e5 / 7) * 7;
  if (!days) return structuredClone(seed);
  const shiftDate = s => { const d = new Date(s.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) + s.slice(10); };
  const isDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s);
  const walk = (x, key) => {
    if (key === "holidays") return x;
    if (Array.isArray(x)) return x.map(v => walk(v));
    if (x && typeof x === "object") { const o = {}; for (const [k, v] of Object.entries(x)) o[isDate(k) ? shiftDate(k) : k] = walk(v, k); return o; }
    return isDate(x) ? shiftDate(x) : x;
  };
  return walk(seed);
}

async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

/* Startdaten: "demo" = Beispiellabor, "leer" = nur Stammdaten + ein Admin-Zugang (PIN 1234) */
export async function startData(seed, env) {
  if ((env.DATA_START || "demo") !== "leer") return shiftSeed(seed);
  const out = Object.fromEntries(COLLS.map(c => [c, {}]));
  for (const c of ["config", "jobtypes", "machines", "positions"]) out[c] = structuredClone(seed[c] || {});
  out.config.labName = env.LAB_NAME || "Mein Dentallabor";
  out.config.labAddress = "";
  out.employees.admin = { name: "Laborleitung", short: "LL", role: "Laborleitung", color: "#1F4D3F", hours: [8, 8, 8, 8, 6], factor: 1, skills: out.config.skills || [], perm: "admin", pinHash: await sha256hex("lp:admin:1234"), dayHours: {} };
  return out;
}

let initDone = false;
async function ensureInit(store, seed, env) {
  if (initDone) return;
  if (!(await store.getColl("config"))) {
    const data = await startData(seed, env);
    // parallel, damit der erste Start sicher im Zeitlimit der Function bleibt; config zuletzt als Fertig-Marke
    await Promise.all(COLLS.filter(c => c !== "config").map(c => store.putColl(c, { v: 1, docs: data[c] || {} }, null))); // nur wenn noch nicht vorhanden
    await store.putColl("config", { v: 1, docs: { main: data.config || {} } }, null);
  }
  initDone = true;
}

async function writeDoc(store, coll, id, data) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getColl(coll);
    const next = cur ? { v: (cur.data.v || 0) + 1, docs: { ...cur.data.docs } } : { v: 1, docs: {} };
    if (data === null) delete next.docs[id]; else next.docs[id] = data;
    if (await store.putColl(coll, next, cur ? cur.etag : null)) return next.v;
    await new Promise(r => setTimeout(r, 40 + Math.random() * 120 * (i + 1)));
  }
  throw new Error("conflict");
}

export async function handleApi(req, { store, env, seed }) {
  const url = new URL(req.url);
  const p = url.pathname;
  const mode = authMode(env);

  if (p === "/api/health") {
    if (mode === "unset") return json({ ok: false, setup: "LAB_CODE" }, 503);
    if (url.searchParams.has("check")) { // Speicher-Test zur Fehlersuche, gibt keine Daten preis
      const t0 = Date.now();
      try { const v = await store.getVersion("config"); return json({ ok: true, storage: "ok", initialized: !!v, ms: Date.now() - t0 }); }
      catch (e) { return json({ ok: false, storage: "error", error: String(e && e.message || e).slice(0, 300), ms: Date.now() - t0 }, 500); }
    }
    return json({ ok: true, auth: mode === "open" ? "open" : (await isAuthed(req, env) ? "ok" : "required"), ai: !!env.ANTHROPIC_API_KEY, lab: env.LAB_NAME || "" });
  }
  if (p === "/api/login" && req.method === "POST") {
    if (mode === "unset") return fail("setup", 503);
    let body = {}; try { body = await req.json(); } catch (e) {}
    const cookie = await loginCookie(req, env, body.code);
    if (!cookie) { await new Promise(r => setTimeout(r, 600)); return fail("wrong_code", 401); }
    return json({ ok: true }, 200, { "set-cookie": cookie });
  }
  if (p === "/api/logout" && req.method === "POST") return json({ ok: true }, 200, { "set-cookie": logoutCookie() });

  if (!(await isAuthed(req, env))) return fail("session_expired", 401);
  await ensureInit(store, seed, env);

  if (p === "/api/sync" && req.method === "GET") {
    const known = Object.fromEntries((url.searchParams.get("known") || "").split(",").filter(Boolean).map(s => s.split(":")).map(([k, v]) => [k, +v]));
    const out = { v: {}, colls: {} };
    await Promise.all(COLLS.map(async c => {
      const v = await store.getVersion(c);
      out.v[c] = v || 0;
      if (known[c] === undefined || known[c] !== (v || 0)) {
        const cur = await store.getColl(c);
        out.colls[c] = cur ? cur.data : { v: 0, docs: {} };
        out.v[c] = out.colls[c].v;
      }
    }));
    return json(out);
  }
  if (p === "/api/write" && req.method === "POST") {
    let body; try { body = await req.json(); } catch (e) { return fail("invalid_argument", 400); }
    const { coll, id, data } = body || {};
    if (!COLLS.includes(coll) || typeof id !== "string" || !/^[\w.-]{1,80}$/.test(id) || (data !== null && (typeof data !== "object" || Array.isArray(data)))) return fail("invalid_argument", 400);
    try { return json({ v: await writeDoc(store, coll, id, data) }); } catch (e) { return fail("conflict", 409); }
  }
  if (p === "/api/export" && req.method === "GET") {
    const all = {};
    for (const c of COLLS) { const cur = await store.getColl(c); all[c] = cur ? (c === "config" ? cur.data.docs.main || {} : cur.data.docs) : {}; }
    const name = `laborplaner-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(all, null, 1), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
  }
  if (p === "/api/blob" && req.method === "POST") {
    const max = (+env.MAX_UPLOAD_MB || 6) * 1048576;
    const type = (req.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    if (!/^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|text\/plain|text\/markdown|application\/octet-stream|model\/stl|application\/sla)$/.test(type)) return fail("unsupported_type", 415);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > max) return fail("too_large", 413);
    const id = crypto.randomUUID().replace(/-/g, "");
    await store.putFile(id, buf, { type, name: decodeURIComponent(req.headers.get("x-file-name") || "") });
    return json({ id, contentType: type });
  }
  if (p.startsWith("/_blob/") && req.method === "GET") {
    const id = p.slice(7);
    if (!/^[a-f0-9]{32}$/.test(id)) return fail("not_found", 404);
    const f = await store.getFile(id);
    if (!f) return fail("not_found", 404);
    return new Response(f.data, { headers: { "content-type": f.meta.type || "application/octet-stream", "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  }
  return fail("not_found", 404);
}
