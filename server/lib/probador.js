// Probador Samadhi (motor propio): prendas recortadas listas para calzar sobre la foto de la clienta.
// La foto de la clienta nunca llega al servidor: todo el cálculo pasa en su navegador.
// Acá se guardan las prendas (imagen con transparencia + puntos del cuerpo de la modelo) y el uso.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { db, all, get, run } from './db.js';
import { HttpError } from './util.js';

db.exec(`
CREATE TABLE IF NOT EXISTS tryon_garments (
  product_id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  kind TEXT NOT NULL,
  image_index INTEGER NOT NULL DEFAULT 0,
  pts TEXT NOT NULL,
  w INTEGER NOT NULL, h INTEGER NOT NULL,
  quality REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aprobada',
  source TEXT NOT NULL DEFAULT 'catálogo',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/** Primera vez: carga las prendas que vienen preparadas con el catálogo (public/probador). */
export function seedGarments() {
  if (get('SELECT COUNT(*) n FROM tryon_garments').n) return;
  const f = path.join(ROOT, 'public/probador/prendas.json');
  if (!existsSync(f)) return;
  const m = JSON.parse(readFileSync(f, 'utf8'));
  for (const [slug, g] of Object.entries(m)) {
    const p = get('SELECT id FROM products WHERE slug = ?', slug);
    if (!p) continue;
    run('INSERT OR IGNORE INTO tryon_garments(product_id, url, kind, image_index, pts, w, h, quality, status) VALUES(?,?,?,?,?,?,?,?,?)',
      p.id, `/probador/${slug}.webp`, g.kind, g.image || 0, JSON.stringify(g.pts), g.size[0], g.size[1], g.quality || 0, g.ok ? 'aprobada' : 'oculta');
  }
}

/** Prendas listas para la tienda: { productId: { url, kind, pts, w, h } }. */
export function publicGarments() {
  const out = {};
  for (const g of all("SELECT g.* FROM tryon_garments g JOIN products p ON p.id = g.product_id WHERE g.status = 'aprobada' AND p.visible = 1")) {
    out[g.product_id] = { url: g.url, kind: g.kind, pts: JSON.parse(g.pts), w: g.w, h: g.h };
  }
  return out;
}

export function adminGarments() {
  const rows = all(`SELECT p.id, p.name, p.slug, p.visible, (SELECT group_concat(c.name, ', ') FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id) cats,
      g.url, g.kind, g.image_index, g.quality, g.status, g.source, g.updated_at, g.pts, g.w, g.h
    FROM products p LEFT JOIN tryon_garments g ON g.product_id = p.id WHERE p.visible = 1 ORDER BY p.position, p.id`);
  const imgs = new Map();
  for (const i of all('SELECT product_id, url FROM images ORDER BY position')) { if (!imgs.has(i.product_id)) imgs.set(i.product_id, []); imgs.get(i.product_id).push(i.url); }
  return rows.map((r) => ({ ...r, pts: r.pts ? JSON.parse(r.pts) : null, images: (imgs.get(r.id) || []).slice(0, 4) }));
}

export function setGarment(productId, { status, kind }) {
  const g = get('SELECT * FROM tryon_garments WHERE product_id = ?', productId);
  if (!g) throw new HttpError(404, 'Esa prenda todavía no está preparada.');
  if (status && !['aprobada', 'oculta'].includes(status)) throw new HttpError(422, 'Estado inválido.');
  if (kind && !['top', 'bottom', 'full'].includes(kind)) throw new HttpError(422, 'Tipo inválido.');
  run("UPDATE tryon_garments SET status = COALESCE(?, status), kind = COALESCE(?, kind), updated_at = datetime('now') WHERE product_id = ?", status || null, kind || null, productId);
}

/** Guarda una prenda preparada desde el panel (el recorte se hace en el navegador de quien administra). */
export function saveGarment(productId, b) {
  if (!get('SELECT id FROM products WHERE id = ?', productId)) throw new HttpError(404, 'No encontramos ese producto.');
  const m = /^data:image\/(webp|png);base64,(.+)$/.exec(String(b.data || ''));
  if (!m) throw new HttpError(422, 'Falta la imagen de la prenda.');
  if (!['top', 'bottom', 'full'].includes(b.kind)) throw new HttpError(422, 'Tipo inválido.');
  const pts = Array.isArray(b.pts) ? b.pts.filter((p) => p && typeof p.name === 'string').map((p) => ({ name: p.name.slice(0, 12), x: Number(p.x) || 0, y: Number(p.y) || 0 })).slice(0, 40) : [];
  if (pts.length < 4) throw new HttpError(422, 'No se detectó el cuerpo en la foto de la prenda.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new HttpError(413, 'La imagen es muy pesada.');
  const dir = path.join(config.dataDir, 'uploads', 'probador');
  mkdirSync(dir, { recursive: true });
  const name = `${productId}-${Date.now().toString(36)}.${m[1]}`;
  writeFileSync(path.join(dir, name), buf);
  const size = Array.isArray(b.size) ? b.size.map((n) => Math.round(Number(n) || 0)) : [0, 0];
  run(`INSERT INTO tryon_garments(product_id, url, kind, image_index, pts, w, h, quality, status, source) VALUES(?,?,?,?,?,?,?,?,?, 'panel')
       ON CONFLICT(product_id) DO UPDATE SET url = excluded.url, kind = excluded.kind, image_index = excluded.image_index, pts = excluded.pts, w = excluded.w, h = excluded.h,
       quality = excluded.quality, status = excluded.status, source = 'panel', updated_at = datetime('now')`,
    productId, `/uploads/probador/${name}`, b.kind, Number(b.image) || 0, JSON.stringify(pts), size[0], size[1], Number(b.quality) || 0, b.status === 'oculta' ? 'oculta' : 'aprobada');
  return { url: `/uploads/probador/${name}` };
}
