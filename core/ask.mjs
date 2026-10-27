// KI-Fragen an Claude (Anthropic Messages API, Streaming). Gibt reinen Text als Stream zurück.
// Läuft in Node 20+ und in Netlify Edge Functions (Deno), daher fetch statt SDK.
import { isAuthed } from "./auth.mjs";

const fail = (code, status) => new Response(JSON.stringify({ code }), { status, headers: { "content-type": "application/json" } });

export async function handleAsk(req, env) {
  if (req.method !== "POST") return fail("not_found", 404);
  if (!(await isAuthed(req, env))) return fail("session_expired", 401);
  if (!env.ANTHROPIC_API_KEY) return fail("sampling_disabled", 503);
  let body; try { body = await req.json(); } catch (e) { return fail("invalid_argument", 400); }
  const input = body && body.input;
  const messages = typeof input === "string"
    ? [{ role: "user", content: input }]
    : (Array.isArray(input) ? input.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content) : []);
  if (!messages.length || messages[messages.length - 1].role !== "user") return fail("invalid_argument", 400);
  if (messages.reduce((n, m) => n + m.content.length, 0) > 400000) return fail("prompt_too_large", 413);

  const upstream = await fetch((env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: +env.ANTHROPIC_MAX_TOKENS || 2048, stream: true, messages }),
    signal: req.signal
  }).catch(() => null);
  if (!upstream) return fail("upstream", 502);
  if (!upstream.ok) {
    const t = await upstream.text().catch(() => "");
    if (upstream.status === 429 || upstream.status === 529) return fail("rate_limited", 429);
    if (upstream.status === 413 || /prompt is too long|too many tokens/i.test(t)) return fail("prompt_too_large", 413);
    if (upstream.status === 401 || upstream.status === 403) return fail("sampling_disabled", 503);
    console.error("Anthropic-Fehler", upstream.status, t.slice(0, 300));
    return fail("upstream", 502);
  }

  const reader = upstream.body.getReader();
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = "";
  const stream = new ReadableStream({
    async pull(ctl) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { ctl.close(); return; }
        buf += dec.decode(value, { stream: true });
        let out = "", i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
            if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") out += ev.delta.text;
          }
        }
        if (out) { ctl.enqueue(enc.encode(out)); return; }
      }
    },
    cancel() { reader.cancel().catch(() => {}); }
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
