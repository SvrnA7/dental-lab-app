// Speicher-Adapter für Netlify Blobs: eine JSON-Datei je Sammlung, Schreiben mit ETag-Prüfung.
import { getStore } from "@netlify/blobs";

export function blobsStore(opts = {}) {
  const data = getStore({ name: "laborplaner", consistency: "strong", ...opts });
  const files = getStore({ name: "laborplaner-dateien", consistency: "strong", ...opts });
  return {
    async getColl(c) {
      const r = await data.getWithMetadata("c/" + c, { type: "json" });
      return r ? { data: r.data, etag: r.etag || "" } : null; // "" = ETag unbekannt (lokale Testumgebung)
    },
    async getVersion(c) {
      const m = await data.getMetadata("c/" + c);
      return m ? +(m.metadata && m.metadata.v) || 0 : 0;
    },
    async putColl(c, value, etag) {
      const r = await data.setJSON("c/" + c, value, { metadata: { v: value.v }, ...(etag === null ? { onlyIfNew: true } : etag ? { onlyIfMatch: etag } : {}) });
      return r ? r.modified !== false : true;
    },
    async putFile(id, buf, meta) { await files.set(id, buf, { metadata: meta }); },
    async getFile(id) {
      const r = await files.getWithMetadata(id, { type: "arrayBuffer" });
      return r ? { data: r.data, meta: r.metadata || {} } : null;
    }
  };
}
