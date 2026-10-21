// Cálculo de estadísticas, sin dependencias: lo usa el servidor y también la vista previa.
// Las fechas de la base están en UTC ("2026-10-21 18:30:00"); se agrupan por día de Argentina (UTC-3).

const TZ_MS = -3 * 3600e3;
const DAY = 864e5;
const SOLD = new Set(['paid', 'preparing', 'ready_pickup', 'shipped', 'delivered']);

const toLocal = (s) => new Date(new Date(String(s).replace(' ', 'T') + 'Z').getTime() + TZ_MS);
const dayKey = (d) => d.toISOString().slice(0, 10);
const parseDay = (k) => new Date(k + 'T00:00:00Z'); // día local representado en UTC
const addDays = (k, n) => dayKey(new Date(parseDay(k).getTime() + n * DAY));
export const todayAR = () => dayKey(new Date(Date.now() + TZ_MS));

const PAY = { transferencia: 'Transferencia', account_money: 'Dinero en cuenta MP', visa: 'Tarjeta de crédito', master: 'Tarjeta de crédito', amex: 'Tarjeta de crédito', naranja: 'Tarjeta de crédito', cabal: 'Tarjeta de crédito', debvisa: 'Tarjeta de débito', debmaster: 'Tarjeta de débito', maestro: 'Tarjeta de débito', debcabal: 'Tarjeta de débito', mock: 'Mercado Pago (prueba)' };
const SHIP = { andreani_domicilio: 'Andreani a domicilio', andreani_sucursal: 'Andreani a sucursal', retiro: 'Retiro en el local' };
const WEEK = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Normaliza el rango pedido. Si falta, últimos 30 días. */
export function resolveRange(from, to) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  let t = re.test(to || '') ? to : todayAR();
  let f = re.test(from || '') ? from : addDays(t, -29);
  if (f > t) [f, t] = [t, f];
  const days = Math.round((parseDay(t) - parseDay(f)) / DAY) + 1;
  if (days > 1100) f = addDays(t, -1099);
  const n = Math.round((parseDay(t) - parseDay(f)) / DAY) + 1;
  return { from: f, to: t, days: n, prevFrom: addDays(f, -n), prevTo: addDays(f, -1) };
}

function kpis(orders, carts, from, to, firstPaidByEmail) {
  const inR = (s) => { if (!s) return false; const k = dayKey(toLocal(s)); return k >= from && k <= to; };
  const sold = orders.filter((o) => o.paid_at && SOLD.has(o.status) && inR(o.paid_at));
  const created = orders.filter((o) => inR(o.created_at));
  const refunded = orders.filter((o) => o.status === 'refunded' && inR(o.paid_at || o.created_at));
  const revenue = sold.reduce((a, o) => a + o.total, 0);
  const units = sold.reduce((a, o) => a + o.items.reduce((b, i) => b + i.qty, 0), 0);
  const emails = new Set(sold.map((o) => o.email));
  const newCustomers = [...emails].filter((e) => inR(firstPaidByEmail.get(e))).length;
  const createdCarts = carts.filter((c) => inR(c.created_at));
  const recovered = carts.filter((c) => c.status === 'converted' && c.reminders > 0 && inR(c.updated_at));
  return {
    sold, revenue, orders: sold.length, avgTicket: sold.length ? Math.round(revenue / sold.length) : 0, units,
    customers: emails.size, newCustomers, returning: emails.size - newCustomers,
    discounts: sold.reduce((a, o) => a + (o.discount || 0), 0), shipping: sold.reduce((a, o) => a + (o.shipping_cost || 0), 0),
    refunds: refunded.reduce((a, o) => a + o.total, 0), refundCount: refunded.length,
    checkouts: created.length, paidRate: created.length ? created.filter((o) => o.paid_at).length / created.length : 0,
    unpaid: created.filter((o) => !o.paid_at).length,
    carts: createdCarts.length, recoveredCarts: recovered.length, recoveredValue: recovered.reduce((a, c) => a + (c.subtotal || 0), 0),
  };
}

const groupSum = (list, keyFn, valFn, unitFn = () => 0) => {
  const m = new Map();
  for (const x of list) for (const [k, v, u] of [].concat(keyFn(x)).map((k) => [k, valFn(x), unitFn(x)])) {
    if (!k) continue;
    const cur = m.get(k) || { label: k, value: 0, count: 0, units: 0 };
    cur.value += v; cur.count++; cur.units += u; m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
};

/**
 * orders: [{ id, number, status, email, total, subtotal, discount, shipping_cost, coupon_code, payment_method, shipping_method,
 *            provincia, created_at, paid_at, items: [{ product_id, name, image, qty, unit_price, categories: [nombre] }] }]
 * carts:  [{ created_at, updated_at, status, reminders, subtotal }]
 */
export function computeStats({ orders, carts = [], from, to }) {
  const r = resolveRange(from, to);
  const firstPaidByEmail = new Map();
  for (const o of orders.filter((x) => x.paid_at && SOLD.has(x.status)).sort((a, b) => (a.paid_at < b.paid_at ? -1 : 1))) if (!firstPaidByEmail.has(o.email)) firstPaidByEmail.set(o.email, o.paid_at);
  const cur = kpis(orders, carts, r.from, r.to, firstPaidByEmail);
  const prev = kpis(orders, carts, r.prevFrom, r.prevTo, firstPaidByEmail);

  // Serie: por día hasta 92 días, por semana hasta ~1 año, después por mes.
  const unit = r.days <= 92 ? 'day' : r.days <= 400 ? 'week' : 'month';
  const bucketOf = (k) => {
    if (unit === 'day') return k;
    if (unit === 'month') return k.slice(0, 7) + '-01';
    const d = parseDay(k); const back = (d.getUTCDay() + 6) % 7; return addDays(k, -back); // semana desde el lunes
  };
  const buckets = new Map();
  for (let k = bucketOf(r.from); k <= r.to; ) {
    buckets.set(k, { key: k, revenue: 0, orders: 0, units: 0 });
    k = unit === 'day' ? addDays(k, 1) : unit === 'week' ? addDays(k, 7) : (() => { const d = parseDay(k); d.setUTCMonth(d.getUTCMonth() + 1); return dayKey(d); })();
  }
  for (const o of cur.sold) {
    const b = buckets.get(bucketOf(dayKey(toLocal(o.paid_at))));
    if (b) { b.revenue += o.total; b.orders++; b.units += o.items.reduce((a, i) => a + i.qty, 0); }
  }

  const items = cur.sold.flatMap((o) => o.items);
  const products = new Map();
  for (const i of items) {
    const k = i.product_id || i.name;
    const p = products.get(k) || { id: i.product_id, name: i.name, image: i.image, units: 0, revenue: 0 };
    p.units += i.qty; p.revenue += i.unit_price * i.qty; products.set(k, p);
  }
  const weekday = WEEK.map((label) => ({ label, value: 0, count: 0 }));
  for (const o of cur.sold) { const w = weekday[toLocal(o.paid_at).getUTCDay()]; w.value += o.total; w.count++; }

  const strip = ({ sold, ...k }) => k;
  return {
    range: { from: r.from, to: r.to, days: r.days, prevFrom: r.prevFrom, prevTo: r.prevTo, unit },
    kpis: strip(cur), prev: strip(prev),
    series: [...buckets.values()],
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    byCategory: groupSum(items, (i) => (i.categories?.length ? i.categories : ['Sin categoría']), (i) => i.unit_price * i.qty, (i) => i.qty).slice(0, 8),
    byPayment: groupSum(cur.sold, (o) => PAY[o.payment_method] || 'Mercado Pago', (o) => o.total),
    byShipping: groupSum(cur.sold, (o) => SHIP[o.shipping_method] || o.shipping_method, (o) => o.total),
    byProvince: groupSum(cur.sold, (o) => (o.shipping_method === 'retiro' ? 'Retiro en el local' : o.provincia || 'Sin dato'), (o) => o.total).slice(0, 8),
    byWeekday: [...weekday.slice(1), weekday[0]],
    coupons: groupSum(cur.sold.filter((o) => o.coupon_code), (o) => o.coupon_code.toUpperCase(), (o) => o.discount || 0),
  };
}
