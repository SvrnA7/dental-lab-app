// Speicher-Adapter für den eigenen Server: Ordner mit JSON-Dateien je Sammlung und einem Dateien-Unterordner.
import { promises as fs } from "node:fs";
import path from "node:path";

export function fsStore(dir) {
  const fdir = path.join(dir, "dateien");
  let ready = null;
  const init = () => ready || (ready = Promise.all([fs.mkdir(dir, { recursive: true }), fs.mkdir(fdir, { recursive: true })]));
  const cache = {};
  let queue = Promise.resolve(); // Schreibvorgänge nacheinander
  const read = async c => {
    if (cache[c]) return cache[c];
    try { return (cache[c] = JSON.parse(await fs.readFile(path.join(dir, c + ".json"), "utf8"))); } catch (e) { return null; }
  };
  return {
    async getColl(c) { await init(); const d = await read(c); return d ? { data: d, etag: String(d.v) } : null; },
    async getVersion(c) { await init(); const d = await read(c); return d ? d.v : 0; },
    putColl(c, value, etag) {
      return (queue = queue.then(async () => {
        await init();
        const cur = await read(c);
        if (etag === null ? cur : (!cur || String(cur.v) !== etag)) return false;
        const file = path.join(dir, c + ".json");
        await fs.writeFile(file + ".tmp", JSON.stringify(value));
        await fs.rename(file + ".tmp", file);
        cache[c] = value;
        return true;
      }));
    },
    async putFile(id, buf, meta) {
      await init();
      await fs.writeFile(path.join(fdir, id), Buffer.from(buf));
      await fs.writeFile(path.join(fdir, id + ".json"), JSON.stringify(meta));
    },
    async getFile(id) {
      await init();
      try { return { data: await fs.readFile(path.join(fdir, id)), meta: JSON.parse(await fs.readFile(path.join(fdir, id + ".json"), "utf8")) }; } catch (e) { return null; }
    }
  };
}
