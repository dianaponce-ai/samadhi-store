// Importa el CSV que exporta Tiendanube (Productos > Exportar) y, opcionalmente,
// la lista de fotos por producto. Se puede correr las veces que haga falta:
// actualiza por "Identificador de URL" y conserva los ids de las variantes.
import { readFileSync, existsSync } from 'node:fs';
import { db, all, get, run, tx, getSetting, setSetting } from './db.js';
import { slugify, titleCase } from './util.js';

const TN_CDN = 'https://acdn-us.mitiendanube.com/stores/180/768/products/';

export function decodeCsv(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function parseCsv(text, sep = ';') {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0]);
}

const money = (s) => {
  const n = Number(String(s || '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const num = (s, d) => {
  const n = Number(String(s || '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : d;
};

function cleanCollection(s) {
  const m = s.match(/(SS|AW)\s*['´’`]?\s*(\d{2})/i);
  return m ? `${m[1].toUpperCase()}'${m[2]}` : '';
}

const NAME_RULES = [
  [/^(vestido|vestidoo|tunica)/i, 'Vestidos'],
  [/^camisa/i, 'Camisas'],
  [/^blusa/i, 'Blusas'],
  [/^(musculosa)/i, 'Musculosas'],
  [/^(top deportivo|short deportivo)/i, 'Cápsula sport'],
  [/^remera/i, 'Remeras'],
  [/^(jean|baggy|wide leg)/i, 'Jean'],
  [/^(pantalon|pant\.)/i, 'Pantalones'],
  [/^(short|bermuda|falda|pollera)/i, 'Shorts y faldas'],
  [/^chaleco/i, 'Chalecos'],
  [/^(saco|blazer|tapado)/i, 'Sacos'],
  [/^campera/i, 'Camperas'],
  [/^(cardigan|sweater|buzo)/i, 'Sweaters'],
  [/^(mocasin|bucaneras|oxford|suecos|sandalia|mules|birk)/i, 'Calzado'],
  [/^bikini/i, 'Swim'],
  [/^pijama/i, 'Pijamas'],
  [/^(cinturon|faja|mini cartera|cartera)/i, 'Accesorios'],
  [/^(set|mono|conjunto)/i, 'Conjuntos'],
];
const CATEGORY_ALIASES = { Calzados: 'Calzado', Cardigans: 'Sweaters', Carteras: 'Accesorios', 'Capsula Sport': 'Cápsula sport', 'Shorts y Faldas': 'Shorts y faldas' };
export const normalizeCategory = (n) => CATEGORY_ALIASES[n] || n;

export function categoryFromName(name) {
  for (const [re, cat] of NAME_RULES) if (re.test(name.trim())) return cat;
  return 'Otros';
}

export function cleanDescription(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&([aeiou])acute;/g, (_, v) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' })[v])
    .replace(/&quot;/g, '"');
  let lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let ref = '';
  if (lines[0] && /^[A-Z]\d{2}[A-Z]{2}\d+$/i.test(lines[0])) ref = lines.shift().toUpperCase();
  lines = lines.filter((l) => !/^[A-Z]{1,3}$/.test(l) || /^(S|M|L|XL)$/.test(l));
  return { ref, text: lines.join('\n') };
}

export function parsePhotos(text) {
  const map = new Map();
  for (const line of String(text || '').split('\n')) {
    const [slug, ...files] = line.trim().split(/\s+/);
    if (!slug || !files.length) continue;
    map.set(slug, files.map((f) => (f.startsWith('http') ? f : TN_CDN + f.replace(/\.(webp|jpe?g|png)$/i, '') + '-1024-1024.webp')));
  }
  return map;
}

export function importTiendanube(csvBuffer, photosText = '') {
  const rows = parseCsv(decodeCsv(csvBuffer));
  const head = rows.shift().map((h) => h.trim());
  const idx = (name) => head.indexOf(name);
  const H = {
    slug: idx('Identificador de URL'), name: idx('Nombre'), cats: idx('Categorías'),
    p: [1, 2, 3].map((i) => [idx(`Nombre de propiedad ${i}`), idx(`Valor de propiedad ${i}`)]),
    price: idx('Precio'), promo: idx('Precio promocional'), weight: idx('Peso (kg)'),
    height: idx('Alto (cm)'), width: idx('Ancho (cm)'), depth: idx('Profundidad (cm)'),
    stock: idx('Stock'), sku: idx('SKU'), barcode: idx('Código de barras'), show: idx('Mostrar en tienda'),
    free: idx('Envío sin cargo'), desc: idx('Descripción'), seoT: idx('Título para SEO'),
    seoD: idx('Descripción para SEO'), vis: idx('Visibilidad'),
  };
  if (H.slug < 0 || H.price < 0) throw new Error('El archivo no parece una exportación de productos de Tiendanube: falta la columna "Identificador de URL" o "Precio".');

  const products = new Map();
  for (const r of rows) {
    const slug = (r[H.slug] || '').trim();
    if (!slug) continue;
    let p = products.get(slug);
    if (!p) {
      const cats = (r[H.cats] || '').split(',').map((s) => s.trim()).filter(Boolean);
      const { ref, text } = cleanDescription(r[H.desc]);
      p = {
        slug, name: titleCase(r[H.name] || slug), ref, description: text,
        cats, visible: (r[H.vis] || 'Visible') !== 'Oculto' && (r[H.show] || 'SI') !== 'NO',
        free: (r[H.free] || '') === 'SI', seoTitle: r[H.seoT] || '', seoDesc: r[H.seoD] || '',
        weight: num(r[H.weight], 0.5), height: num(r[H.height], 5), width: num(r[H.width], 30), depth: num(r[H.depth], 30),
        variants: [],
      };
      products.set(slug, p);
    }
    const v = { color: '', size: '', other: '' };
    for (const [ni, vi] of H.p) {
      const n = (r[ni] || '').trim().toLowerCase(), val = (r[vi] || '').trim();
      if (!n || !val) continue;
      if (n === 'color') v.color = titleCase(val);
      else if (n === 'talle') v.size = val.toUpperCase();
      else v.other = val;
    }
    const price = money(r[H.price]) ?? 0;
    const promo = money(r[H.promo]);
    v.price = price;
    v.promo = promo && promo < price ? promo : null;
    const st = (r[H.stock] || '').trim();
    v.stock = st === '' ? null : Math.max(0, Math.round(Number(st.replace(/,/g, ''))));
    v.sku = (r[H.sku] || '').trim();
    v.barcode = (r[H.barcode] || '').trim();
    p.variants.push(v);
  }

  const photos = parsePhotos(photosText);
  const stats = { products: 0, created: 0, updated: 0, variants: 0, images: 0, hidden: 0 };

  tx(() => {
    const catId = (name, collection) => {
      const slug = slugify(name);
      const c = get('SELECT id FROM categories WHERE slug = ?', slug);
      if (c) return c.id;
      const pos = (get('SELECT COALESCE(MAX(position),0)+1 AS n FROM categories').n);
      return Number(run('INSERT INTO categories(name, slug, collection, position) VALUES(?,?,?,?)', name, slug, collection, pos).lastInsertRowid);
    };
    let position = 0;
    for (const p of products.values()) {
      position++;
      stats.products++;
      if (!p.visible) stats.hidden++;
      const collections = new Set();
      const catNames = new Set();
      for (const c of p.cats) {
        const parts = c.split('>').map((s) => s.trim());
        const col = cleanCollection(parts[0]);
        if (col) collections.add(col);
        const name = parts[1] ? normalizeCategory(titleCase(parts[1])) : '';
        if (name) catNames.add(name);
      }
      if (!catNames.size) catNames.add(categoryFromName(p.name));
      const collection = [...collections].sort().reverse().join(', ');

      const existing = get('SELECT id FROM products WHERE slug = ?', p.slug);
      let pid;
      if (existing) {
        pid = existing.id;
        run(`UPDATE products SET name=?, ref_code=?, description=?, collection=?, visible=?, free_shipping=?, position=?,
             weight_kg=?, height_cm=?, width_cm=?, depth_cm=?, seo_title=?, seo_description=?, updated_at=datetime('now') WHERE id=?`,
          p.name, p.ref, p.description, collection, p.visible ? 1 : 0, p.free ? 1 : 0, position,
          p.weight, p.height, p.width, p.depth, p.seoTitle, p.seoDesc, pid);
        stats.updated++;
      } else {
        pid = Number(run(`INSERT INTO products(slug, name, ref_code, description, collection, visible, free_shipping, position,
             weight_kg, height_cm, width_cm, depth_cm, seo_title, seo_description) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          p.slug, p.name, p.ref, p.description, collection, p.visible ? 1 : 0, p.free ? 1 : 0, position,
          p.weight, p.height, p.width, p.depth, p.seoTitle, p.seoDesc).lastInsertRowid);
        stats.created++;
      }
      run('DELETE FROM product_categories WHERE product_id = ?', pid);
      for (const name of catNames) run('INSERT OR IGNORE INTO product_categories(product_id, category_id) VALUES(?,?)', pid, catId(name, collection));

      const keep = [];
      p.variants.forEach((v, i) => {
        const ex = get('SELECT id FROM variants WHERE product_id=? AND color=? AND size=? AND other=?', pid, v.color, v.size, v.other);
        if (ex) {
          run('UPDATE variants SET price=?, promo_price=?, stock=?, sku=?, barcode=?, position=? WHERE id=?', v.price, v.promo, v.stock, v.sku, v.barcode, i, ex.id);
          keep.push(ex.id);
        } else {
          keep.push(Number(run('INSERT INTO variants(product_id,color,size,other,price,promo_price,stock,sku,barcode,position) VALUES(?,?,?,?,?,?,?,?,?,?)',
            pid, v.color, v.size, v.other, v.price, v.promo, v.stock, v.sku, v.barcode, i).lastInsertRowid));
        }
        stats.variants++;
      });
      if (keep.length) run(`DELETE FROM variants WHERE product_id = ? AND id NOT IN (${keep.map(() => '?').join(',')})`, pid, ...keep);

      const imgs = photos.get(p.slug);
      if (imgs && imgs.length) {
        run('DELETE FROM images WHERE product_id = ?', pid);
        imgs.forEach((url, i) => run('INSERT INTO images(product_id, url, position) VALUES(?,?,?)', pid, url, i));
        stats.images += imgs.length;
      }
    }
  });
  return stats;
}

// Banners iniciales con fotos reales de la tienda (se editan desde el panel).
/** Portada con video: se suma una sola vez como primer banner (después se edita o se borra desde el panel). */
export function seedHeroVideo() {
  if (getSetting('flags').heroVideo) return;
  setSetting('flags', { ...getSetting('flags'), heroVideo: true });
  if (get("SELECT COUNT(*) n FROM banners WHERE video_url <> ''").n) return;
  run('UPDATE banners SET position = position + 1');
  run('INSERT INTO banners(eyebrow,title,subtitle,cta_label,cta_link,image_url,video_url,tone,position) VALUES(?,?,?,?,?,?,?,?,0)',
    "Samadhi Style · SS'27", 'Esencia', 'Lo auténtico también se viste.', 'Ver la colección', '#tienda', '/media/hero-poster.jpg', '/media/hero.mp4', 'dark');
}

/** Portada sólo con videos: suma dos videos más y deja inactivos los banners de foto (se reactivan desde el panel). */
export function seedHeroVideos2() {
  if (getSetting('flags').heroVideos2) return;
  setSetting('flags', { ...getSetting('flags'), heroVideos2: true });
  const first = get("SELECT position FROM banners WHERE video_url <> '' ORDER BY position LIMIT 1");
  const base = first ? first.position : 0;
  run("UPDATE banners SET active = 0 WHERE video_url = ''");
  run('UPDATE banners SET position = position + 2 WHERE position > ?', base);
  const add = (pos, eyebrow, title, subtitle, cta, link, n) => run('INSERT INTO banners(eyebrow,title,subtitle,cta_label,cta_link,image_url,video_url,tone,position) VALUES(?,?,?,?,?,?,?,?,?)',
    eyebrow, title, subtitle, cta, link, `/media/hero-${n}-poster.jpg`, `/media/hero-${n}.mp4`, 'dark', pos);
  add(base + 1, "Colección SS'27", 'Boho', 'Bordados, encaje y caída para los días largos.', 'Ver Boho', '#c/boho', 2);
  add(base + 2, 'Nueva temporada', 'Para volver a vos', 'Prendas con alma propia.', 'Ver la colección', '#tienda', 3);
}

export function seedBannersIfEmpty() {
  if (get('SELECT COUNT(*) AS n FROM banners').n) return;
  const pic = (slug) => get('SELECT i.url FROM images i JOIN products p ON p.id = i.product_id WHERE p.slug = ? ORDER BY i.position LIMIT 1', slug)?.url;
  const seeds = [
    ["Colección SS'27", 'Boho', 'Bordados, encaje y caída para los días largos.', 'Ver Boho', '#c/boho', 'vestido-ranya-cqquy', 'dark'],
    ['Denim', 'Saltan Pepa', 'Wide leg, crop y tiro alto. El jean que se queda.', 'Ver denim', '#c/denim', 'wide-leg-black-1r57j', 'dark'],
    ['Vestidos', 'Para volver a vos', 'Largos, livianos y con alma propia.', 'Ver vestidos', '#c/vestidos', 'vestido-adalia-69js0', 'dark'],
    ['Sacos y chalecos', 'Lo auténtico también se viste', 'Capas que arman el look.', 'Ver sacos', '#c/sacos', 'saco-gretta-1l0hk', 'dark'],
  ];
  seeds.forEach(([eyebrow, title, subtitle, cta, link, slug, tone], i) => {
    const url = pic(slug);
    if (url) run('INSERT INTO banners(eyebrow,title,subtitle,cta_label,cta_link,image_url,tone,position) VALUES(?,?,?,?,?,?,?,?)', eyebrow, title, subtitle, cta, link, url, tone, i);
  });
}

export function seedFeaturedIfEmpty() {
  if (get('SELECT COUNT(*) AS n FROM products WHERE featured = 1').n) return;
  // Destaca las prendas con foto de estudio (las "dsc" de la última sesión).
  run(`UPDATE products SET featured = 1 WHERE id IN (
         SELECT product_id FROM images WHERE position = 0 AND url LIKE '%/dsc0%')`);
}

export { db };

/**
 * Productos que no vienen de Tiendanube (por ejemplo, prendas de prueba del probador): data/import/productos-extra.json
 * [{ slug, name, price, category, images: ['/media/productos/x.png'], sizes: ['S','M'], stock, description }]
 */
export function importExtras(file) {
  if (!existsSync(file)) return 0;
  const list = JSON.parse(readFileSync(file, 'utf8'));
  let n = 0;
  for (const x of list) {
    let p = get('SELECT id FROM products WHERE slug = ?', x.slug);
    if (!p) {
      const pos = (get('SELECT MIN(position) m FROM products').m ?? 0) - 1;
      const id = Number(run(`INSERT INTO products(slug, name, ref_code, description, collection, visible, featured, free_shipping, position, weight_kg, height_cm, width_cm, depth_cm)
        VALUES(?,?,?,?,?,1,1,0,?,0.5,5,30,30)`, x.slug, x.name, x.ref || '', x.description || '', x.collection || '', pos).lastInsertRowid);
      (x.images || []).forEach((u, i) => run('INSERT INTO images(product_id, url, position) VALUES(?,?,?)', id, u, i));
      (x.sizes?.length ? x.sizes : ['U']).forEach((sz, i) => run('INSERT INTO variants(product_id, color, size, price, stock, position) VALUES(?,?,?,?,?,?)', id, x.color || '', sz, x.price, x.stock ?? 5, i));
      if (x.category) { const c = get('SELECT id FROM categories WHERE name = ?', x.category); if (c) run('INSERT OR IGNORE INTO product_categories(product_id, category_id) VALUES(?,?)', id, c.id); }
      n++;
    }
  }
  return n;
}
