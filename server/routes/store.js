import { Router } from 'express';
import { get } from '../lib/db.js';
import { config } from '../lib/config.js';
import { publicCatalog } from '../lib/catalog.js';
import { HttpError, digits } from '../lib/util.js';
import * as orders from '../lib/orders.js';
import * as andreani from '../integrations/andreani.js';
import { customerFrom, loginLimiter } from '../lib/auth.js';
import { saveCart, cartByToken } from '../lib/carts.js';
import { unsubscribeToken } from '../lib/mail.js';
import { run } from '../lib/db.js';
import { escapeHtml } from '../lib/util.js';
import * as content from '../lib/content.js';
import * as tryon from '../integrations/fashn.js';
import { notifyOrder, notifyStaff, orderCtx } from '../lib/mail.js';

export const store = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

store.get('/catalog', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(publicCatalog());
});

store.post('/shipping/quote', wrap(async (req, res) => {
  const cp = digits(req.body?.cp).slice(0, 4);
  if (cp.length !== 4) throw new HttpError(400, 'El código postal tiene 4 números.');
  const { items, subtotal } = orders.priceCart(req.body?.items);
  let coupon = null;
  try { coupon = req.body?.coupon ? orders.findCoupon(req.body.coupon, subtotal) : null; } catch { coupon = null; }
  res.json(await orders.shippingOptions({ cp, items, subtotal, coupon }));
}));

store.get('/shipping/branches', wrap(async (req, res) => {
  const cp = digits(req.query.cp).slice(0, 4);
  if (cp.length !== 4) throw new HttpError(400, 'El código postal tiene 4 números.');
  res.json({ branches: await andreani.branches(cp) });
}));

store.post('/coupons/check', (req, res) => {
  const { subtotal } = orders.priceCart(req.body?.items);
  const c = orders.findCoupon(req.body?.code, subtotal);
  res.json({ code: c.code, kind: c.kind, value: c.value, discount: orders.discountFor(c, subtotal) });
});

store.post('/checkout', wrap(async (req, res) => {
  const c = customerFrom(req);
  res.json(await orders.createOrder(req.body || {}, c?.id));
}));

// Estado del pedido para la página de seguimiento (con el token privado del link).
store.get('/orders/:token', wrap(async (req, res) => {
  let o = get('SELECT * FROM orders WHERE token = ?', req.params.token);
  if (!o) throw new HttpError(404, 'No encontramos ese pedido.');
  // Al volver de Mercado Pago llega payment_id: lo confirmamos directo con MP por si el aviso todavía no llegó.
  const pid = req.query.payment_id || req.query.collection_id;
  if (pid && /^\d+$/.test(String(pid)) && !config.mp.mock && o.status === 'pending_payment') {
    try {
      await orders.syncPaymentById(String(pid));
      o = get('SELECT * FROM orders WHERE id = ?', o.id);
    } catch (err) { console.error('[mp] sync al volver:', err.message); }
  }
  res.json(orders.publicOrder(o));
}));

store.post('/orders/:token/pay', wrap(async (req, res) => {
  const o = get('SELECT * FROM orders WHERE token = ?', req.params.token);
  if (!o) throw new HttpError(404, 'No encontramos ese pedido.');
  res.json({ payUrl: await orders.newPaymentLink(o) });
}));

// Pago simulado: solo existe mientras no haya credenciales de Mercado Pago.
store.post('/dev/mock-payment', wrap(async (req, res) => {
  if (!config.mp.mock) throw new HttpError(404, 'No disponible.');
  const o = get('SELECT * FROM orders WHERE token = ?', String(req.body?.token || ''));
  if (!o) throw new HttpError(404, 'No encontramos ese pedido.');
  const status = req.body?.approve ? 'approved' : 'rejected';
  const r = await orders.applyPayment({
    id: `SIM${Date.now()}`, status, external_reference: o.number, transaction_amount: o.total, payment_method_id: 'simulado',
  });
  res.json(r);
}));

// Bolsa guardada para el recordatorio "Tenés un carrito esperándote".
const cartHits = new Map();
store.post('/cart', (req, res) => {
  const now = Date.now();
  const hits = (cartHits.get(req.ip) || []).filter((t) => now - t < 60e3);
  if (hits.length > 30) return res.status(429).json({ error: 'Demasiados pedidos. Probá en un minuto.' });
  hits.push(now); cartHits.set(req.ip, hits);
  const c = customerFrom(req);
  const token = saveCart({ email: c?.email || req.body?.email, name: c?.name || req.body?.name || '', customerId: c?.id || null, items: req.body?.items });
  res.json({ saved: !!token });
});
store.get('/cart/:token', (req, res) => {
  const c = cartByToken(req.params.token);
  if (!c) throw new HttpError(404, 'No encontramos esa bolsa.');
  res.json(c);
});

// Baja de los recordatorios de carrito (los emails de pedidos siguen llegando).
store.get('/email/baja', (req, res) => {
  const email = String(req.query.e || '').toLowerCase();
  const ok = email && req.query.t === unsubscribeToken(email);
  if (ok) run('UPDATE customers SET marketing_opt_out = 1 WHERE email = ?', email);
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Samadhi Style</title>
<body style="margin:0;background:#f4efe6;font-family:Georgia,serif;color:#191816;display:grid;place-items:center;min-height:100vh;text-align:center;padding:20px">
<div><div style="font-size:30px;letter-spacing:2px">SAMADHI</div><div style="font-family:Arial;font-size:10px;letter-spacing:8px">STYLE</div>
<p style="font-style:italic;font-size:22px;margin-top:30px">${ok ? 'Listo, no te mandamos más recordatorios.' : 'No pudimos procesar la baja.'}</p>
<p style="font-family:Arial;font-size:14px;color:#6d675d">${ok ? `Los emails sobre tus pedidos van a seguir llegando a ${escapeHtml(email)}.` : 'Probá de nuevo desde el link del email.'}</p>
<a href="/" style="font-family:Arial;font-size:12px;letter-spacing:2px;color:#191816">VOLVER A LA TIENDA</a></div></body>`);
});

// ── Seguir mi pedido ──
store.post('/track', loginLimiter, wrap(async (req, res) => {
  let o = content.findOrder(req.body?.number, req.body?.email);
  // Si ya salió con Andreani, actualizamos el recorrido (como mucho cada 20 minutos).
  if (o.andreani_number && o.status === 'shipped') {
    const last = get("SELECT at FROM order_events WHERE order_id = ? AND kind = 'tracking' ORDER BY id DESC LIMIT 1", o.id);
    if (!last || Date.now() - Date.parse(last.at.replace(' ', 'T') + 'Z') > 20 * 60e3) {
      try { await orders.refreshTracking(o.id); run("INSERT INTO order_events(order_id, kind, message) VALUES(?, 'tracking', 'Seguimiento consultado')", o.id); } catch (e) { console.error('[track]', e.message); }
      o = get('SELECT * FROM orders WHERE id = ?', o.id);
    }
  }
  res.json(content.trackInfo(o, orders.publicOrder));
}));

// ── Botón de arrepentimiento ──
store.post('/arrepentimiento', loginLimiter, wrap(async (req, res) => {
  const r = content.createWithdrawal(req.body || {});
  if (!r.existing) {
    const w = { code: r.code, orderNumber: r.order.number, email: r.order.email, reason: String(req.body?.reason || '').slice(0, 1000) };
    await notifyOrder('withdrawal_received', r.order, { withdrawal: w });
    await notifyStaff('staff_withdrawal', { ...orderCtx(r.order), withdrawal: w }, r.order.id);
  }
  res.json({ code: r.code, number: r.order.number, existing: r.existing });
}));

// ── Reseñas de Google ──
store.get('/reviews', wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  res.json(await content.googleReviews());
}));

// ── Probador virtual ──
store.post('/tryon', wrap(async (req, res) => res.json(await tryon.startTryon(req.body || {}, req.ip))));
store.get('/tryon/:id', wrap(async (req, res) => { res.set('Cache-Control', 'no-store'); res.json(await tryon.pollTryon(req.params.id)); }));
store.post('/tryon/log', (req, res) => res.json(tryon.logOwnTry(req.body?.productId, req.ip)));
store.post('/tryon/added', (req, res) => { tryon.markAdded(req.body?.log); res.json({ ok: true }); });
