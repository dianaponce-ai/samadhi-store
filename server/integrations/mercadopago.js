// Mercado Pago · Checkout Pro
// Docs: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro
import crypto from 'node:crypto';
import { config } from '../lib/config.js';

const API = 'https://api.mercadopago.com';

async function mp(method, path, body, idempotencyKey) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${config.mp.accessToken}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(`Mercado Pago respondió con un error: ${msg}`);
  }
  return data;
}

/**
 * Crea la preferencia de pago y devuelve el link para pagar.
 * En modo prueba (sin MP_ACCESS_TOKEN) devuelve un link a la página de pago simulado.
 */
export async function createPreference(order, items, payments = {}) {
  const back = `${config.publicUrl}/pedido.html?t=${encodeURIComponent(order.token)}`;
  if (config.mp.mock) {
    return { id: `mock-${order.number}`, init_point: `${config.publicUrl}/pago-simulado.html?t=${encodeURIComponent(order.token)}`, mock: true };
  }
  // Mercado Pago no acepta ítems con precio negativo: si hay descuento, se envía el pedido como un solo ítem.
  const mpItems = order.discount > 0
    ? [{
        id: order.number,
        title: `Pedido ${order.number} · Samadhi Style`,
        description: items.map((i) => `${i.qty}× ${i.name}`).join(', ').slice(0, 250),
        quantity: 1,
        unit_price: order.subtotal - order.discount,
        currency_id: 'ARS',
      }]
    : items.map((i) => ({
        id: String(i.variant_id ?? i.sku ?? i.name),
        title: `${i.name}${i.variant_label ? ' · ' + i.variant_label : ''}`.slice(0, 250),
        picture_url: i.image || undefined,
        quantity: i.qty,
        unit_price: i.unit_price,
        currency_id: 'ARS',
      }));

  const [first, ...rest] = order.name.trim().split(/\s+/);
  const body = {
    items: mpItems,
    payer: { email: order.email, name: first, surname: rest.join(' ') || undefined },
    external_reference: order.number,
    back_urls: { success: back, failure: back, pending: back },
    auto_return: 'approved',
    notification_url: `${config.publicUrl}/api/webhooks/mercadopago`,
    statement_descriptor: 'SAMADHI STYLE',
    shipments: order.shipping_cost > 0 ? { cost: order.shipping_cost, mode: 'not_specified' } : undefined,
    metadata: { order_number: order.number },
    // Tope de cuotas. Que sean sin interés se configura en tu cuenta de Mercado Pago (Promociones / Cuotas sin interés).
    payment_methods: payments.installments ? { installments: Number(payments.installments) } : undefined,
    expires: true,
    expiration_date_to: new Date(Date.now() + 48 * 3600e3).toISOString(),
  };
  const pref = await mp('POST', '/checkout/preferences', body, `pref-${order.number}`);
  return { id: pref.id, init_point: pref.init_point };
}

export async function getPayment(id) {
  return mp('GET', `/v1/payments/${encodeURIComponent(id)}`);
}

export async function refundPayment(id, amount) {
  return mp('POST', `/v1/payments/${encodeURIComponent(id)}/refunds`, amount ? { amount } : {}, `refund-${id}-${amount || 'total'}-${Date.now()}`);
}

/**
 * Valida la firma x-signature de una notificación.
 * Manifest: "id:{data.id};request-id:{x-request-id};ts:{ts};" (se omiten los pares que faltan),
 * HMAC-SHA256 con la clave secreta del webhook. El data.id alfanumérico va en minúsculas.
 */
export function verifySignature({ signature, requestId, dataId, secret = config.mp.webhookSecret, toleranceSec = 600 }) {
  if (!secret) return { ok: true, skipped: true };
  if (!signature) return { ok: false, reason: 'falta x-signature' };
  const parts = Object.fromEntries(String(signature).split(',').map((p) => p.split('=').map((s) => s.trim())).filter((p) => p.length === 2).map(([k, v]) => [k.toLowerCase(), v]));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !/^\d+$/.test(ts) || !v1) return { ok: false, reason: 'x-signature mal formado' };
  const segs = [];
  if (dataId) segs.push(`id:${/^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId}`);
  if (requestId) segs.push(`request-id:${requestId}`);
  segs.push(`ts:${ts}`);
  const manifest = segs.join(';') + ';';
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'firma inválida' };
  const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000;
  if (toleranceSec && Math.abs(Date.now() - tsMs) > toleranceSec * 1000) return { ok: false, reason: 'notificación vencida' };
  return { ok: true };
}

export const PAYMENT_STATUS_ES = {
  approved: 'Aprobado',
  authorized: 'Autorizado',
  in_process: 'En revisión',
  in_mediation: 'En mediación',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  refunded: 'Devuelto',
  charged_back: 'Contracargo',
};
