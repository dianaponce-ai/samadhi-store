// Calcula las máscaras de prenda de todo el catálogo con el modelo de recorte (ver server/lib/cloth-seg.js).
// Uso: node scripts/probador-mascaras.js carpeta-salida   (necesita npm run probador:instalar)
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { all } from '../server/lib/db.js';
import { garmentMask, available } from '../server/lib/cloth-seg.js';

const out = process.argv[2] || 'dist/mascaras';
const kindArg = JSON.parse(process.argv[3] || '{}'); // { slug: kind }
if (!(await available())) { console.error('Falta npm run probador:instalar'); process.exit(1); }
mkdirSync(out, { recursive: true });
const rows = all(`SELECT p.id, p.slug FROM products p WHERE p.visible = 1 ORDER BY p.position, p.id`);
let n = 0;
for (const p of rows) {
  const kind = kindArg[p.slug]; if (!kind) continue;
  const imgs = all('SELECT url FROM images WHERE product_id = ? ORDER BY position LIMIT 2', p.id);
  for (const [i, im] of imgs.entries()) {
    const f = path.join(out, `${p.slug}-${i}.png`); if (existsSync(f)) continue;
    const url = im.url.replace(/-\d+-\d+\.(webp|jpg|png)$/, '-1024-1024.$1');
    try {
      const r = await fetch(url); if (!r.ok) throw new Error(r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(path.join(out, `${p.slug}-${i}.src.webp`), buf);
      const m = await garmentMask(buf, kind);
      writeFileSync(f, m.png);
    } catch (e) { console.log(p.slug, i, e.message); }
  }
  if (++n % 10 === 0) console.log(n, 'productos');
}
console.log('listo', n);
