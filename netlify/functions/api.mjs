// Netlify Function: Daten-API und Dateien. Die KI-Fragen laufen über die Edge Function ask.mjs.
import { handleApi } from "../../core/api.mjs";
import { blobsStore } from "../../core/store-blobs.mjs";
import seed from "../../public/seed.json";

let store;
const env = () => ({
  LAB_CODE: Netlify.env.get("LAB_CODE"), ALLOW_OPEN: Netlify.env.get("ALLOW_OPEN"), SESSION_SECRET: Netlify.env.get("SESSION_SECRET"),
  SESSION_DAYS: Netlify.env.get("SESSION_DAYS"), DATA_START: Netlify.env.get("DATA_START"), LAB_NAME: Netlify.env.get("LAB_NAME"),
  ANTHROPIC_API_KEY: Netlify.env.get("ANTHROPIC_API_KEY"), MAX_UPLOAD_MB: Netlify.env.get("MAX_UPLOAD_MB")
});

export default async req => {
  store = store || blobsStore();
  try { return await handleApi(req, { store, env: env(), seed }); }
  catch (e) { console.error(e); return new Response(JSON.stringify({ code: "store_unavailable", error: String(e && e.message || e).slice(0, 300) }), { status: 500, headers: { "content-type": "application/json" } }); }
};

export const config = { path: ["/api/*", "/_blob/*"] };
