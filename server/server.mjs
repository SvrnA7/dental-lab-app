// Eigener Server (Node 20+, keine Abhängigkeiten): liefert die App aus und speichert Daten im Ordner DATA_DIR.
// Start: LAB_CODE=geheim node server/server.mjs   (optional: PORT, DATA_DIR, ANTHROPIC_API_KEY, DATA_START=leer)
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { handleApi } from "../core/api.mjs";
import { handleAsk } from "../core/ask.mjs";
import { fsStore } from "../core/store-fs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");

// .env im Projektordner einlesen, falls vorhanden
try {
  for (const line of (await fs.readFile(path.join(root, ".env"), "utf8")).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch (e) {}

const env = process.env;
const store = fsStore(path.resolve(root, env.DATA_DIR || "data"));
const seed = JSON.parse(await fs.readFile(path.join(pub, "seed.json"), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

async function serveStatic(pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(pub, rel);
  if (!file.startsWith(pub + path.sep)) return new Response("Nicht gefunden", { status: 404 });
  try {
    const data = await fs.readFile(file);
    return new Response(data, { headers: { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": rel === "index.html" ? "no-cache" : "public, max-age=300" } });
  } catch (e) { return new Response("Nicht gefunden", { status: 404 }); }
}

const server = http.createServer(async (req, res) => {
  try {
    const proto = req.headers["x-forwarded-proto"] || "http";
    const url = new URL(req.url, `${proto}://${req.headers.host || "localhost"}`);
    const ctl = new AbortController();
    res.on("close", () => { if (!res.writableFinished) ctl.abort(); });
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const request = new Request(url, { method: req.method, headers: req.headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: hasBody ? "half" : undefined, signal: ctl.signal });
    let r;
    if (url.pathname === "/api/ask") r = await handleAsk(request, env);
    else if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_blob/")) r = await handleApi(request, { store, env, seed });
    else r = await serveStatic(url.pathname);
    const headers = {};
    r.headers.forEach((v, k) => { if (k !== "set-cookie") headers[k] = v; });
    const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (cookies.length) headers["set-cookie"] = cookies;
    res.writeHead(r.status, headers);
    if (!r.body) return res.end();
    for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (e) {
    if (e && e.name === "AbortError") return;
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "server_error" }));
  }
});

const port = +env.PORT || 8080;
server.listen(port, () => {
  console.log(`Laborplaner läuft auf http://localhost:${port}`);
  if (!env.LAB_CODE && env.ALLOW_OPEN !== "1") console.log("Hinweis: LAB_CODE ist nicht gesetzt. Bitte in .env eintragen (oder ALLOW_OPEN=1 nur im geschützten Netz).");
});
