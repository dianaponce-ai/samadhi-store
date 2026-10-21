// Carritos guardados: permiten recordar a la clienta las prendas que dejó en la bolsa
// ("Tenés un carrito esperándote") y recuperar la bolsa desde el link del email.
import { db, all, get, run } from './db.js';
import { randomToken, isEmail } from './util.js';

db.exec(`
CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  customer_id INTEGER,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  reminders INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TEXT,
  order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS carts_email ON carts(email);
`);
for (const [table, col, def] of [['customers', 'marketing_opt_out', 'INTEGER NOT NULL DEFAULT 0'], ['orders', 'reminded_at', 'TEXT'], ['orders', 'pickup_reminded_at', 'TEXT'], ['orders', 'ready_at', 'TEXT']]) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

/** Guarda (o actualiza) la bolsa de una persona identificada por email. Una bolsa activa por email. */
export function saveCart({ email, name = '', customerId = null, items }) {
  email = String(email || '').toLowerCase().trim();
  if (!isEmail(email)) return null;
  const clean = (Array.isArray(items) ? items : []).map((i) => ({ variant_id: Number(i.variant_id), qty: Math.max(1, Math.min(20, Math.floor(Number(i.qty) || 1))) })).filter((i) => i.variant_id).slice(0, 40);
  let subtotal = 0;
  for (const i of clean) {
    const v = get('SELECT COALESCE(promo_price, price) AS p FROM variants WHERE id = ?', i.variant_id);
    if (v) subtotal += v.p * i.qty;
  }
  const ex = get("SELECT id, token, items FROM carts WHERE email = ? AND status = 'active' ORDER BY id DESC LIMIT 1", email);
  if (!clean.length) {
    if (ex) run("UPDATE carts SET status = 'empty', updated_at = datetime('now') WHERE id = ?", ex.id);
    return null;
  }
  if (ex) {
    // Si cambió el contenido, los recordatorios vuelven a empezar.
    const changed = ex.items !== JSON.stringify(clean);
    run(`UPDATE carts SET items = ?, subtotal = ?, name = COALESCE(NULLIF(?, ''), name), customer_id = COALESCE(?, customer_id),
         updated_at = CASE WHEN ? THEN datetime('now') ELSE updated_at END, reminders = CASE WHEN ? THEN 0 ELSE reminders END WHERE id = ?`,
      JSON.stringify(clean), subtotal, name, customerId, changed ? 1 : 0, changed ? 1 : 0, ex.id);
    return ex.token;
  }
  const token = randomToken(12);
  run('INSERT INTO carts(token, email, name, customer_id, items, subtotal) VALUES(?,?,?,?,?,?)', token, email, name, customerId, JSON.stringify(clean), subtotal);
  return token;
}

export function cartByToken(token) {
  const c = get('SELECT * FROM carts WHERE token = ?', String(token || ''));
  if (!c) return null;
  return { items: JSON.parse(c.items), status: c.status };
}

export function markCartsConverted(email, orderId) {
  run("UPDATE carts SET status = 'converted', order_id = ?, updated_at = datetime('now') WHERE email = ? AND status = 'active'", orderId, String(email).toLowerCase());
}

/** Prendas del carrito con nombre, foto y precio actual (para el email y el panel). */
export function cartItems(c) {
  return JSON.parse(c.items).map((i) => {
    const v = get(`SELECT v.color, v.size, v.other, COALESCE(v.promo_price, v.price) AS price, v.stock, p.name, p.visible,
        (SELECT url FROM images WHERE product_id = p.id ORDER BY position LIMIT 1) AS image
      FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`, i.variant_id);
    if (!v || !v.visible) return null;
    return { name: v.name, variant_label: [v.color, v.size && `Talle ${v.size}`, v.other].filter(Boolean).join(' · '), qty: i.qty, unit_price: v.price, image: (v.image || '').replace(/-1024-1024\.webp$/, '-320-0.webp'), stock: v.stock };
  }).filter(Boolean);
}

export function listCarts() {
  return all('SELECT id, email, name, items, subtotal, status, reminders, last_reminder_at, order_id, created_at, updated_at FROM carts ORDER BY updated_at DESC LIMIT 200')
    .map((c) => ({ ...c, items: cartItems(c), order: c.order_id ? get('SELECT id, number FROM orders WHERE id = ?', c.order_id) : null }));
}
