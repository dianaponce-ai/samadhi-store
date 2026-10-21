import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(process.env.DB_FILE || path.join(config.dataDir, 'samadhi.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  collection TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  ref_code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  collection TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  free_shipping INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  weight_kg REAL NOT NULL DEFAULT 0.5,
  height_cm REAL NOT NULL DEFAULT 5,
  width_cm REAL NOT NULL DEFAULT 30,
  depth_cm REAL NOT NULL DEFAULT 30,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  other TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  promo_price INTEGER,
  stock INTEGER,
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS variants_product ON variants(product_id);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS images_product ON images(product_id);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY,
  eyebrow TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT '',
  cta_link TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'dark',
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  dni TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  dni TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_payment',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_id TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  mp_preference_id TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  shipping_cost INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  coupon_code TEXT NOT NULL DEFAULT '',
  shipping_method TEXT NOT NULL,
  shipping_address TEXT NOT NULL DEFAULT '{}',
  shipping_branch TEXT NOT NULL DEFAULT '',
  andreani_number TEXT NOT NULL DEFAULT '',
  tracking_status TEXT NOT NULL DEFAULT '',
  tracking_events TEXT NOT NULL DEFAULT '[]',
  customer_note TEXT NOT NULL DEFAULT '',
  internal_note TEXT NOT NULL DEFAULT '',
  stock_applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  shipped_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  variant_id INTEGER,
  name TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'percent',
  value INTEGER NOT NULL DEFAULT 0,
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  result TEXT NOT NULL
);
`);

// Migraciones simples: columnas agregadas después de la primera versión.
for (const [table, col, def] of [
  ['admin_users', 'role', "TEXT NOT NULL DEFAULT 'admin'"],
  ['customers', 'password_hash', 'TEXT'],
  ['banners', 'video_url', "TEXT NOT NULL DEFAULT ''"],
]) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

export const all = (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r }));
export const get = (sql, ...p) => {
  const r = db.prepare(sql).get(...p);
  return r ? { ...r } : null;
};
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const DEFAULT_SETTINGS = {
  store: {
    name: 'Samadhi Style',
    tagline: 'Lo auténtico también se viste.',
    email: '',
    phone: '',
    whatsapp: '(0221) 5046554',
    instagram: 'samadhistyle',
    address: '',
    announcement: '10% OFF pagando con transferencia · 3 cuotas sin interés · Envíos a todo el país',
  },
  shipping: {
    pickupEnabled: true,
    pickupAddress: '',
    pickupHours: '',
    freeShippingFrom: 0,
    andreaniDomicilio: true,
    andreaniSucursal: true,
    extraHandling: 0,
    origin: { calle: '', numero: '', codigoPostal: '', localidad: '', region: 'AR-C', pais: 'Argentina' },
    sender: { nombreCompleto: 'Samadhi Style', email: '', documentoTipo: 'CUIT', documentoNumero: '', telefono: '' },
  },
  payments: {
    installments: 3,
    transferEnabled: true,
    transferDiscount: 10,
    bankHolder: '',
    bankName: '',
    bankCbu: '',
    bankAlias: '',
    transferHours: 48,
  },
  checkout: {
    requireDni: true,
    orderPrefix: 'S',
    nextOrderNumber: 1001,
  },
};

export function getSetting(key) {
  const r = get('SELECT value FROM settings WHERE key = ?', key);
  const base = DEFAULT_SETTINGS[key] ?? {};
  if (!r) return structuredClone(base);
  const v = JSON.parse(r.value);
  return typeof base === 'object' && !Array.isArray(base) ? deepMerge(structuredClone(base), v) : v;
}
export function setSetting(key, value) {
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}
function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') a[k] = deepMerge(a[k], v);
    else a[k] = v;
  }
  return a;
}
