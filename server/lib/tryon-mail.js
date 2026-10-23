// Email "Lo que te probaste": se lo manda el equipo a una clienta desde el panel,
// con las prendas que se probó en el probador virtual y, si quiere, un código de descuento de un solo uso.
import { db, all, get, run, getSetting, setSetting } from './db.js';
import { config } from './config.js';
import { HttpError } from './util.js';
import { TRYON_MAIL_DEFAULTS, render } from './email-templates.js';
import { sendTemplate, storeCtx, unsubscribeLink } from './mail.js';

db.exec(`CREATE TABLE IF NOT EXISTS tryon_followups (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), customer_id INTEGER NOT NULL,
  product_ids TEXT NOT NULL DEFAULT '[]', coupon_code TEXT, status TEXT NOT NULL DEFAULT '', sent_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tryon_followups_customer ON tryon_followups(customer_id);`);

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dayLabel = (key) => { const d = new Date(key + 'T12:00:00Z'); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`; };
const clean = (s, n) => String(s ?? '').slice(0, n);

export const mailTexts = () => ({ ...TRYON_MAIL_DEFAULTS, ...getSetting('tryonMail') });
function textsFrom(t = {}) { const d = mailTexts(); return Object.fromEntries(Object.keys(TRYON_MAIL_DEFAULTS).map((k) => [k, t[k] === undefined ? d[k] : clean(t[k], k === 'subject' || k === 'title' || k === 'button' ? 160 : 1500)])); }

/** Precio actual de cada prenda (el más bajo entre los talles con stock) y su link. */
function productsFor(ids) {
  return ids.map(Number).filter(Boolean).map((id) => {
    const p = get('SELECT id, name, slug, visible FROM products WHERE id = ?', id);
    if (!p) return null;
    const v = get(`SELECT MIN(price) price, MIN(COALESCE(promo_price, price)) now FROM variants WHERE product_id = ? AND (stock IS NULL OR stock > 0)`, id)
      || get('SELECT MIN(price) price, MIN(COALESCE(promo_price, price)) now FROM variants WHERE product_id = ?', id);
    const image = get('SELECT url FROM images WHERE product_id = ? ORDER BY position LIMIT 1', id)?.url || '';
    const inStock = !!get('SELECT 1 FROM variants WHERE product_id = ? AND (stock IS NULL OR stock > 0)', id);
    return { product_id: id, name: p.name, price: v?.price || 0, promo: v && v.now < v.price ? v.now : null, image, url: `/#p/${p.slug}`, visible: !!p.visible, inStock };
  }).filter(Boolean);
}

/** Datos para armar el email: la clienta, las prendas que se probó y los textos guardados. */
export function followupDraft(customerId) {
  const c = get('SELECT id, name, email, phone, marketing_opt_out FROM customers WHERE id = ?', Number(customerId));
  if (!c) throw new HttpError(404, 'No encontramos esa clienta.');
  const tried = all(`SELECT product_id, COUNT(*) times, MAX(at) last, MAX(added) added FROM tryon_log WHERE customer_id = ? AND status IN ('lista','prueba','propio') GROUP BY product_id ORDER BY last DESC LIMIT 30`, c.id);
  const info = productsFor(tried.map((t) => t.product_id));
  return {
    customer: { id: c.id, name: c.name, email: c.email, optOut: !!c.marketing_opt_out },
    products: info.map((p) => ({ ...p, ...tried.find((t) => t.product_id === p.product_id) })),
    texts: mailTexts(), defaults: TRYON_MAIL_DEFAULTS,
    sent: all('SELECT at, coupon_code, status, sent_by FROM tryon_followups WHERE customer_id = ? ORDER BY id DESC LIMIT 10', c.id),
  };
}

function couponDraft(customer, d) {
  if (!d || !d.kind || d.kind === 'none') return null;
  const value = Math.round(Number(d.value) || 0);
  if (d.kind === 'percent' && !(value >= 1 && value <= 90)) throw new HttpError(422, 'El descuento tiene que ser entre 1% y 90%.');
  if (d.kind === 'fixed' && !(value >= 100)) throw new HttpError(422, 'Escribí el monto del descuento.');
  const days = Math.min(90, Math.max(1, Math.round(Number(d.days) || 7)));
  const ends = new Date(Date.now() - 3 * 3600e3 + days * 864e5).toISOString().slice(0, 10);
  const nm = String(customer.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'SAMADHI';
  return { kind: d.kind === 'fixed' ? 'fixed' : 'percent', value, ends_at: ends, ends_label: dayLabel(ends), code: `VOLVE-${nm}-XXXX` };
}

function ctxFor(draft, body, coupon) {
  const chosen = (body.product_ids || []).map(Number);
  const items = draft.products.filter((p) => chosen.includes(p.product_id)).map((p) => ({ ...p, url: coupon ? `/?cupon=${encodeURIComponent(coupon.code)}${p.url.slice(1)}` : p.url }));
  if (!items.length) throw new HttpError(422, 'Elegí al menos una prenda para el email.');
  const first = items[0];
  return {
    name: draft.customer.name, texts: textsFrom(body.texts),
    tryon: { items, coupon },
    links: { tryon: items.length === 1 ? `${config.publicUrl}${first.url}` : `${config.publicUrl}/${coupon ? `?cupon=${encodeURIComponent(coupon.code)}` : ''}` },
  };
}

export function followupPreview(body) {
  const draft = followupDraft(body.customer_id);
  const coupon = couponDraft(draft.customer, body.discount);
  const c = { store: storeCtx(), ...ctxFor(draft, body, coupon) };
  c.links = { shop: c.store.url, unsubscribe: unsubscribeLink(draft.customer.email), ...c.links };
  return render('tryon_followup', c);
}

export async function sendFollowup(body, staff) {
  const draft = followupDraft(body.customer_id);
  if (draft.customer.optOut) throw new HttpError(409, 'Esta clienta se dio de baja de los emails de recordatorio, así que no le podemos mandar este.');
  let coupon = couponDraft(draft.customer, body.discount);
  if (coupon) {
    let code;
    do { code = coupon.code.replace('XXXX', Math.random().toString(36).slice(2, 6).toUpperCase()); } while (get('SELECT 1 FROM coupons WHERE code = ?', code));
    coupon = { ...coupon, code };
    run('INSERT INTO coupons(code, kind, value, min_subtotal, max_uses, uses, starts_at, ends_at, active) VALUES(?,?,?,?,?,?,?,?,1)', code, coupon.kind, coupon.value, 0, 1, 0, null, coupon.ends_at);
  }
  const ctx = ctxFor(draft, body, coupon);
  if (body.save_default) setSetting('tryonMail', ctx.texts);
  const status = await sendTemplate('tryon_followup', draft.customer.email, ctx, { force: true });
  run('INSERT INTO tryon_followups(customer_id, product_ids, coupon_code, status, sent_by) VALUES(?,?,?,?,?)', draft.customer.id, JSON.stringify(ctx.tryon.items.map((i) => i.product_id)), coupon?.code || null, status, staff?.name || staff?.email || '');
  return { status, coupon: coupon ? { code: coupon.code, ends_at: coupon.ends_at } : null };
}

/** Último email enviado a cada clienta (para la lista del panel). */
export const lastFollowups = () => Object.fromEntries(all('SELECT customer_id, MAX(at) at FROM tryon_followups GROUP BY customer_id').map((r) => [r.customer_id, r.at]));
