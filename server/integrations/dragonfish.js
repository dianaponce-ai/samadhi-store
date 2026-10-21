// Lince / Dragonfish (Zoo Logic): el stock y los precios del local mandan.
//
// Dragonfish expone su API REST en la PC del local (por defecto http://localhost:8000/api.Dragonfish),
// con dos encabezados: IdCliente y Authorization (el token que da Zoo Logic). Hay dos formas de conectarla:
//   · directo: si la API es accesible desde internet, la tienda la consulta sola cada X minutos.
//   · agente:  un programita en la PC del local (lince/samadhi-lince.ps1) lee Dragonfish y le manda
//              el stock a la tienda. Es lo más común, porque la API suele quedar sólo en la red del local.
// Sin credenciales queda en modo prueba: simula una lectura con el stock actual para ver cómo funciona.
//
// Cómo se cruza: código de artículo de Lince = campo "Artículo" del producto, más color y talle.
// Las ventas web pagadas que todavía no se cargaron en Lince se descuentan, para no revender la última prenda.
import crypto from 'node:crypto';
import { config } from '../lib/config.js';
import { db, all, get, run, tx, getSetting, setSetting } from '../lib/db.js';
import { invalidateCatalog } from '../lib/catalog.js';
import { HttpError } from '../lib/util.js';

db.exec(`
CREATE TABLE IF NOT EXISTS lince_sync (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL,
  rows INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  unchanged INTEGER NOT NULL DEFAULT 0,
  not_found INTEGER NOT NULL DEFAULT 0,
  prices INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  detail TEXT NOT NULL DEFAULT '{}'
);
`);
if (!db.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === 'lince_at')) db.exec('ALTER TABLE orders ADD COLUMN lince_at TEXT');

export const LINCE_DEFAULTS = { autoMinutes: 30, updatePrices: false, hideOutOfStock: false, since: null };
export function linceSettings() { return { ...LINCE_DEFAULTS, ...getSetting('lince') }; }

// ── Lectura flexible de las filas de Dragonfish ──
const pick = (row, ...keys) => { for (const k of keys) if (row?.[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]; return undefined; };
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const money = (v) => {
  if (v === undefined) return null;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v).trim().replace(/\$|\s/g, '');
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
};
export function readRow(r) {
  const qty = Number(pick(r, 'Disponible', 'disponible', 'Stock', 'stock', 'Cantidad', 'cantidad', 'Saldo', 'saldo'));
  return {
    articulo: String(pick(r, 'Articulo', 'articulo', 'CodigoArticulo', 'codigoArticulo', 'Codigo', 'codigo') ?? '').trim(),
    color: String(pick(r, 'Color', 'color', 'ColorDescripcion', 'DescripcionColor') ?? '').trim(),
    talle: String(pick(r, 'Talle', 'talle', 'Talla', 'talla') ?? '').trim(),
    qty: Number.isFinite(qty) ? qty : null,
    price: money(pick(r, 'Precio', 'precio', 'PrecioVenta', 'precioVenta', 'PrecioLista', 'precioLista', 'Importe')),
  };
}

// Índice de variantes de la tienda por artículo + color + talle (con comodines si el producto no usa color o talle).
function variantIndex() {
  const idx = new Map();
  const rows = all(`SELECT v.id, v.color, v.size, v.price, v.stock, p.ref_code, p.name FROM variants v JOIN products p ON p.id = v.product_id WHERE p.ref_code <> ''`);
  for (const v of rows) {
    const a = norm(v.ref_code), c = norm(v.color), t = norm(v.size);
    for (const k of [`${a}|${c}|${t}`, `${a}|${c}|*`, `${a}|*|${t}`, `${a}|*|*`]) { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(v); }
  }
  return { idx, rows };
}
function matchRow(idx, r) {
  const a = norm(r.articulo), c = norm(r.color), t = norm(r.talle);
  if (!a) return [];
  const exact = idx.get(`${a}|${c}|${t}`);
  if (exact) return exact;
  // Producto sin color en la tienda (sólo talles) o sin talle (sólo color): se cruza por lo que haya.
  const byT = (idx.get(`${a}|*|${t}`) || []).filter((v) => !v.color);
  if (t && byT.length) return byT;
  const byC = (idx.get(`${a}|${c}|*`) || []).filter((v) => !v.size);
  if (c && byC.length) return byC;
  const only = (idx.get(`${a}|*|*`) || []).filter((v) => !v.color && !v.size);
  return only;
}

/** Ventas web ya descontadas en la tienda que todavía no figuran en Lince (por variante). */
export function pendingWebSales() {
  const since = linceSettings().since;
  if (!since) return new Map();
  const m = new Map();
  for (const r of all(`SELECT oi.variant_id, SUM(oi.qty) AS q FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.stock_applied = 1 AND o.lince_at IS NULL AND o.paid_at >= ? GROUP BY oi.variant_id`, since)) m.set(r.variant_id, r.q);
  return m;
}

/** Aplica una lectura de stock de Dragonfish. Devuelve el resumen que queda en el historial. */
export function applyStock(rawRows, source) {
  if (!Array.isArray(rawRows)) throw new HttpError(400, 'No llegó la lista de stock.');
  const set = linceSettings();
  if (!set.since) setSetting('lince', { since: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  const pending = pendingWebSales();
  const { idx, rows: storeRows } = variantIndex();
  const total = new Map(); // variante → { qty, price }
  const notFound = [];
  for (const raw of rawRows) {
    const r = readRow(raw);
    if (!r.articulo || r.qty === null) continue;
    const vs = matchRow(idx, r);
    if (!vs.length) { if (notFound.length < 300) notFound.push(r); continue; }
    for (const v of vs) {
      const cur = total.get(v.id) || { qty: 0, price: null };
      cur.qty += r.qty; // varios depósitos o filas del mismo artículo se suman
      if (r.price) cur.price = r.price;
      total.set(v.id, cur);
    }
  }
  let updated = 0, unchanged = 0, prices = 0;
  const changes = [];
  const byId = new Map(storeRows.map((v) => [v.id, v]));
  tx(() => {
    for (const [id, t] of total) {
      const v = byId.get(id);
      const stock = Math.max(0, Math.floor(t.qty) - (pending.get(id) || 0));
      const newPrice = set.updatePrices && t.price > 0 && t.price !== v.price ? t.price : null;
      if (stock === v.stock && !newPrice) { unchanged++; continue; }
      run('UPDATE variants SET stock = ?, price = COALESCE(?, price) WHERE id = ?', stock, newPrice, id);
      if (stock !== v.stock) { updated++; if (changes.length < 60) changes.push({ name: v.name, variant: [v.color, v.size].filter(Boolean).join(' · '), from: v.stock, to: stock }); }
      if (newPrice) prices++;
    }
  });
  if (updated || prices) invalidateCatalog();
  const withoutLince = all(`SELECT p.id, p.name, p.ref_code FROM products p WHERE p.visible = 1 AND p.ref_code = ''`).length;
  const missing = storeRows.filter((v) => !total.has(v.id)).length;
  const summary = { rows: rawRows.length, updated, unchanged, notFound: notFound.length, prices, missing, withoutCode: withoutLince, pending: [...pending.values()].reduce((a, b) => a + b, 0) };
  run('INSERT INTO lince_sync(source, rows, updated, unchanged, not_found, prices, detail) VALUES(?,?,?,?,?,?,?)',
    source, rawRows.length, updated, unchanged, notFound.length, prices, JSON.stringify({ notFound, changes, missing, withoutCode: withoutLince }));
  return summary;
}

// ── Lectura directa de la API de Dragonfish ──
async function dfGet(pathAndQuery) {
  const ctrl = AbortSignal.timeout(25000);
  let r;
  try {
    r = await fetch(`${config.lince.url}/${pathAndQuery}`, { headers: { IdCliente: config.lince.clientId, Authorization: config.lince.token, Accept: 'application/json' }, signal: ctrl });
  } catch (e) { throw new HttpError(502, `Dragonfish no responde en ${config.lince.url} (${e.cause?.code || e.name}). ¿Está prendida la PC del local y el servicio REST activo?`); }
  if (r.status === 401 || r.status === 403) throw new HttpError(502, 'Dragonfish rechazó el acceso: revisá DRAGONFISH_ID_CLIENTE y DRAGONFISH_TOKEN.');
  if (!r.ok) throw new HttpError(502, `Dragonfish respondió ${r.status} en ${pathAndQuery.split('?')[0]}.`);
  return r.json();
}
export async function fetchStock() {
  const out = [];
  for (let page = 1; page < 500; page++) {
    const d = await dfGet(`${config.lince.stockPath}/?limit=200&page=${page}`);
    const rows = d.Resultados || d.resultados || d.data || (Array.isArray(d) ? d : []);
    out.push(...rows);
    const totalRows = d.TotalRegistros ?? d.totalRegistros;
    if (!rows.length || (totalRows !== undefined && out.length >= totalRows) || totalRows === undefined) break;
  }
  return out;
}

// Modo prueba: arma una lectura "como si" viniera de Lince, con el stock actual y algunos cambios.
export function mockRows() {
  const rows = all(`SELECT v.id, v.color, v.size, v.price, v.stock, p.ref_code FROM variants v JOIN products p ON p.id = v.product_id WHERE p.ref_code <> '' AND p.visible = 1`);
  const out = rows.map((v, i) => ({ Articulo: v.ref_code, Color: v.color, Talle: v.size, Disponible: (v.stock ?? 3) + (i % 9 === 0 ? 1 : i % 13 === 0 ? -1 : 0), Precio: v.price }));
  out.push({ Articulo: 'S27XX99', Color: 'Crudo', Talle: 'U', Disponible: 4, Precio: 59000 }, { Articulo: 'S26AC10', Color: 'Negro', Talle: '', Disponible: 2, Precio: 21000 });
  return out;
}

let running = false;
export async function syncNow(source = 'panel') {
  if (running) throw new HttpError(409, 'Ya hay una sincronización en curso.');
  running = true;
  try {
    if (config.lince.mode === 'agente') throw new HttpError(400, 'La tienda está en modo agente: el stock lo manda el programa instalado en la PC del local. Revisá que esté corriendo.');
    const rows = config.lince.mode === 'directo' ? await fetchStock() : mockRows();
    return applyStock(rows, config.lince.mode === 'directo' ? source : `${source} (prueba)`);
  } catch (e) {
    run('INSERT INTO lince_sync(source, error) VALUES(?, ?)', source, e.message.slice(0, 300));
    throw e;
  } finally { running = false; }
}

/** El agente se identifica con LINCE_SYNC_SECRET (comparación en tiempo constante). */
export function agentAllowed(secret) {
  const want = config.lince.syncSecret;
  if (!want || !secret) return false;
  const a = Buffer.from(String(secret)), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Pedidos web pagados que falta cargar en Lince. */
export function pendingOrders() {
  const since = linceSettings().since;
  if (!since) return [];
  return all(`SELECT id, number, name, email, total, paid_at, status, payment_method FROM orders WHERE stock_applied = 1 AND lince_at IS NULL AND paid_at >= ? ORDER BY paid_at`, since)
    .map((o) => ({ ...o, items: all(`SELECT oi.name, oi.variant_label, oi.qty, oi.unit_price, p.ref_code FROM order_items oi LEFT JOIN variants v ON v.id = oi.variant_id LEFT JOIN products p ON p.id = v.product_id WHERE oi.order_id = ?`, o.id) }));
}
export function markLoaded(orderId, by) {
  const o = get('SELECT id, number, lince_at FROM orders WHERE id = ?', orderId);
  if (!o) throw new HttpError(404, 'No encontramos ese pedido.');
  if (!o.lince_at) {
    run("UPDATE orders SET lince_at = datetime('now') WHERE id = ?", o.id);
    run('INSERT INTO order_events(order_id, kind, message) VALUES(?,?,?)', o.id, 'status', `Cargado en Lince (${by})`);
  }
  return { ok: true };
}

export function status() {
  const last = all('SELECT id, at, source, rows, updated, unchanged, not_found, prices, error FROM lince_sync ORDER BY id DESC LIMIT 15');
  const lastOk = get('SELECT * FROM lince_sync WHERE error IS NULL ORDER BY id DESC LIMIT 1');
  const s = linceSettings();
  return {
    mode: config.lince.mode, url: config.lince.mode === 'directo' ? config.lince.url : '', settings: s,
    last, detail: lastOk ? JSON.parse(lastOk.detail) : null, lastOkAt: lastOk?.at || null,
    pendingOrders: pendingOrders(),
    coverage: get(`SELECT COUNT(*) AS products, SUM(ref_code <> '') AS withCode FROM products WHERE visible = 1`),
  };
}

export function startLince() {
  if (config.lince.mode !== 'directo') return;
  let lastRun = 0;
  setInterval(() => {
    const every = Math.max(5, Number(linceSettings().autoMinutes) || 30) * 60e3;
    if (Date.now() - lastRun < every) return;
    lastRun = Date.now();
    syncNow('automática').catch((e) => console.error('[lince]', e.message));
  }, 60e3).unref();
}
