import { all, get, run, tx, getSetting, setSetting } from './db.js';
import { HttpError, randomToken, isEmail, digits, fmtARS } from './util.js';
import { invalidateCatalog } from './catalog.js';
import * as andreani from '../integrations/andreani.js';
import * as mp from '../integrations/mercadopago.js';
import { notifyOrder, notifyStaff, orderCtx } from './mail.js';
import { markCartsConverted } from './carts.js';

export const ORDER_STATUS = {
  pending_payment: 'Esperando pago',
  paid: 'Pagado',
  preparing: 'En preparación',
  ready_pickup: 'Listo para retirar',
  shipped: 'Despachado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Devuelto',
};
export const SHIPPING_METHOD = {
  andreani_domicilio: 'Andreani a domicilio',
  andreani_sucursal: 'Andreani a sucursal',
  retiro: 'Retiro en el local',
};

export function addEvent(orderId, kind, message) {
  run('INSERT INTO order_events(order_id, kind, message) VALUES(?,?,?)', orderId, kind, message);
}

const variantLabel = (v) => [v.color, v.size && `Talle ${v.size}`, v.other].filter(Boolean).join(' · ');

/** Toma lo que manda el carrito y lo valida contra la base: precios y stock salen del servidor. */
export function priceCart(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new HttpError(400, 'Tu bolsa está vacía.');
  const merged = new Map();
  for (const it of rawItems) {
    const id = Number(it.variant_id), qty = Math.floor(Number(it.qty));
    if (!id || !(qty > 0)) continue;
    merged.set(id, (merged.get(id) || 0) + Math.min(qty, 20));
  }
  const items = [];
  const problems = [];
  for (const [variantId, qty] of merged) {
    const v = get(`SELECT v.*, p.name, p.slug, p.visible, p.free_shipping, p.weight_kg, p.height_cm, p.width_cm, p.depth_cm,
                   (SELECT url FROM images WHERE product_id = p.id ORDER BY position LIMIT 1) AS image
                   FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`, variantId);
    if (!v || !v.visible) { problems.push('Una de las prendas ya no está disponible.'); continue; }
    if (v.stock !== null && v.stock < qty) {
      problems.push(v.stock === 0 ? `${v.name} (${variantLabel(v)}) se agotó.` : `De ${v.name} (${variantLabel(v)}) quedan ${v.stock}.`);
      continue;
    }
    items.push({
      product_id: v.product_id, variant_id: v.id, name: v.name, variant_label: variantLabel(v), sku: v.sku,
      image: v.image || '', unit_price: v.promo_price ?? v.price, list_price: v.price, qty,
      free_shipping: !!v.free_shipping, weight_kg: v.weight_kg, height_cm: v.height_cm, width_cm: v.width_cm, depth_cm: v.depth_cm,
    });
  }
  if (problems.length) throw new HttpError(409, problems.join(' '), { problems });
  const subtotal = items.reduce((a, i) => a + i.unit_price * i.qty, 0);
  return { items, subtotal };
}

export function findCoupon(code, subtotal) {
  if (!code) return null;
  const c = get('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE AND active = 1', String(code).trim());
  const now = new Date().toISOString().slice(0, 10);
  if (!c) throw new HttpError(404, 'Ese cupón no existe o ya no está activo.');
  if (c.starts_at && now < c.starts_at) throw new HttpError(400, 'Ese cupón todavía no está vigente.');
  if (c.ends_at && now > c.ends_at) throw new HttpError(400, 'Ese cupón ya venció.');
  if (c.max_uses !== null && c.uses >= c.max_uses) throw new HttpError(400, 'Ese cupón ya alcanzó su límite de usos.');
  if (subtotal < c.min_subtotal) throw new HttpError(400, `Ese cupón es para compras desde ${fmtARS(c.min_subtotal)}.`);
  return c;
}

export function discountFor(coupon, subtotal) {
  if (!coupon) return 0;
  if (coupon.kind === 'percent') return Math.round((subtotal * Math.min(100, coupon.value)) / 100);
  if (coupon.kind === 'fixed') return Math.min(subtotal, coupon.value);
  return 0;
}

/** Calcula las opciones de envío disponibles para un código postal. */
export async function shippingOptions({ cp, items, subtotal, coupon }) {
  const s = getSetting('shipping');
  const free = (s.freeShippingFrom > 0 && subtotal >= s.freeShippingFrom) || (items.length && items.every((i) => i.free_shipping)) || coupon?.kind === 'free_shipping';
  const opts = [];
  if (cp && /^\d{4}$/.test(cp)) {
    for (const kind of ['domicilio', 'sucursal']) {
      if (kind === 'domicilio' && !s.andreaniDomicilio) continue;
      if (kind === 'sucursal' && !s.andreaniSucursal) continue;
      try {
        const q = await andreani.quote({ cp, kind, items });
        opts.push({ method: `andreani_${kind}`, label: SHIPPING_METHOD[`andreani_${kind}`], cost: free ? 0 : q.cost + (s.extraHandling || 0), days: q.days, mock: q.mock });
      } catch (err) {
        opts.push({ method: `andreani_${kind}`, label: SHIPPING_METHOD[`andreani_${kind}`], error: err.message });
      }
    }
  }
  if (s.pickupEnabled) opts.push({ method: 'retiro', label: SHIPPING_METHOD.retiro, cost: 0, detail: [s.pickupAddress, s.pickupHours].filter(Boolean).join(' · ') });
  return { options: opts, free };
}

function nextOrderNumber() {
  const c = getSetting('checkout');
  const n = c.nextOrderNumber || 1001;
  setSetting('checkout', { ...c, nextOrderNumber: n + 1 });
  return `${c.orderPrefix || 'S'}-${n}`;
}

/** Crea el pedido (esperando pago) y la preferencia de Mercado Pago. */
export async function createOrder(body, loggedCustomerId = null) {
  const c = body.customer || {};
  const name = String(c.name || '').trim(), email = String(c.email || '').trim().toLowerCase();
  const phone = digits(c.phone), dni = digits(c.dni);
  const errors = {};
  if (name.length < 3) errors.name = 'Escribí tu nombre y apellido.';
  if (!isEmail(email)) errors.email = 'Revisá el email.';
  if (phone.length < 8) errors.phone = 'Dejanos un teléfono con código de área.';
  if (getSetting('checkout').requireDni && (dni.length < 7 || dni.length > 11)) errors.dni = 'Andreani pide el DNI de quien recibe.';

  const ship = body.shipping || {};
  const method = ship.method;
  if (!SHIPPING_METHOD[method]) errors.method = 'Elegí cómo querés recibir tu pedido.';
  const addr = {
    cp: digits(ship.cp).slice(0, 4), calle: String(ship.calle || '').trim(), numero: String(ship.numero || '').trim(),
    piso: String(ship.piso || '').trim(), depto: String(ship.depto || '').trim(), localidad: String(ship.localidad || '').trim(),
    provincia: String(ship.provincia || '').trim(), referencia: String(ship.referencia || '').trim(),
  };
  if (method === 'andreani_domicilio') {
    if (addr.cp.length !== 4) errors.cp = 'El código postal tiene 4 números.';
    if (!addr.calle) errors.calle = 'Falta la calle.';
    if (!addr.numero) errors.numero = 'Falta la altura.';
    if (!addr.localidad) errors.localidad = 'Falta la localidad.';
  }
  if (method === 'andreani_sucursal') {
    if (addr.cp.length !== 4) errors.cp = 'El código postal tiene 4 números.';
    if (!ship.branch) errors.branch = 'Elegí la sucursal donde retirás.';
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Revisá los datos marcados.', { errors });

  const { items, subtotal } = priceCart(body.items);
  const coupon = body.coupon ? findCoupon(body.coupon, subtotal) : null;
  const couponDiscount = discountFor(coupon, subtotal);
  const pay = getSetting('payments');
  const payWith = body.payment === 'transferencia' && pay.transferEnabled ? 'transferencia' : 'mercadopago';
  const transferDiscount = payWith === 'transferencia' ? Math.round(((subtotal - couponDiscount) * (pay.transferDiscount || 0)) / 100) : 0;
  const discount = couponDiscount + transferDiscount;

  let shippingCost = 0;
  if (method !== 'retiro') {
    const { options } = await shippingOptions({ cp: addr.cp, items, subtotal, coupon });
    const opt = options.find((o) => o.method === method);
    if (!opt || opt.error) throw new HttpError(502, opt?.error || 'No pudimos cotizar el envío. Probá de nuevo en un momento.');
    shippingCost = opt.cost;
  } else if (!getSetting('shipping').pickupEnabled) {
    throw new HttpError(400, 'El retiro en el local no está disponible.');
  }

  const total = subtotal - discount + shippingCost;
  const order = tx(() => {
    let customer = loggedCustomerId ? { id: loggedCustomerId } : get('SELECT id FROM customers WHERE email = ?', email);
    if (customer) run('UPDATE customers SET name=?, phone=?, dni=? WHERE id=?', name, phone, dni, customer.id);
    else customer = { id: Number(run('INSERT INTO customers(email,name,phone,dni) VALUES(?,?,?,?)', email, name, phone, dni).lastInsertRowid) };
    const number = nextOrderNumber();
    const token = randomToken(18);
    const id = Number(run(`INSERT INTO orders(number, token, customer_id, email, name, phone, dni, subtotal, discount, shipping_cost, total,
        coupon_code, shipping_method, shipping_address, shipping_branch, customer_note, payment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      number, token, customer.id, email, name, phone, dni, subtotal, discount, shippingCost, total,
      coupon?.code || '', method, JSON.stringify(addr), String(ship.branch || ''), String(body.note || '').slice(0, 500), payWith === 'transferencia' ? 'transferencia' : '').lastInsertRowid);
    for (const i of items) {
      run('INSERT INTO order_items(order_id, product_id, variant_id, name, variant_label, sku, image, unit_price, qty) VALUES(?,?,?,?,?,?,?,?,?)',
        id, i.product_id, i.variant_id, i.name, i.variant_label, i.sku, i.image, i.unit_price, i.qty);
    }
    addEvent(id, 'created', `Pedido creado · ${fmtARS(total)} · ${SHIPPING_METHOD[method]} · ${payWith === 'transferencia' ? `transferencia (${pay.transferDiscount}% OFF: −${fmtARS(transferDiscount)})` : 'Mercado Pago'}`);
    return get('SELECT * FROM orders WHERE id = ?', id);
  });

  markCartsConverted(order.email, order.id);
  if (payWith === 'transferencia') {
    const transfer = transferInfo();
    notifyOrder('transfer_instructions', order, { transfer });
    notifyStaff('staff_transfer_pending', orderCtx(order), order.id);
    return { number: order.number, token: order.token, payUrl: `/pedido.html?t=${encodeURIComponent(order.token)}`, transfer: true };
  }
  const pref = await mp.createPreference(order, items, pay);
  run('UPDATE orders SET mp_preference_id = ? WHERE id = ?', pref.id, order.id);
  notifyOrder('order_received', order);
  return { number: order.number, token: order.token, payUrl: pref.init_point, mock: !!pref.mock };
}

export async function newPaymentLink(order) {
  if (order.status !== 'pending_payment') throw new HttpError(400, 'Este pedido ya no está esperando pago.');
  if (order.payment_method === 'transferencia') throw new HttpError(400, 'Este pedido se paga por transferencia: usá los datos bancarios de esta página.');
  const items = all('SELECT * FROM order_items WHERE order_id = ?', order.id);
  const pref = await mp.createPreference({ ...order, number: order.number }, items, getSetting('payments'));
  run('UPDATE orders SET mp_preference_id = ? WHERE id = ?', pref.id, order.id);
  return pref.init_point;
}

let lowStockQueue = [];
function flushLowStock(orderId) {
  if (!lowStockQueue.length) return;
  const list = lowStockQueue; lowStockQueue = [];
  notifyStaff('staff_low_stock', { lowStock: list, links: { panel: `${orderCtx({ id: orderId, token: '' }).links.panel.split('#')[0]}#stock` } }, orderId);
}
function applyStock(orderId, sign) {
  const items = all('SELECT variant_id, qty, name, variant_label FROM order_items WHERE order_id = ?', orderId);
  const warnings = [];
  for (const it of items) {
    const v = get('SELECT stock FROM variants WHERE id = ?', it.variant_id);
    if (!v || v.stock === null) continue;
    if (sign < 0 && v.stock < it.qty) warnings.push(`${it.name} (${it.variant_label}): había ${v.stock} y se vendieron ${it.qty}`);
    run('UPDATE variants SET stock = MAX(0, stock + ?) WHERE id = ?', sign * it.qty, it.variant_id);
    if (sign < 0 && v.stock - it.qty <= 1) lowStockQueue.push({ name: it.name, variant: it.variant_label, stock: Math.max(0, v.stock - it.qty) });
  }
  invalidateCatalog();
  return warnings;
}

/**
 * Aplica el estado de un pago de Mercado Pago al pedido. Es idempotente:
 * se puede llamar varias veces con el mismo pago (webhook + regreso de la clienta).
 */
export async function applyPayment(payment) {
  const order = get('SELECT * FROM orders WHERE number = ?', String(payment.external_reference || ''));
  if (!order) return { ok: false, reason: 'pedido no encontrado' };
  const status = payment.status;
  const result = tx(() => {
    const o = get('SELECT * FROM orders WHERE id = ?', order.id);
    const wasRejected = o.payment_status === 'rejected' && o.payment_id === String(payment.id);
    run(`UPDATE orders SET payment_status=?, payment_id=?, payment_method=?, updated_at=datetime('now') WHERE id=?`,
      status, String(payment.id), payment.payment_method_id || payment.payment_type_id || '', o.id);
    const label = mp.PAYMENT_STATUS_ES[status] || status;
    const last = get('SELECT message FROM order_events WHERE order_id = ? ORDER BY id DESC LIMIT 1', o.id);
    const msg = `Mercado Pago: ${label} (pago ${payment.id})`;
    if (last?.message !== msg) addEvent(o.id, 'payment', msg);

    if (status === 'approved' && (o.status === 'pending_payment' || (o.status === 'cancelled' && !o.paid_at))) {
      if (o.status === 'cancelled') addEvent(o.id, 'alert', 'El pago llegó después de que el pedido se canceló por falta de pago. Se reactivó: revisá el stock.');
      if (Number(payment.transaction_amount) + 1 < o.total) {
        addEvent(o.id, 'alert', `El monto pagado (${fmtARS(payment.transaction_amount)}) es menor al total del pedido. Revisalo antes de despachar.`);
      }
      run(`UPDATE orders SET status='paid', paid_at=datetime('now'), stock_applied=1 WHERE id=?`, o.id);
      const warnings = o.stock_applied ? [] : applyStock(o.id, -1);
      if (warnings.length) addEvent(o.id, 'alert', 'Stock insuficiente: ' + warnings.join('; '));
      if (o.coupon_code) run('UPDATE coupons SET uses = uses + 1 WHERE code = ? COLLATE NOCASE', o.coupon_code);
      return { newlyPaid: true };
    }
    if (status === 'rejected' && !wasRejected && o.status === 'pending_payment') return { rejected: true };
    if ((status === 'refunded' || status === 'charged_back') && !['refunded', 'cancelled'].includes(o.status)) {
      run(`UPDATE orders SET status='refunded' WHERE id=?`, o.id);
      if (o.stock_applied) { applyStock(o.id, +1); run('UPDATE orders SET stock_applied=0 WHERE id=?', o.id); }
    }
    return { newlyPaid: false };
  });
  const fresh = get('SELECT * FROM orders WHERE id = ?', order.id);
  if (result.newlyPaid) {
    notifyOrder('payment_approved', fresh);
    notifyStaff('staff_new_order', orderCtx(fresh), fresh.id);
    flushLowStock(fresh.id);
  }
  if (result.rejected) notifyOrder('payment_rejected', fresh);
  return { ok: true, order: order.number, status };
}

export async function syncPaymentById(paymentId) {
  const payment = await mp.getPayment(paymentId);
  return applyPayment(payment);
}

/** Cambio de estado manual desde el panel. */
export async function setStatus(orderId, status, by = 'panel') {
  if (!ORDER_STATUS[status]) throw new HttpError(400, 'Estado desconocido.');
  const o = get('SELECT * FROM orders WHERE id = ?', orderId);
  if (!o) throw new HttpError(404, 'No encontramos ese pedido.');
  tx(() => {
    if (status === 'paid' && o.status === 'pending_payment') {
      run(`UPDATE orders SET paid_at=datetime('now'), payment_status='approved' WHERE id=?`, o.id);
      if (!o.stock_applied) { applyStock(o.id, -1); run('UPDATE orders SET stock_applied=1 WHERE id=?', o.id); }
    }
    if ((status === 'cancelled' || status === 'refunded') && o.stock_applied) {
      applyStock(o.id, +1);
      run('UPDATE orders SET stock_applied=0 WHERE id=?', o.id);
    }
    run(`UPDATE orders SET status=?, updated_at=datetime('now') ${status === 'shipped' ? ", shipped_at=datetime('now')" : ''}${status === 'ready_pickup' ? ", ready_at=datetime('now')" : ''} WHERE id=?`, status, o.id);
    addEvent(o.id, 'status', `Estado: ${ORDER_STATUS[status]} (${by})`);
  });
  const fresh = get('SELECT * FROM orders WHERE id = ?', o.id);
  if (status !== o.status) {
    const sh = getSetting('shipping');
    if (status === 'paid' && o.status === 'pending_payment') { notifyOrder('payment_approved', fresh); notifyStaff('staff_new_order', orderCtx(fresh), fresh.id); flushLowStock(fresh.id); }
    if (status === 'preparing') notifyOrder('order_preparing', fresh);
    if (status === 'ready_pickup') notifyOrder('order_ready_pickup', fresh, { pickup: { address: sh.pickupAddress, hours: sh.pickupHours } });
    if (status === 'shipped' && fresh.andreani_number) notifyOrder('order_shipped', fresh, { tracking: { number: fresh.andreani_number, url: andreani.trackingUrl(fresh.andreani_number) } });
    if (status === 'delivered') notifyOrder('order_delivered', fresh);
    if (status === 'cancelled') notifyOrder('order_cancelled', fresh, { reason: '' });
    if (status === 'refunded') notifyOrder('order_refunded', fresh);
  }
  return fresh;
}

export async function createShipment(orderId) {
  const o = get('SELECT * FROM orders WHERE id = ?', orderId);
  if (!o) throw new HttpError(404, 'No encontramos ese pedido.');
  if (!o.shipping_method.startsWith('andreani')) throw new HttpError(400, 'Este pedido es para retirar en el local.');
  if (o.andreani_number) throw new HttpError(400, `Este pedido ya tiene envío: ${o.andreani_number}.`);
  if (!['paid', 'preparing'].includes(o.status)) throw new HttpError(400, 'Solo se puede crear el envío de pedidos pagados.');
  const items = all(`SELECT oi.*, p.weight_kg, p.height_cm, p.width_cm, p.depth_cm FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`, o.id);
  const s = getSetting('shipping');
  const res = await andreani.createShipment(o, items, s);
  run(`UPDATE orders SET andreani_number=?, status='preparing', updated_at=datetime('now') WHERE id=?`, res.numero, o.id);
  addEvent(o.id, 'shipping', `Envío Andreani creado: ${res.numero}${res.mock ? ' (prueba)' : ''}`);
  return get('SELECT * FROM orders WHERE id = ?', o.id);
}

export async function refreshTracking(orderId) {
  const o = get('SELECT * FROM orders WHERE id = ?', orderId);
  if (!o?.andreani_number) throw new HttpError(400, 'Este pedido todavía no tiene envío de Andreani.');
  const events = await andreani.tracking(o.andreani_number);
  const last = events[events.length - 1];
  run(`UPDATE orders SET tracking_events=?, tracking_status=? WHERE id=?`, JSON.stringify(events), last?.estado || '', o.id);
  if (last && /entregad/i.test(last.estado) && o.status === 'shipped') await setStatus(o.id, 'delivered', 'Andreani');
  return events;
}

/** Cancela pedidos que quedaron esperando pago más de 72 horas. */
export function expireStaleOrders() {
  const th = Math.max(1, Number(getSetting('payments').transferHours) || 48);
  const stale = all(`SELECT id, payment_method FROM orders WHERE status='pending_payment' AND (
      (payment_method != 'transferencia' AND created_at < datetime('now','-72 hours')) OR
      (payment_method = 'transferencia' AND created_at < datetime('now', ?)))`, `-${th} hours`);
  for (const o of stale) {
    run(`UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?`, o.id);
    addEvent(o.id, 'status', `Cancelado automáticamente: no se pagó en ${o.payment_method === 'transferencia' ? th : 72} horas.`);
    notifyOrder('order_cancelled', get('SELECT * FROM orders WHERE id = ?', o.id), { reason: 'porque no se registró el pago a tiempo' });
  }
  return stale.length;
}

export function publicOrder(o) {
  const items = all('SELECT name, variant_label, image, unit_price, qty FROM order_items WHERE order_id = ?', o.id);
  return {
    number: o.number, status: o.status, statusLabel: ORDER_STATUS[o.status], paymentStatus: o.payment_status,
    paymentLabel: mp.PAYMENT_STATUS_ES[o.payment_status] || o.payment_status,
    name: o.name, email: o.email, items, subtotal: o.subtotal, discount: o.discount, shippingCost: o.shipping_cost, total: o.total,
    shippingMethod: o.shipping_method, shippingLabel: SHIPPING_METHOD[o.shipping_method],
    andreaniNumber: o.andreani_number, trackingUrl: o.andreani_number && !o.andreani_number.startsWith('MOCK') ? andreani.trackingUrl(o.andreani_number) : '',
    trackingStatus: o.tracking_status, createdAt: o.created_at,
    paymentMethod: o.payment_method === 'transferencia' ? 'transferencia' : 'mercadopago',
    transfer: o.payment_method === 'transferencia' && o.status === 'pending_payment' ? transferInfo() : null,
  };
}

export function transferInfo() {
  const p = getSetting('payments');
  return { holder: p.bankHolder, bank: p.bankName, cbu: p.bankCbu, alias: p.bankAlias, hours: p.transferHours || 48, discount: p.transferDiscount || 0, whatsapp: getSetting('store').whatsapp };
}
