import { all, getSetting } from './db.js';
import { publicContent } from './content.js';
import { publicTryon } from '../integrations/fashn.js';

let cache = null;
export const invalidateCatalog = () => { cache = null; };

/** Catálogo público: solo productos visibles, con variantes, fotos y categorías. */
export function publicCatalog() {
  if (cache) return cache;
  const products = all(`SELECT id, slug, name, ref_code, description, collection, featured, free_shipping, position, created_at
                        FROM products WHERE visible = 1 ORDER BY position, id`);
  const ids = new Set(products.map((p) => p.id));
  const variants = all('SELECT id, product_id, color, size, other, price, promo_price, stock FROM variants ORDER BY position, id');
  const images = all('SELECT product_id, url FROM images ORDER BY position, id');
  const pcs = all('SELECT product_id, category_id FROM product_categories');
  const byP = (rows) => rows.reduce((m, r) => (ids.has(r.product_id) && (m[r.product_id] ||= []).push(r), m), {});
  const V = byP(variants), I = byP(images), C = byP(pcs);

  const out = products.map((p) => {
    const vs = (V[p.id] || []).map((v) => ({ id: v.id, color: v.color, size: v.size, other: v.other, price: v.price, promo: v.promo_price, stock: v.stock }));
    const minNow = Math.min(...vs.map((v) => v.promo ?? v.price));
    const ref = vs.find((v) => (v.promo ?? v.price) === minNow) || vs[0] || {};
    return {
      id: p.id, slug: p.slug, name: p.name, ref: p.ref_code, desc: p.description, collection: p.collection,
      featured: !!p.featured, freeShipping: !!p.free_shipping, isNew: /SS'27/.test(p.collection),
      images: (I[p.id] || []).map((i) => i.url),
      categories: (C[p.id] || []).map((c) => c.category_id),
      price: ref.price ?? 0, promo: ref.promo ?? null,
      variants: vs,
      inStock: vs.some((v) => v.stock === null || v.stock > 0),
    };
  }).filter((p) => p.variants.length && p.price > 0);

  const used = new Set(out.flatMap((p) => p.categories));
  const categories = all('SELECT id, name, slug, collection, position FROM categories WHERE visible = 1 ORDER BY position, name')
    .filter((c) => used.has(c.id))
    .map((c) => ({ ...c, count: out.filter((p) => p.categories.includes(c.id)).length }));
  const banners = all('SELECT id, eyebrow, title, subtitle, cta_label, cta_link, image_url, video_url, tone FROM banners WHERE active = 1 ORDER BY position, id');
  const store = getSetting('store');
  const shipping = getSetting('shipping');
  const pay = getSetting('payments');
  cache = {
    products: out,
    categories,
    banners,
    store: { name: store.name, tagline: store.tagline, instagram: store.instagram, whatsapp: store.whatsapp, email: store.email, announcement: store.announcement, spaUrl: store.spaUrl },
    shipping: {
      pickup: shipping.pickupEnabled ? { address: shipping.pickupAddress, hours: shipping.pickupHours } : null,
      freeShippingFrom: shipping.freeShippingFrom || 0,
      domicilio: !!shipping.andreaniDomicilio,
      sucursal: !!shipping.andreaniSucursal,
    },
    payments: { installments: pay.installments || 1, transfer: pay.transferEnabled ? { discount: pay.transferDiscount || 0 } : null },
    content: publicContent(),
    tryon: publicTryon(),
    generatedAt: new Date().toISOString(),
  };
  return cache;
}
