// Contenido editable (preguntas frecuentes, textos legales), Botón de arrepentimiento,
// seguimiento de pedidos y reseñas de Google.
import crypto from 'node:crypto';
import { config } from './config.js';
import { db, all, get, run, getSetting, setSetting } from './db.js';
import { HttpError, isEmail } from './util.js';
import { CONTENT_DEFAULTS } from './content-defaults.js';
import { buildTimeline } from './track-core.js';

db.exec(`
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  order_id INTEGER,
  order_number TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'nuevo',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews_cache (id INTEGER PRIMARY KEY CHECK (id = 1), at INTEGER NOT NULL, data TEXT NOT NULL);
`);

export function contentSettings() {
  const s = getSetting('content');
  return { ...CONTENT_DEFAULTS, ...s, faq: Array.isArray(s.faq) ? s.faq : CONTENT_DEFAULTS.faq };
}
export function saveContent(b) {
  const cur = contentSettings();
  const txt = (v, d, max) => (v === undefined ? d : String(v).slice(0, max));
  setSetting('content', {
    faq: Array.isArray(b.faq) ? b.faq.map((x) => ({ q: String(x.q || '').trim().slice(0, 200), a: String(x.a || '').trim().slice(0, 2000) })).filter((x) => x.q && x.a).slice(0, 40) : cur.faq,
    terms: txt(b.terms, cur.terms, 40000), returns: txt(b.returns, cur.returns, 40000),
    reviewsEnabled: b.reviewsEnabled === undefined ? cur.reviewsEnabled : !!b.reviewsEnabled,
    reviewsMinRating: b.reviewsMinRating === undefined ? cur.reviewsMinRating : Math.min(5, Math.max(0, Number(b.reviewsMinRating) || 0)),
  });
}
export const publicContent = () => { const c = contentSettings(); return { faq: c.faq, terms: c.terms, returns: c.returns, reviews: c.reviewsEnabled }; };

// ── Seguir mi pedido ──
const cleanNumber = (n) => String(n || '').toUpperCase().replace(/\s+/g, '').replace(/^#/, '');
export function findOrder(number, email) {
  const n = cleanNumber(number);
  email = String(email || '').toLowerCase().trim();
  if (!n || !isEmail(email)) throw new HttpError(422, 'Escribí el número de pedido y el email con el que compraste.');
  const prefix = getSetting('checkout').orderPrefix || 'S';
  const o = get('SELECT * FROM orders WHERE (number = ? OR number = ?) AND lower(email) = ?', n, `${prefix}-${n.replace(/^[A-Z]+-?/, '')}`, email);
  if (!o) throw new HttpError(404, 'No encontramos un pedido con ese número y ese email. Revisá el email de confirmación.');
  return o;
}
export function trackInfo(o, publicOrder) {
  const events = all('SELECT kind, message, at FROM order_events WHERE order_id = ? ORDER BY id', o.id);
  return { ...publicOrder(o), ...buildTimeline(o, events), trackingEvents: JSON.parse(o.tracking_events || '[]'), branch: o.shipping_branch, address: JSON.parse(o.shipping_address || '{}') };
}

// ── Botón de arrepentimiento (Res. 424/2020) ──
export function createWithdrawal({ number, email, reason }) {
  const o = findOrder(number, email);
  const ex = get("SELECT code FROM withdrawals WHERE order_id = ? AND status != 'rechazado'", o.id);
  if (ex) return { code: ex.code, order: o, existing: true };
  const code = 'ARR-' + crypto.randomBytes(4).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 6);
  run('INSERT INTO withdrawals(code, order_id, order_number, name, email, reason) VALUES(?,?,?,?,?,?)', code, o.id, o.number, o.name, o.email, String(reason || '').slice(0, 1000));
  run('INSERT INTO order_events(order_id, kind, message) VALUES(?,?,?)', o.id, 'alert', `Botón de arrepentimiento · código ${code}${reason ? ' · ' + String(reason).slice(0, 200) : ''}`);
  return { code, order: o, existing: false };
}
export const listWithdrawals = () => all('SELECT * FROM withdrawals ORDER BY id DESC LIMIT 200');
export function setWithdrawalStatus(id, status) {
  if (!['nuevo', 'en curso', 'resuelto', 'rechazado'].includes(status)) throw new HttpError(422, 'Estado inválido.');
  run('UPDATE withdrawals SET status = ? WHERE id = ?', status, id);
}

// ── Reseñas de Google (Places API) ──
// Se piden con la clave de Google y el Place ID de la ficha; se guardan 12 horas.
export async function googleReviews() {
  const c = contentSettings();
  const { placesKey, placeId } = config.google;
  const writeUrl = placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : '';
  if (!c.reviewsEnabled) return { enabled: false };
  if (!placesKey || !placeId) return { enabled: true, connected: false, writeUrl };
  const cached = get('SELECT at, data FROM reviews_cache WHERE id = 1');
  let data = cached && Date.now() - cached.at < 12 * 3600e3 ? JSON.parse(cached.data) : null;
  if (!data) {
    try {
      const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es`, {
        headers: { 'X-Goog-Api-Key': placesKey, 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri,reviews' }, signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`Google respondió ${r.status}`);
      data = await r.json();
      run('INSERT INTO reviews_cache(id, at, data) VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at, data = excluded.data', Date.now(), JSON.stringify(data));
    } catch (e) {
      console.error('[google]', e.message);
      if (!cached) return { enabled: true, connected: false, writeUrl, error: true };
      data = JSON.parse(cached.data);
    }
  }
  const reviews = (data.reviews || []).filter((x) => (x.rating || 0) >= c.reviewsMinRating).map((x) => ({
    author: x.authorAttribution?.displayName || 'Cliente de Google', photo: x.authorAttribution?.photoUri || '', authorUrl: x.authorAttribution?.uri || '',
    rating: x.rating || 0, text: x.text?.text || x.originalText?.text || '', when: x.relativePublishTimeDescription || '', url: x.googleMapsUri || '',
  }));
  return { enabled: true, connected: true, rating: data.rating || 0, count: data.userRatingCount || 0, mapsUrl: data.googleMapsUri || '', writeUrl, reviews };
}
