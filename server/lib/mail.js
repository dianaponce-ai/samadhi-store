// Envío de los emails automáticos. Las plantillas viven en email-templates.js.
// Cada envío queda en email_log (también cuando falta SMTP, para poder revisarlo desde el panel).
import crypto from 'node:crypto';
import { config } from './config.js';
import { db, all, get, run, getSetting } from './db.js';
import { TEMPLATES, render } from './email-templates.js';

db.exec(`
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  template TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  order_id INTEGER,
  html TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS email_log_at ON email_log(at);
`);

export const EMAIL_DEFAULTS = {
  enabled: Object.fromEntries(Object.keys(TEMPLATES).map((k) => [k, true])),
  paymentReminderHours: 24,
  transferReminderHoursBefore: 12,
  pickupReminderDays: 3,
  cartReminder1Hours: 1,
  cartReminder2Hours: 48,
  staffEmails: '',
};
export function emailSettings() {
  const s = getSetting('emails');
  return { ...EMAIL_DEFAULTS, ...s, enabled: { ...EMAIL_DEFAULTS.enabled, ...(s.enabled || {}) } };
}

let transport = null;
async function getTransport() {
  if (!config.mail.smtpUrl) return null;
  if (!transport) {
    const nodemailer = (await import('nodemailer')).default;
    transport = nodemailer.createTransport(config.mail.smtpUrl);
  }
  return transport;
}

export function storeCtx() {
  const s = getSetting('store');
  return { name: s.name, url: config.publicUrl, whatsapp: s.whatsapp, instagram: s.instagram };
}

/** Firma para el link de baja de recordatorios (no hace falta guardar nada). */
export const unsubscribeToken = (email) => crypto.createHmac('sha256', config.sessionSecret).update('baja:' + String(email).toLowerCase()).digest('base64url').slice(0, 24);
export const unsubscribeLink = (email) => `${config.publicUrl}/api/email/baja?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;

/** Envía una plantilla. Devuelve el estado que quedó en el historial. */
export async function sendTemplate(key, to, ctx, { orderId = null, force = false } = {}) {
  const tpl = TEMPLATES[key];
  if (!tpl || !to) return 'omitido';
  const settings = emailSettings();
  if (!force && !settings.enabled[key]) return 'desactivado';
  if (tpl.marketing && !force) {
    const optOut = get('SELECT marketing_opt_out FROM customers WHERE email = ?', String(to).toLowerCase());
    if (optOut?.marketing_opt_out) return 'dado de baja';
  }
  const c = { store: storeCtx(), links: {}, ...ctx };
  c.links = { shop: c.store.url, panel: `${c.store.url}/admin/`, unsubscribe: unsubscribeLink(to), ...ctx.links };
  const { subject, html } = render(key, c);
  let status = 'enviado';
  const t = await getTransport();
  if (!t) status = 'sin enviar (falta SMTP)';
  else {
    try { await t.sendMail({ from: config.mail.from, to, subject, html }); }
    catch (err) { status = 'error: ' + err.message.slice(0, 120); console.error('[mail]', err.message); }
  }
  run('INSERT INTO email_log(template, to_email, subject, status, order_id, html) VALUES(?,?,?,?,?,?)', key, to, subject, status, orderId, html);
  if (status !== 'enviado') console.log(`[mail] ${key} → ${to}: ${status}`);
  return status;
}

export function staffRecipients() {
  const s = emailSettings();
  return [...new Set([...(s.staffEmails || '').split(/[,;\s]+/), config.mail.storeNotify].filter((x) => x && x.includes('@')))];
}

const METHOD = { andreani_domicilio: 'Andreani a domicilio', andreani_sucursal: 'Andreani a sucursal', retiro: 'Retiro en el local' };
export function orderCtx(order) {
  const items = all('SELECT name, variant_label, image, unit_price, qty FROM order_items WHERE order_id = ?', order.id)
    .map((i) => ({ ...i, image: (i.image || '').replace(/-1024-1024\.webp$/, '-320-0.webp') }));
  return {
    name: order.name,
    order: {
      number: order.number, subtotal: order.subtotal, discount: order.discount, shippingCost: order.shipping_cost, total: order.total,
      shippingMethod: order.shipping_method, shippingLabel: METHOD[order.shipping_method], items, customerName: order.name, email: order.email, phone: order.phone,
      paymentMethod: order.payment_method === 'transferencia' ? 'transferencia' : 'mercadopago',
    },
    links: { order: `${config.publicUrl}/pedido.html?t=${order.token}`, panel: `${config.publicUrl}/admin/#pedido/${order.id}` },
  };
}

/** Email a la clienta sobre su pedido. */
export function notifyOrder(key, order, extra = {}) {
  const ctx = orderCtx(order);
  return sendTemplate(key, order.email, { ...ctx, ...extra, links: { ...ctx.links, ...(extra.links || {}) } }, { orderId: order.id }).catch((e) => console.error('[mail]', e.message));
}
/** Aviso al equipo. */
export async function notifyStaff(key, ctx, orderId = null) {
  for (const to of staffRecipients()) await sendTemplate(key, to, ctx, { orderId }).catch(() => {});
}

export function recentLog(limit = 80) {
  return all('SELECT id, at, template, to_email, subject, status, order_id FROM email_log ORDER BY id DESC LIMIT ?', limit);
}
