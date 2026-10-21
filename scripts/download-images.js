// Copia a tu servidor las fotos que hoy están en Tiendanube (útil antes de dar de baja esa tienda).
// Uso: npm run download-images
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../server/lib/config.js';
import { all, run } from '../server/lib/db.js';

const dir = path.join(config.dataDir, 'uploads');
mkdirSync(dir, { recursive: true });

async function localize(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (url.match(/\.(webp|jpe?g|png)(\?|$)/i)?.[1] || 'webp').toLowerCase();
  const name = `tn-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)}.${ext}`;
  writeFileSync(path.join(dir, name), buf);
  return `/uploads/${name}`;
}

let ok = 0, fail = 0;
for (const table of ['images', 'banners']) {
  const col = table === 'images' ? 'url' : 'image_url';
  const rows = all(`SELECT id, ${col} AS url FROM ${table} WHERE ${col} LIKE 'http%'`);
  for (const r of rows) {
    try {
      const local = await localize(r.url);
      run(`UPDATE ${table} SET ${col} = ? WHERE id = ?`, local, r.id);
      ok++;
    } catch (e) {
      fail++;
      console.error(`No se pudo bajar ${r.url}: ${e.message}`);
    }
  }
}
console.log(`Fotos copiadas: ${ok}. Con error: ${fail}.`);
