import { Router, raw, json as expressJson } from 'express';
const express_json_big = expressJson({ limit: '4mb' });
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, run, tx, getSetting, setSetting } from '../lib/db.js';
import { config } from '../lib/config.js';
import { HttpError, slugify, isEmail } from '../lib/util.js';
import { invalidateCatalog } from '../lib/catalog.js';
import { requireAdmin, requireRole, checkPassword, setSession, clearSession, loginLimiter, createAdmin, hashPassword, ROLES } from '../lib/auth.js';
import * as orders from '../lib/orders.js';
import * as andreani from '../integrations/andreani.js';
import * as mp from '../integrations/mercadopago.js';
import { importTiendanube, seedBannersIfEmpty } from '../lib/importer.js';
import * as lince from '../integrations/dragonfish.js';
import { computeStats, resolveRange } from '../lib/stats-core.js';
import * as content from '../lib/content.js';
import * as tryon from '../integrations/fashn.js';
import * as probador from '../lib/probador.js';
import * as clothSeg from '../lib/cloth-seg.js';

export const admin = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const int = (v, d = null) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? d : Math.round(Number(v)));

// ── Sesión ─────────────────────────────────────────────────────
admin.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const u = get('SELECT * FROM admin_users WHERE email = ?', String(email || '').toLowerCase().trim());
  if (!u || !checkPassword(password, u.password_hash)) throw new HttpError(401, 'El email o la contraseña no coinciden.');
  setSession(res, u);
  res.json({ email: u.email, name: u.name, role: u.role });
});
admin.post('/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });
admin.get('/setup-needed', (req, res) => res.json({ needed: get('SELECT COUNT(*) AS n FROM admin_users').n === 0 }));

admin.use(requireAdmin);
admin.get('/me', (req, res) => res.json({ ...req.admin, roleLabel: ROLES[req.admin.role] }));
const onlyAdmin = requireRole('admin');

// ── Resumen ────────────────────────────────────────────────────
admin.get('/dashboard', (req, res) => {
  const paidStates = "('paid','preparing','ready_pickup','shipped','delivered')";
  const sales = (days) => get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS total FROM orders WHERE status IN ${paidStates} AND paid_at >= datetime('now', ?)`, `-${days} days`);
  const byStatus = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').map((r) => [r.status, r.n]));
  const daily = all(`SELECT date(paid_at) AS day, SUM(total) AS total, COUNT(*) AS orders FROM orders
                     WHERE status IN ${paidStates} AND paid_at >= datetime('now','-30 days') GROUP BY day ORDER BY day`);
  const lowStock = all(`SELECT v.id, v.color, v.size, v.stock, p.id AS product_id, p.name FROM variants v JOIN products p ON p.id = v.product_id
                        WHERE p.visible = 1 AND v.stock IS NOT NULL AND v.stock BETWEEN 1 AND 2 ORDER BY v.stock, p.name LIMIT 12`);
  const top = all(`SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.unit_price) AS total FROM order_items oi JOIN orders o ON o.id = oi.order_id
                   WHERE o.status IN ${paidStates} AND o.paid_at >= datetime('now','-30 days') GROUP BY oi.name ORDER BY qty DESC LIMIT 6`);
  const recent = all('SELECT id, number, name, total, status, created_at FROM orders ORDER BY id DESC LIMIT 8');
  const catalog = get(`SELECT COUNT(*) AS products, SUM(visible) AS visible FROM products`);
  const soldOut = get(`SELECT COUNT(*) AS n FROM products p WHERE p.visible = 1 AND NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND (v.stock IS NULL OR v.stock > 0))`).n;
  res.json({ today: sales(1), week: sales(7), month: sales(30), byStatus, daily, lowStock, top, recent, catalog: { ...catalog, soldOut }, toShip: (byStatus.paid || 0) + (byStatus.preparing || 0) });
});

// ── Pedidos ────────────────────────────────────────────────────
admin.get('/orders', (req, res) => {
  const { status = '', q = '' } = req.query;
  const page = Math.max(1, int(req.query.page, 1));
  const where = [], p = [];
  if (status) { where.push('status = ?'); p.push(status); }
  if (q) { where.push('(number LIKE ? OR name LIKE ? OR email LIKE ? OR andreani_number LIKE ?)'); p.push(...Array(4).fill(`%${q}%`)); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) AS n FROM orders ${w}`, ...p).n;
  const rows = all(`SELECT id, number, name, email, total, status, payment_status, shipping_method, andreani_number, created_at,
                    (SELECT SUM(qty) FROM order_items WHERE order_id = orders.id) AS units FROM orders ${w} ORDER BY id DESC LIMIT 50 OFFSET ?`, ...p, (page - 1) * 50);
  res.json({ rows, total, page, statuses: orders.ORDER_STATUS, methods: orders.SHIPPING_METHOD });
});

admin.get('/orders.csv', (req, res) => {
  const rows = all(`SELECT number, created_at, status, payment_status, name, email, phone, dni, subtotal, discount, shipping_cost, total, coupon_code,
                    shipping_method, shipping_address, andreani_number FROM orders ORDER BY id DESC`);
  const cols = Object.keys(rows[0] || { number: '' });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="pedidos-samadhi.csv"');
  res.send('﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n'));
});

function orderDetail(id) {
  const o = get('SELECT * FROM orders WHERE id = ?', id);
  if (!o) throw new HttpError(404, 'No encontramos ese pedido.');
  return {
    ...o,
    shipping_address: JSON.parse(o.shipping_address || '{}'),
    tracking_events: JSON.parse(o.tracking_events || '[]'),
    items: all('SELECT * FROM order_items WHERE order_id = ?', id),
    events: all('SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC', id),
    statusLabel: orders.ORDER_STATUS[o.status],
    methodLabel: orders.SHIPPING_METHOD[o.shipping_method],
    paymentLabel: mp.PAYMENT_STATUS_ES[o.payment_status] || o.payment_status,
    trackingUrl: o.andreani_number ? andreani.trackingUrl(o.andreani_number) : '',
    customerOrders: get('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?', o.customer_id).n,
  };
}
admin.get('/orders/:id', (req, res) => res.json(orderDetail(int(req.params.id))));
admin.post('/orders/:id/status', wrap(async (req, res) => {
  await orders.setStatus(int(req.params.id), req.body?.status, req.admin.email);
  res.json(orderDetail(int(req.params.id)));
}));
admin.post('/orders/:id/note', (req, res) => {
  run('UPDATE orders SET internal_note = ? WHERE id = ?', String(req.body?.note || '').slice(0, 2000), int(req.params.id));
  res.json(orderDetail(int(req.params.id)));
});
admin.post('/orders/:id/shipment', wrap(async (req, res) => {
  await orders.createShipment(int(req.params.id));
  res.json(orderDetail(int(req.params.id)));
}));
admin.post('/orders/:id/tracking', wrap(async (req, res) => {
  await orders.refreshTracking(int(req.params.id));
  res.json(orderDetail(int(req.params.id)));
}));
admin.get('/orders/:id/label', wrap(async (req, res) => {
  const o = get('SELECT * FROM orders WHERE id = ?', int(req.params.id));
  if (!o?.andreani_number) throw new HttpError(400, 'Primero creá el envío en Andreani.');
  const pdf = await andreani.label(o);
  res.set('Content-Type', 'application/pdf').set('Content-Disposition', `inline; filename="etiqueta-${o.number}.pdf"`).send(pdf);
}));
admin.post('/orders/:id/refund', onlyAdmin, wrap(async (req, res) => {
  const o = get('SELECT * FROM orders WHERE id = ?', int(req.params.id));
  if (!o) throw new HttpError(404, 'No encontramos ese pedido.');
  if (!o.payment_id || o.payment_id.startsWith('SIM') || config.mp.mock) {
    await orders.setStatus(o.id, 'refunded', req.admin.email);
  } else {
    const amount = int(req.body?.amount);
    await mp.refundPayment(o.payment_id, amount && amount < o.total ? amount : undefined);
    orders.addEvent(o.id, 'payment', `Devolución pedida en Mercado Pago${amount ? ' por ' + amount : ' total'} (${req.admin.email})`);
    if (!amount || amount >= o.total) await orders.setStatus(o.id, 'refunded', req.admin.email);
  }
  res.json(orderDetail(o.id));
}));
admin.post('/orders/:id/sync-payment', wrap(async (req, res) => {
  const o = get('SELECT * FROM orders WHERE id = ?', int(req.params.id));
  if (!o?.payment_id || config.mp.mock) throw new HttpError(400, 'Este pedido no tiene un pago de Mercado Pago para consultar.');
  await orders.syncPaymentById(o.payment_id);
  res.json(orderDetail(o.id));
}));

// ── Productos ──────────────────────────────────────────────────
admin.get('/products', (req, res) => {
  const { q = '', category = '', visible = '' } = req.query;
  const where = [], p = [];
  if (q) { where.push('(p.name LIKE ? OR p.ref_code LIKE ? OR p.slug LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (category) { where.push('EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)'); p.push(int(category)); }
  if (visible !== '') { where.push('p.visible = ?'); p.push(int(visible)); }
  const rows = all(`SELECT p.id, p.slug, p.name, p.ref_code, p.visible, p.featured, p.collection,
      (SELECT url FROM images WHERE product_id = p.id ORDER BY position LIMIT 1) AS image,
      (SELECT MIN(COALESCE(promo_price, price)) FROM variants WHERE product_id = p.id) AS price,
      (SELECT MAX(price) FROM variants WHERE product_id = p.id) AS list_price,
      (SELECT SUM(stock) FROM variants WHERE product_id = p.id) AS stock,
      (SELECT COUNT(*) FROM variants WHERE product_id = p.id AND stock IS NULL) AS unlimited,
      (SELECT COUNT(*) FROM variants WHERE product_id = p.id) AS variants
    FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.visible DESC, p.position, p.id LIMIT 500`, ...p);
  res.json({ rows, categories: all('SELECT id, name FROM categories ORDER BY position, name') });
});

function productDetail(id) {
  const p = get('SELECT * FROM products WHERE id = ?', id);
  if (!p) throw new HttpError(404, 'No encontramos ese producto.');
  return {
    ...p,
    variants: all('SELECT * FROM variants WHERE product_id = ? ORDER BY position, id', id),
    images: all('SELECT id, url FROM images WHERE product_id = ? ORDER BY position, id', id).map((i) => i.url),
    categories: all('SELECT category_id FROM product_categories WHERE product_id = ?', id).map((r) => r.category_id),
    sold: get(`SELECT COALESCE(SUM(oi.qty),0) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = ? AND o.status NOT IN ('pending_payment','cancelled','refunded')`, id).n,
  };
}
admin.get('/products/:id', (req, res) => res.json(productDetail(int(req.params.id))));

function saveProduct(id, b) {
  const name = String(b.name || '').trim();
  if (!name) throw new HttpError(422, 'El producto necesita un nombre.');
  const variants = Array.isArray(b.variants) ? b.variants : [];
  if (!variants.length) throw new HttpError(422, 'Agregá al menos una variante con precio.');
  for (const v of variants) if (!(int(v.price) > 0)) throw new HttpError(422, 'Cada variante necesita un precio mayor a cero.');
  return tx(() => {
    let slug = slugify(b.slug || name);
    const clash = get('SELECT id FROM products WHERE slug = ? AND id != ?', slug, id || 0);
    if (clash) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
    const f = [name, slug, String(b.ref_code || ''), String(b.description || ''), String(b.collection || ''), b.visible ? 1 : 0, b.featured ? 1 : 0,
      b.free_shipping ? 1 : 0, Number(b.weight_kg) || 0.5, Number(b.height_cm) || 5, Number(b.width_cm) || 30, Number(b.depth_cm) || 30,
      String(b.seo_title || ''), String(b.seo_description || '')];
    if (id) {
      run(`UPDATE products SET name=?, slug=?, ref_code=?, description=?, collection=?, visible=?, featured=?, free_shipping=?, weight_kg=?,
           height_cm=?, width_cm=?, depth_cm=?, seo_title=?, seo_description=?, updated_at=datetime('now') WHERE id=?`, ...f, id);
    } else {
      const pos = get('SELECT COALESCE(MIN(position),0)-1 AS n FROM products').n;
      id = Number(run(`INSERT INTO products(name, slug, ref_code, description, collection, visible, featured, free_shipping, weight_kg,
           height_cm, width_cm, depth_cm, seo_title, seo_description, position) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...f, pos).lastInsertRowid);
    }
    run('DELETE FROM product_categories WHERE product_id = ?', id);
    for (const c of b.categories || []) run('INSERT OR IGNORE INTO product_categories VALUES(?,?)', id, int(c));
    const keep = [];
    variants.forEach((v, i) => {
      const vals = [String(v.color || '').trim(), String(v.size || '').trim().toUpperCase(), String(v.other || '').trim(), int(v.price),
        int(v.promo_price) && int(v.promo_price) < int(v.price) ? int(v.promo_price) : null,
        v.stock === '' || v.stock === null || v.stock === undefined ? null : Math.max(0, int(v.stock, 0)), String(v.sku || ''), String(v.barcode || ''), i];
      if (v.id && get('SELECT id FROM variants WHERE id = ? AND product_id = ?', int(v.id), id)) {
        run('UPDATE variants SET color=?, size=?, other=?, price=?, promo_price=?, stock=?, sku=?, barcode=?, position=? WHERE id=?', ...vals, int(v.id));
        keep.push(int(v.id));
      } else {
        keep.push(Number(run('INSERT INTO variants(color,size,other,price,promo_price,stock,sku,barcode,position,product_id) VALUES(?,?,?,?,?,?,?,?,?,?)', ...vals, id).lastInsertRowid));
      }
    });
    run(`DELETE FROM variants WHERE product_id = ? AND id NOT IN (${keep.map(() => '?').join(',')})`, id, ...keep);
    run('DELETE FROM images WHERE product_id = ?', id);
    (b.images || []).filter(Boolean).forEach((url, i) => run('INSERT INTO images(product_id, url, position) VALUES(?,?,?)', id, String(url), i));
    invalidateCatalog();
    return id;
  });
}
admin.post('/products', (req, res) => res.json(productDetail(saveProduct(null, req.body || {}))));
admin.put('/products/:id', (req, res) => {
  if (!get('SELECT id FROM products WHERE id = ?', int(req.params.id))) throw new HttpError(404, 'No encontramos ese producto.');
  res.json(productDetail(saveProduct(int(req.params.id), req.body || {})));
});
admin.delete('/products/:id', onlyAdmin, (req, res) => {
  run('DELETE FROM products WHERE id = ?', int(req.params.id));
  invalidateCatalog();
  res.json({ ok: true });
});
admin.post('/products/bulk', (req, res) => {
  const ids = (req.body?.ids || []).map((x) => int(x)).filter(Boolean);
  const action = req.body?.action;
  if (!ids.length) throw new HttpError(400, 'Elegí al menos un producto.');
  const ph = ids.map(() => '?').join(',');
  tx(() => {
    if (action === 'show') run(`UPDATE products SET visible = 1 WHERE id IN (${ph})`, ...ids);
    else if (action === 'hide') run(`UPDATE products SET visible = 0 WHERE id IN (${ph})`, ...ids);
    else if (action === 'feature') run(`UPDATE products SET featured = 1 WHERE id IN (${ph})`, ...ids);
    else if (action === 'unfeature') run(`UPDATE products SET featured = 0 WHERE id IN (${ph})`, ...ids);
    else if (action === 'discount') {
      const pct = Math.min(90, Math.max(1, int(req.body?.percent, 0)));
      run(`UPDATE variants SET promo_price = CAST(ROUND(price * (100 - ?) / 100.0, -2) AS INTEGER) WHERE product_id IN (${ph})`, pct, ...ids);
    } else if (action === 'clear-discount') run(`UPDATE variants SET promo_price = NULL WHERE product_id IN (${ph})`, ...ids);
    else if (action === 'category') {
      const cid = int(req.body?.category);
      for (const id of ids) run('INSERT OR IGNORE INTO product_categories VALUES(?,?)', id, cid);
    } else throw new HttpError(400, 'Acción desconocida.');
  });
  invalidateCatalog();
  res.json({ ok: true, count: ids.length });
});

// Edición rápida de stock y precio por variante (planilla de stock).
admin.get('/stock', (req, res) => {
  const q = String(req.query.q || '');
  res.json({ rows: all(`SELECT v.id, v.color, v.size, v.other, v.price, v.promo_price, v.stock, v.sku, p.id AS product_id, p.name, p.visible
    FROM variants v JOIN products p ON p.id = v.product_id ${q ? 'WHERE p.name LIKE ? OR v.sku LIKE ?' : ''}
    ORDER BY p.visible DESC, p.position, p.id, v.position LIMIT 2000`, ...(q ? [`%${q}%`, `%${q}%`] : [])) });
});
admin.patch('/variants/:id', (req, res) => {
  const v = get('SELECT * FROM variants WHERE id = ?', int(req.params.id));
  if (!v) throw new HttpError(404, 'No encontramos esa variante.');
  const b = req.body || {};
  const stock = 'stock' in b ? (b.stock === '' || b.stock === null ? null : Math.max(0, int(b.stock, 0))) : v.stock;
  const price = 'price' in b ? int(b.price, v.price) : v.price;
  const promo = 'promo_price' in b ? (int(b.promo_price) && int(b.promo_price) < price ? int(b.promo_price) : null) : v.promo_price;
  run('UPDATE variants SET stock=?, price=?, promo_price=? WHERE id=?', stock, price, promo, v.id);
  invalidateCatalog();
  res.json(get('SELECT * FROM variants WHERE id = ?', v.id));
});

// ── Categorías ─────────────────────────────────────────────────
admin.get('/categories', (req, res) => res.json(all(`SELECT c.*, (SELECT COUNT(*) FROM product_categories pc JOIN products p ON p.id = pc.product_id
  WHERE pc.category_id = c.id AND p.visible = 1) AS products FROM categories c ORDER BY position, name`)));
admin.post('/categories', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new HttpError(422, 'Escribí el nombre de la categoría.');
  const pos = get('SELECT COALESCE(MAX(position),0)+1 AS n FROM categories').n;
  run('INSERT INTO categories(name, slug, collection, position) VALUES(?,?,?,?)', name, slugify(name), String(req.body?.collection || ''), pos);
  invalidateCatalog();
  res.json({ ok: true });
});
admin.put('/categories/:id', (req, res) => {
  const b = req.body || {};
  run('UPDATE categories SET name=?, slug=?, collection=?, visible=?, position=? WHERE id=?', String(b.name), slugify(b.slug || b.name), String(b.collection || ''), b.visible ? 1 : 0, int(b.position, 0), int(req.params.id));
  invalidateCatalog();
  res.json({ ok: true });
});
admin.delete('/categories/:id', (req, res) => { run('DELETE FROM categories WHERE id = ?', int(req.params.id)); invalidateCatalog(); res.json({ ok: true }); });

// ── Clientes ───────────────────────────────────────────────────
admin.get('/customers', (req, res) => {
  const q = String(req.query.q || '');
  res.json({ rows: all(`SELECT c.*, COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.paid_at IS NOT NULL AND o.status NOT IN ('refunded','cancelled') THEN o.total END),0) AS spent,
      MAX(o.created_at) AS last_order FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
      ${q ? 'WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?' : ''} GROUP BY c.id ORDER BY last_order DESC LIMIT 500`, ...(q ? Array(3).fill(`%${q}%`) : [])) });
});
admin.get('/customers/:id', (req, res) => {
  const c = get('SELECT * FROM customers WHERE id = ?', int(req.params.id));
  if (!c) throw new HttpError(404, 'No encontramos esa clienta.');
  res.json({ ...c, password_hash: undefined, orders: all('SELECT id, number, total, status, created_at FROM orders WHERE customer_id = ? ORDER BY id DESC', c.id), tryons: tryon.tryonPeople({ days: 365, customerId: c.id }).recent });
});
admin.put('/customers/:id', (req, res) => {
  run('UPDATE customers SET notes = ? WHERE id = ?', String(req.body?.notes || ''), int(req.params.id));
  res.json({ ok: true });
});

// ── Cupones ────────────────────────────────────────────────────
admin.get('/coupons', (req, res) => res.json(all('SELECT * FROM coupons ORDER BY id DESC')));
function couponVals(b) {
  const code = String(b.code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HttpError(422, 'El código va de 3 a 30 letras o números, sin espacios.');
  if (!['percent', 'fixed', 'free_shipping'].includes(b.kind)) throw new HttpError(422, 'Elegí el tipo de descuento.');
  return [code, b.kind, int(b.value, 0), int(b.min_subtotal, 0), int(b.max_uses), b.starts_at || null, b.ends_at || null, b.active ? 1 : 0];
}
admin.post('/coupons', (req, res) => {
  try { run('INSERT INTO coupons(code, kind, value, min_subtotal, max_uses, starts_at, ends_at, active) VALUES(?,?,?,?,?,?,?,?)', ...couponVals(req.body || {})); }
  catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Ya existe un cupón con ese código.'); throw e; }
  res.json({ ok: true });
});
admin.put('/coupons/:id', (req, res) => {
  run('UPDATE coupons SET code=?, kind=?, value=?, min_subtotal=?, max_uses=?, starts_at=?, ends_at=?, active=? WHERE id=?', ...couponVals(req.body || {}), int(req.params.id));
  res.json({ ok: true });
});
admin.delete('/coupons/:id', (req, res) => { run('DELETE FROM coupons WHERE id = ?', int(req.params.id)); res.json({ ok: true }); });

// ── Banners ────────────────────────────────────────────────────
admin.get('/banners', (req, res) => res.json(all('SELECT * FROM banners ORDER BY position, id')));
function bannerVals(b) {
  if (!String(b.title || '').trim()) throw new HttpError(422, 'El banner necesita un título.');
  if (!String(b.image_url || '').trim()) throw new HttpError(422, 'El banner necesita una foto.');
  return [b.eyebrow || '', b.title, b.subtitle || '', b.cta_label || '', b.cta_link || '', b.image_url, String(b.video_url || '').trim(), b.tone === 'light' ? 'light' : 'dark', b.active ? 1 : 0];
}
admin.post('/banners', (req, res) => {
  const pos = get('SELECT COALESCE(MAX(position),0)+1 AS n FROM banners').n;
  run('INSERT INTO banners(eyebrow,title,subtitle,cta_label,cta_link,image_url,video_url,tone,active,position) VALUES(?,?,?,?,?,?,?,?,?,?)', ...bannerVals(req.body || {}), pos);
  invalidateCatalog();
  res.json({ ok: true });
});
admin.put('/banners/:id', (req, res) => {
  run('UPDATE banners SET eyebrow=?,title=?,subtitle=?,cta_label=?,cta_link=?,image_url=?,video_url=?,tone=?,active=? WHERE id=?', ...bannerVals(req.body || {}), int(req.params.id));
  invalidateCatalog();
  res.json({ ok: true });
});
admin.post('/banners/order', (req, res) => {
  tx(() => (req.body?.ids || []).forEach((id, i) => run('UPDATE banners SET position = ? WHERE id = ?', i, int(id))));
  invalidateCatalog();
  res.json({ ok: true });
});
admin.delete('/banners/:id', (req, res) => { run('DELETE FROM banners WHERE id = ?', int(req.params.id)); invalidateCatalog(); res.json({ ok: true }); });

// ── Configuración ──────────────────────────────────────────────
admin.get('/settings', onlyAdmin, (req, res) => {
  res.json({
    store: getSetting('store'), shipping: getSetting('shipping'), checkout: getSetting('checkout'), payments: getSetting('payments'),
    integrations: {
      publicUrl: config.publicUrl,
      webhookUrl: `${config.publicUrl}/api/webhooks/mercadopago`,
      mercadopago: config.mp.mock ? 'prueba' : 'conectado',
      webhookSecret: !!config.mp.webhookSecret,
      andreani: config.andreani.mock ? 'prueba' : 'conectado',
      andreaniContratos: { domicilio: !!config.andreani.contratoDomicilio, sucursal: !!config.andreani.contratoSucursal },
      email: config.mail.smtpUrl ? 'conectado' : 'sin configurar',
      sessionSecret: !config.ephemeralSecret,
    },
  });
});
admin.put('/settings', onlyAdmin, (req, res) => {
  const b = req.body || {};
  for (const key of ['store', 'shipping', 'checkout', 'payments']) if (b[key]) setSetting(key, { ...getSetting(key), ...b[key] });
  invalidateCatalog();
  res.json({ ok: true });
});
admin.post('/integrations/andreani/test', onlyAdmin, wrap(async (req, res) => {
  const cp = String(req.body?.cp || '1425');
  const r = await andreani.quote({ cp, kind: 'domicilio', items: [{ qty: 1, unit_price: 50000, weight_kg: 0.5, height_cm: 5, width_cm: 30, depth_cm: 30 }] });
  res.json({ ok: true, ...r });
}));
admin.get('/webhooks', onlyAdmin, (req, res) => res.json(all('SELECT * FROM webhook_log ORDER BY id DESC LIMIT 60')));

// ── Importar y subir fotos ─────────────────────────────────────
admin.post('/import', onlyAdmin, raw({ type: () => true, limit: '20mb' }), (req, res) => {
  if (!req.body?.length) throw new HttpError(400, 'Elegí el archivo CSV que exportaste de Tiendanube.');
  const stats = importTiendanube(req.body, '');
  seedBannersIfEmpty();
  invalidateCatalog();
  res.json(stats);
});
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };
admin.post('/uploads', raw({ type: Object.keys(EXT), limit: '12mb' }), (req, res) => {
  const ext = EXT[req.get('content-type')];
  if (!ext || !req.body?.length) throw new HttpError(400, 'Subí una foto en JPG, PNG o WebP de hasta 12 MB.');
  const dir = path.join(config.dataDir, 'uploads');
  mkdirSync(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
  writeFileSync(path.join(dir, name), req.body);
  res.json({ url: `/uploads/${name}` });
});

// ── Usuarios del panel ─────────────────────────────────────────
admin.get('/users', onlyAdmin, (req, res) => res.json({ users: all('SELECT id, email, name, role, created_at FROM admin_users ORDER BY id'), roles: ROLES }));
admin.post('/users', onlyAdmin, (req, res) => {
  const { email, password, name, role } = req.body || {};
  if (!isEmail(email)) throw new HttpError(422, 'Revisá el email.');
  try { createAdmin(email, password, name || '', role || 'manager'); } catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Ese email ya tiene acceso.'); throw e; }
  res.json({ ok: true });
});
admin.delete('/users/:id', onlyAdmin, (req, res) => {
  if (int(req.params.id) === req.admin.id) throw new HttpError(400, 'No podés quitarte el acceso a vos misma.');
  run('DELETE FROM admin_users WHERE id = ?', int(req.params.id));
  res.json({ ok: true });
});
admin.put('/users/:id', onlyAdmin, (req, res) => {
  const id = int(req.params.id), role = req.body?.role;
  if (!ROLES[role]) throw new HttpError(422, 'Elegí un rol válido.');
  if (id === req.admin.id && role !== 'admin') throw new HttpError(400, 'No podés sacarte el rol de administración a vos misma.');
  run('UPDATE admin_users SET role = ? WHERE id = ?', role, id);
  res.json({ ok: true });
});
admin.post('/me/password', (req, res) => {
  const u = get('SELECT * FROM admin_users WHERE id = ?', req.admin.id);
  if (!checkPassword(req.body?.current, u.password_hash)) throw new HttpError(400, 'La contraseña actual no coincide.');
  if (String(req.body?.next || '').length < 10) throw new HttpError(422, 'La nueva contraseña necesita al menos 10 caracteres.');
  run('UPDATE admin_users SET password_hash = ? WHERE id = ?', hashPassword(req.body.next), u.id);
  res.json({ ok: true });
});

// ── Emails automáticos y carritos ──────────────────────────
import { TEMPLATES, GROUPS, sampleContext, render as renderEmail } from '../lib/email-templates.js';
import { emailSettings, sendTemplate, recentLog, storeCtx } from '../lib/mail.js';
import { listCarts } from '../lib/carts.js';

function emailSample() {
  const items = all(`SELECT p.name, (SELECT url FROM images WHERE product_id = p.id ORDER BY position LIMIT 1) AS image,
      (SELECT COALESCE(promo_price, price) FROM variants WHERE product_id = p.id LIMIT 1) AS unit_price,
      (SELECT TRIM(color || ' · Talle ' || size) FROM variants WHERE product_id = p.id LIMIT 1) AS variant_label
    FROM products p WHERE p.visible = 1 AND p.featured = 1 LIMIT 2`).map((i) => ({ ...i, qty: 1, image: (i.image || '').replace(/-1024-1024\.webp$/, '-320-0.webp') }));
  const store = storeCtx();
  const c = sampleContext(store, items.length ? { items } : {});
  const p = getSetting('payments');
  c.transfer = { holder: p.bankHolder || 'Titular', bank: p.bankName || 'Banco', cbu: p.bankCbu || '—', alias: p.bankAlias || '—', hours: p.transferHours || 48, discount: p.transferDiscount || 10 };
  const sh = getSetting('shipping');
  c.pickup = { address: sh.pickupAddress || 'Nuestro local', hours: sh.pickupHours };
  return c;
}
admin.get('/emails', onlyAdmin, (req, res) => {
  const s = emailSettings();
  res.json({
    templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label, group: t.group, to: t.to, when: t.when, marketing: !!t.marketing, enabled: !!s.enabled[key] })),
    groups: GROUPS, settings: { ...s, enabled: undefined }, smtp: !!config.mail.smtpUrl, staffFallback: config.mail.storeNotify || '', log: recentLog(60),
  });
});
admin.put('/emails', onlyAdmin, (req, res) => {
  const cur = emailSettings();
  const b = req.body || {};
  const num = (k, min, max) => (b[k] === undefined ? cur[k] : Math.min(max, Math.max(min, Number(b[k]) || cur[k])));
  setSetting('emails', {
    enabled: { ...cur.enabled, ...(b.enabled || {}) },
    paymentReminderHours: num('paymentReminderHours', 1, 168), transferReminderHoursBefore: num('transferReminderHoursBefore', 1, 72),
    pickupReminderDays: num('pickupReminderDays', 1, 30), cartReminder1Hours: num('cartReminder1Hours', 1, 72), cartReminder2Hours: num('cartReminder2Hours', 2, 240),
    staffEmails: b.staffEmails === undefined ? cur.staffEmails : String(b.staffEmails).slice(0, 500),
  });
  res.json({ ok: true });
});
admin.get('/emails/preview/:key', onlyAdmin, (req, res) => {
  if (!TEMPLATES[req.params.key]) throw new HttpError(404, 'No existe ese email.');
  res.json(renderEmail(req.params.key, emailSample()));
});
admin.post('/emails/test', onlyAdmin, wrap(async (req, res) => {
  const key = req.body?.key, to = String(req.body?.to || req.admin.email);
  if (!TEMPLATES[key]) throw new HttpError(404, 'No existe ese email.');
  if (!isEmail(to)) throw new HttpError(422, 'Revisá el email de destino.');
  const status = await sendTemplate(key, to, emailSample(), { force: true });
  res.json({ status });
}));
admin.get('/emails/log/:id', onlyAdmin, (req, res) => {
  const r = get('SELECT * FROM email_log WHERE id = ?', int(req.params.id));
  if (!r) throw new HttpError(404, 'No encontramos ese email.');
  res.json(r);
});
admin.get('/carts', (req, res) => {
  const rows = listCarts();
  const by = (s) => rows.filter((c) => c.status === s);
  res.json({
    rows,
    stats: { active: by('active').length, reminded: rows.filter((c) => c.reminders > 0).length, recovered: rows.filter((c) => c.status === 'converted' && c.reminders > 0).length,
      activeValue: by('active').reduce((a, c) => a + c.subtotal, 0) },
  });
});
admin.post('/emails/run', onlyAdmin, wrap(async (req, res) => {
  const { runJobs } = await import('../lib/jobs.js');
  res.json(await runJobs());
}));

// ── Lince / Dragonfish ─────────────────────────────────────────
admin.get('/lince', (req, res) => res.json(lince.status()));
admin.post('/lince/sync', wrap(async (req, res) => res.json(await lince.syncNow(`panel · ${req.admin.email}`))));
admin.post('/lince/orders/:id/loaded', (req, res) => res.json(lince.markLoaded(int(req.params.id), req.admin.email)));
admin.put('/lince', onlyAdmin, (req, res) => {
  const b = req.body || {}, cur = lince.linceSettings();
  setSetting('lince', {
    autoMinutes: b.autoMinutes === undefined ? cur.autoMinutes : Math.min(1440, Math.max(5, int(b.autoMinutes, cur.autoMinutes))),
    updatePrices: b.updatePrices === undefined ? cur.updatePrices : !!b.updatePrices,
  });
  res.json({ ok: true });
});

// ── Estadísticas ───────────────────────────────────────────────
admin.get('/stats', (req, res) => {
  const r = resolveRange(req.query.from, req.query.to);
  // Un día de margen por el huso horario; los pedidos más viejos sólo sirven para saber si la clienta es nueva.
  const since = r.prevFrom.replace(/$/, ' 00:00:00');
  const cats = new Map();
  for (const x of all('SELECT pc.product_id, c.name FROM product_categories pc JOIN categories c ON c.id = pc.category_id')) {
    if (!cats.has(x.product_id)) cats.set(x.product_id, []);
    cats.get(x.product_id).push(x.name);
  }
  const orders = all(`SELECT id, number, status, email, total, subtotal, discount, shipping_cost, coupon_code, payment_method, shipping_method,
      json_extract(shipping_address, '$.provincia') AS provincia, created_at, paid_at FROM orders`).map((o) => ({ ...o, items: [] }));
  const byId = new Map(orders.map((o) => [o.id, o]));
  for (const i of all(`SELECT oi.order_id, oi.product_id, oi.name, oi.image, oi.qty, oi.unit_price FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE COALESCE(o.paid_at, o.created_at) >= datetime(?, '-1 day')`, since)) {
    byId.get(i.order_id)?.items.push({ ...i, image: (i.image || '').replace(/-1024-1024\.webp$/, '-320-0.webp'), categories: cats.get(i.product_id) || [] });
  }
  const carts = all('SELECT created_at, updated_at, status, reminders, subtotal FROM carts');
  res.json(computeStats({ orders, carts, from: r.from, to: r.to }));
});

// ── Contenido: preguntas frecuentes, textos legales, reseñas y arrepentimientos ──
admin.get('/content', onlyAdmin, (req, res) => res.json({ ...content.contentSettings(), google: { connected: !!(config.google.placesKey && config.google.placeId) } }));
admin.put('/content', onlyAdmin, (req, res) => { content.saveContent(req.body || {}); invalidateCatalog(); res.json({ ok: true }); });
admin.get('/withdrawals', (req, res) => res.json(content.listWithdrawals()));
admin.put('/withdrawals/:id', (req, res) => { content.setWithdrawalStatus(int(req.params.id), req.body?.status); res.json({ ok: true }); });

// ── Probador virtual ──
admin.get('/tryon', wrap(async (req, res) => res.json({ settings: tryon.tryonSettings(), hidden: tryon.hiddenCategories(), mock: tryon.tryonMock(), stats: tryon.tryonStats(), garmentsOn: get("SELECT COUNT(*) n FROM tryon_garments WHERE status = 'aprobada'").n, segmentation: await clothSeg.available(),
  categories: all('SELECT id, name FROM categories WHERE visible = 1 ORDER BY position, name') })));
admin.put('/tryon', onlyAdmin, (req, res) => {
  const b = req.body || {}, cur = tryon.tryonSettings();
  setSetting('tryon', {
    enabled: b.enabled === undefined ? cur.enabled : !!b.enabled,
    dailyLimit: b.dailyLimit === undefined ? cur.dailyLimit : Math.min(5000, Math.max(1, int(b.dailyLimit, cur.dailyLimit))),
    perHour: b.perHour === undefined ? cur.perHour : Math.min(100, Math.max(1, int(b.perHour, cur.perHour))),
    mode: ['performance', 'balanced', 'quality'].includes(b.mode) ? b.mode : cur.mode,
    engine: ['samadhi', 'fashn', 'gemini'].includes(b.engine) ? b.engine : cur.engine,
    hiddenCategories: Array.isArray(b.hiddenCategories) ? b.hiddenCategories.map(Number) : cur.hiddenCategories,
    requireLogin: b.requireLogin === undefined ? cur.requireLogin : !!b.requireLogin,
  });
  invalidateCatalog();
  res.json({ ok: true });
});

// Prendas del probador propio.
admin.get('/tryon/people', (req, res) => res.json(tryon.tryonPeople({ days: req.query.days, q: String(req.query.q || '').slice(0, 80), customerId: req.query.customer ? int(req.query.customer) : null })));
admin.get('/tryon/garments', (req, res) => res.json(probador.adminGarments()));
admin.put('/tryon/garments/:id', (req, res) => { probador.setGarment(int(req.params.id), req.body || {}); invalidateCatalog(); res.json({ ok: true }); });
admin.post('/tryon/garments/:id', express_json_big, (req, res) => { const r = probador.saveGarment(int(req.params.id), req.body || {}); invalidateCatalog(); res.json(r); });
// Las fotos de Tiendanube no permiten leer sus píxeles desde otro dominio: el panel las pide a través de la tienda.
admin.get('/img-proxy', wrap(async (req, res) => {
  const u = String(req.query.u || '');
  if (!/^https:\/\/acdn(-us)?\.mitiendanube\.com\//.test(u)) throw new HttpError(400, 'Sólo fotos del catálogo.');
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new HttpError(502, 'No pudimos traer la foto.');
  res.set('Content-Type', r.headers.get('content-type') || 'image/webp');
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(await r.arrayBuffer()));
}));

// Máscara de la prenda con el modelo de recorte de ropa (si está instalado en el servidor).
admin.get('/tryon/mask/:id', wrap(async (req, res) => {
  if (!(await clothSeg.available())) throw new HttpError(501, 'El recorte automático no está instalado en el servidor.');
  const imgs = all('SELECT url FROM images WHERE product_id = ? ORDER BY position', int(req.params.id));
  const im = imgs[int(req.query.image, 0)];
  if (!im) throw new HttpError(404, 'No encontramos esa foto.');
  const kind = ['top', 'bottom', 'full'].includes(req.query.kind) ? req.query.kind : 'top';
  const url = /^https?:/.test(im.url) ? im.url.replace(/-\d+-\d+\.(webp|jpg|png)$/, '-1024-1024.$1') : `${config.publicUrl}${im.url}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new HttpError(502, 'No pudimos traer la foto.');
  const buf = Buffer.from(await r.arrayBuffer());
  const m = await clothSeg.garmentMask(buf, kind);
  res.set('Content-Type', 'image/png').set('Cache-Control', 'private, max-age=600').send(m.png);
}));
