// Anmeldung per Laborcode: signiertes Cookie (HMAC-SHA256), läuft in Node, Netlify Functions und Edge (nur Web-APIs).
const COOKIE = "lp_s";
const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmacKey(env) {
  const secret = env.SESSION_SECRET || "lp-session:" + (env.LAB_CODE || "");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function sign(env, payload) { return b64url(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload))); }

function sameText(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const authMode = env => env.LAB_CODE ? "code" : (env.ALLOW_OPEN === "1" ? "open" : "unset");

function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1)); }
  return "";
}

// true, wenn die Anfrage zugreifen darf
export async function isAuthed(req, env) {
  const mode = authMode(env);
  if (mode === "open") return true;
  if (mode === "unset") return false;
  const c = readCookie(req, COOKIE);
  const [exp, mac] = c.split(".");
  if (!exp || !mac || +exp < Date.now() / 1000) return false;
  return sameText(mac, await sign(env, "v1:" + exp));
}

export async function loginCookie(req, env, code) {
  if (authMode(env) !== "code" || !sameText(String(code || "").trim(), env.LAB_CODE)) return null;
  const days = +env.SESSION_DAYS || 180;
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${exp}.${await sign(env, "v1:" + exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure}`;
}
export const logoutCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
