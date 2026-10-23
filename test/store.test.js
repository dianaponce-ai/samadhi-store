// Pruebas de punta a punta con una base temporal: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const dir = mkdtempSync(path.join(tmpdir(), 'samadhi-test-'));
const PORT = 3800 + Math.floor(Math.random() * 100);
const B = `http://localhost:${PORT}`;
let srv;
const env = { ...process.env, DATA_DIR: dir, PORT: String(PORT), PUBLIC_URL: B, ADMIN_EMAIL: 'test@samadhi.local', ADMIN_PASSWORD: 'clave-de-prueba-123', SESSION_SECRET: 'x'.repeat(64), MP_ACCESS_TOKEN: '', ANDREANI_USER: '', LINCE_SYNC_SECRET: 'clave-agente-de-prueba-0123456789', DRAGONFISH_URL: '' };
const node = (args) => new Promise((res, rej) => { const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', ...args], { env, stdio: 'pipe' }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('exit', (c) => (c ? rej(new Error(out)) : res(out))); });

before(async () => {
  await node(['scripts/import-tiendanube.js']);
  srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env, stdio: 'pipe' });
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/catalog'); return; } catch { await new Promise((r) => setTimeout(r, 150)); } }
});
after(() => { srv?.kill(); rmSync(dir, { recursive: true, force: true }); });

const json = async (p, opts = {}) => { const r = await fetch(B + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }); return { status: r.status, data: await r.json().catch(() => null), headers: r.headers }; };

test('el catálogo trae los productos visibles con fotos', async () => {
  const { data } = await json('/api/catalog');
  assert.equal(data.products.length, 202); // 201 de Tiendanube + el blazer de prueba del probador
  assert.ok(data.products.filter((p) => p.images.length).length >= 199);
  assert.ok(data.banners.length >= 3);
});

test('compra completa: cotización, pedido, pago simulado y stock', async () => {
  const cat = (await json('/api/catalog')).data;
  const p = cat.products.find((x) => x.variants.some((v) => v.stock > 1));
  const v = p.variants.find((x) => x.stock > 1);
  const q = await json('/api/shipping/quote', { method: 'POST', body: { cp: '1425', items: [{ variant_id: v.id, qty: 1 }] } });
  assert.equal(q.status, 200);
  assert.ok(q.data.options.find((o) => o.method === 'andreani_domicilio').cost > 0);

  const bad = await json('/api/checkout', { method: 'POST', body: { items: [{ variant_id: v.id, qty: 1 }], customer: { name: 'A', email: 'no' }, shipping: { method: 'andreani_domicilio' } } });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.errors.email);

  const co = await json('/api/checkout', { method: 'POST', body: {
    items: [{ variant_id: v.id, qty: 1 }], customer: { name: 'Ana Prueba', email: 'ana@prueba.com', phone: '11 5555 6666', dni: '30111222' },
    shipping: { method: 'andreani_domicilio', cp: '1425', calle: 'Honduras', numero: '4800', localidad: 'CABA', provincia: 'CABA' } } });
  assert.equal(co.status, 200, JSON.stringify(co.data));
  assert.match(co.data.payUrl, /pago-simulado/);

  await json('/api/dev/mock-payment', { method: 'POST', body: { token: co.data.token, approve: true } });
  const o = await json('/api/orders/' + co.data.token);
  assert.equal(o.data.status, 'paid');
  const after = (await json('/api/catalog')).data.products.find((x) => x.id === p.id).variants.find((x) => x.id === v.id);
  assert.equal(after.stock, v.stock - 1);

  // Un segundo aviso del mismo pago no descuenta stock dos veces.
  await json('/api/dev/mock-payment', { method: 'POST', body: { token: co.data.token, approve: true } });
  const again = (await json('/api/catalog')).data.products.find((x) => x.id === p.id).variants.find((x) => x.id === v.id);
  assert.equal(again.stock, v.stock - 1);
});

test('no deja comprar más que el stock', async () => {
  const cat = (await json('/api/catalog')).data;
  const v = cat.products.flatMap((p) => p.variants).find((x) => x.stock === 1);
  const r = await json('/api/shipping/quote', { method: 'POST', body: { cp: '1425', items: [{ variant_id: v.id, qty: 3 }] } });
  assert.equal(r.status, 409);
});

test('panel: entra, crea el envío y baja la etiqueta', async () => {
  const login = await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@samadhi.local', password: 'clave-de-prueba-123' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const H = { cookie, 'x-samadhi-admin': '1' };
  const list = await json('/api/admin/orders?status=paid', { headers: H });
  const id = list.data.rows[0].id;
  const ship = await json(`/api/admin/orders/${id}/shipment`, { method: 'POST', headers: H });
  assert.equal(ship.status, 200, JSON.stringify(ship.data));
  assert.match(ship.data.andreani_number, /^MOCK/);
  const label = await fetch(`${B}/api/admin/orders/${id}/label`, { headers: { cookie } });
  assert.equal(label.headers.get('content-type'), 'application/pdf');
  assert.equal((await label.arrayBuffer()).byteLength > 300, true);
  const noCsrf = await json(`/api/admin/orders/${id}/status`, { method: 'POST', headers: { cookie }, body: { status: 'shipped' } });
  assert.equal(noCsrf.status, 403);
  const st = await json(`/api/admin/orders/${id}/status`, { method: 'POST', headers: H, body: { status: 'shipped' } });
  assert.equal(st.data.status, 'shipped');
  const anon = await json('/api/admin/orders');
  assert.equal(anon.status, 401);
});

test('cupones', async () => {
  const login = await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@samadhi.local', password: 'clave-de-prueba-123' }) });
  const H = { cookie: login.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' };
  assert.equal((await json('/api/admin/coupons', { method: 'POST', headers: H, body: { code: 'bienvenida10', kind: 'percent', value: 10, active: true } })).status, 200);
  const cat = (await json('/api/catalog')).data;
  const v = cat.products.flatMap((p) => p.variants.map((x) => ({ ...x, p }))).find((x) => x.stock > 0);
  const c = await json('/api/coupons/check', { method: 'POST', body: { code: 'BIENVENIDA10', items: [{ variant_id: v.id, qty: 1 }] } });
  assert.equal(c.data.discount, Math.round((v.promo ?? v.price) * 0.1));
});

test('firma de Mercado Pago', async () => {
  const { verifySignature } = await import('../server/integrations/mercadopago.js');
  const secret = 'secreto';
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = crypto.createHmac('sha256', secret).update(`id:123456;request-id:abc-1;ts:${ts};`).digest('hex');
  assert.equal(verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'abc-1', dataId: '123456', secret }).ok, true);
  assert.equal(verifySignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'abc-2', dataId: '123456', secret }).ok, false);
  const r = await fetch(B + '/api/webhooks/mercadopago?data.id=1&type=payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 200); // sin clave configurada se acepta y se ignora en modo prueba
});

test('transferencia: aplica el descuento y muestra los datos', async () => {
  const cat = (await json('/api/catalog')).data;
  assert.equal(cat.payments.installments, 3);
  assert.equal(cat.payments.transfer.discount, 10);
  const v = cat.products.flatMap((p) => p.variants).find((x) => x.stock > 0);
  const price = v.promo ?? v.price;
  const co = await json('/api/checkout', { method: 'POST', body: {
    items: [{ variant_id: v.id, qty: 1 }], payment: 'transferencia', customer: { name: 'Lu Prueba', email: 'lu@prueba.com', phone: '2215046554', dni: '30111223' },
    shipping: { method: 'retiro' } } });
  assert.equal(co.status, 200, JSON.stringify(co.data));
  assert.equal(co.data.transfer, true);
  const o = (await json('/api/orders/' + co.data.token)).data;
  assert.equal(o.total, price - Math.round(price * 0.1));
  assert.ok(o.transfer);
  assert.equal(o.paymentMethod, 'transferencia');
});

test('roles: el gerente no entra a configuración ni a usuarios', async () => {
  await node(['scripts/demo-users.js']);
  const login = async (email, password) => fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const r = await login('gerente@samadhistyle.com.ar', 'SamadhiGerente2026');
  const d = await r.json();
  assert.equal(d.type, 'staff');
  assert.equal(d.role, 'manager');
  const H = { cookie: r.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' };
  assert.equal((await json('/api/admin/orders', { headers: H })).status, 200);
  assert.equal((await json('/api/admin/products', { headers: H })).status, 200);
  assert.equal((await json('/api/admin/settings', { headers: H })).status, 403);
  assert.equal((await json('/api/admin/users', { headers: H })).status, 403);
  const a = await login('admin@samadhistyle.com.ar', 'SamadhiAdmin2026');
  const HA = { cookie: a.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' };
  const u = await json('/api/admin/users', { headers: HA });
  assert.equal(u.status, 200);
  assert.ok(u.data.users.some((x) => x.role === 'manager'));
});

test('cuentas de cliente: registro, ingreso y mis pedidos', async () => {
  const reg = await json('/api/auth/register', { method: 'POST', body: { name: 'Sofía Cuenta', email: 'sofia@prueba.com', password: 'una-clave-larga' } });
  assert.equal(reg.status, 200);
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const cat = (await json('/api/catalog')).data;
  const v = cat.products.flatMap((p) => p.variants).find((x) => x.stock > 0);
  const co = await json('/api/checkout', { method: 'POST', headers: { cookie }, body: { items: [{ variant_id: v.id, qty: 1 }], customer: { name: 'Sofía Cuenta', email: 'sofia@prueba.com', phone: '1155556666', dni: '30999888' }, shipping: { method: 'retiro' } } });
  assert.equal(co.status, 200, JSON.stringify(co.data));
  const mine = await json('/api/account/orders', { headers: { cookie } });
  assert.equal(mine.data.orders.length, 1);
  assert.equal((await json('/api/account/orders')).status, 401);
  const s = await json('/api/auth/session', { headers: { cookie } });
  assert.equal(s.data.customer.email, 'sofia@prueba.com');
  const cl = await json('/api/auth/login', { method: 'POST', body: { email: 'cliente@samadhistyle.com.ar', password: 'SamadhiCliente2026' } });
  assert.equal(cl.data.type, 'customer');
});

test('emails: confirmaciones, carrito esperándote y olvidé mi contraseña', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const dbx = new DatabaseSync(path.join(dir, 'samadhi.db'));
  const log = () => dbx.prepare('SELECT template, to_email, status FROM email_log ORDER BY id').all();
  const cat = (await json('/api/catalog')).data;
  const avail = cat.products.flatMap((p) => p.variants).filter((x) => x.stock > 0);
  const v = avail[avail.length - 1], w = avail[avail.length - 2];

  // Pedido con Mercado Pago → "Pedido recibido"; pago aprobado → "Pago acreditado".
  const co = await json('/api/checkout', { method: 'POST', body: { items: [{ variant_id: v.id, qty: 1 }], customer: { name: 'Mail Prueba', email: 'mail@prueba.com', phone: '1155556666', dni: '30111444' }, shipping: { method: 'retiro' } } });
  await json('/api/dev/mock-payment', { method: 'POST', body: { token: co.data.token, approve: true } });
  const l1 = log().filter((x) => x.to_email === 'mail@prueba.com').map((x) => x.template);
  assert.deepEqual(l1, ['order_received', 'payment_approved']);
  assert.match(log()[0].status, /falta SMTP/);

  // Carrito guardado hace 3 horas → recordatorio.
  const saved = await json('/api/cart', { method: 'POST', body: { email: 'carrito@prueba.com', name: 'Caro', items: [{ variant_id: w.id, qty: 1 }] } });
  assert.equal(saved.data.saved, true);
  dbx.exec("UPDATE carts SET updated_at = datetime('now','-3 hours'), created_at = datetime('now','-3 hours') WHERE email = 'carrito@prueba.com'");
  const a = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@samadhistyle.com.ar', password: 'SamadhiAdmin2026' }) });
  const H = { cookie: a.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' };
  const run1 = await json('/api/admin/emails/run', { method: 'POST', headers: H });
  assert.equal(run1.data.carts, 1);
  assert.ok(log().some((x) => x.template === 'cart_reminder_1' && x.to_email === 'carrito@prueba.com'));
  const token = dbx.prepare("SELECT token FROM carts WHERE email = 'carrito@prueba.com'").get().token;
  assert.equal((await json('/api/cart/' + token)).data.items[0].variant_id, w.id);

  // Panel: lista de emails y vista previa.
  const em = await json('/api/admin/emails', { headers: H });
  assert.ok(em.data.templates.length >= 19);
  const pv = await json('/api/admin/emails/preview/cart_reminder_1', { headers: H });
  assert.match(pv.data.html, /carrito esperándote/);

  // Olvidé mi contraseña → email con link → nueva contraseña.
  await json('/api/auth/forgot', { method: 'POST', body: { email: 'cliente@samadhistyle.com.ar' } });
  const reset = dbx.prepare("SELECT token FROM password_resets ORDER BY rowid DESC LIMIT 1").get().token;
  assert.equal((await json('/api/auth/reset', { method: 'POST', body: { token: reset, password: 'otra-clave-nueva' } })).status, 200);
  assert.equal((await json('/api/auth/login', { method: 'POST', body: { email: 'cliente@samadhistyle.com.ar', password: 'otra-clave-nueva' } })).data.type, 'customer');
  dbx.close();
});

test('Lince: el agente del local actualiza el stock y respeta las ventas web sin cargar', async () => {
  const login = await json('/api/admin/login', { method: 'POST', body: { email: 'test@samadhi.local', password: 'clave-de-prueba-123' } });
  const H = { cookie: login.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' };
  const A = { 'x-sync-secret': env.LINCE_SYNC_SECRET };
  assert.equal((await json('/api/integrations/lince/stock', { method: 'POST', body: { stock: [] } })).status, 401);
  assert.equal((await json('/api/admin/lince', { headers: H })).data.mode, 'agente');

  const { data: cat } = await json('/api/catalog');
  const p = cat.products.find((x) => x.ref && x.variants.some((v) => v.color && v.size && v.stock > 0));
  const v = p.variants.find((x) => x.color && x.size && x.stock > 0);
  const stockOf = async () => (await json('/api/catalog')).data.products.find((x) => x.id === p.id).variants.find((x) => x.id === v.id).stock;
  // Lince escribe distinto (minúsculas, sin acentos): igual tiene que cruzar.
  const row = { Articulo: p.ref.toLowerCase(), Color: v.color.toUpperCase(), Talle: ' ' + v.size, Disponible: 7, Precio: 1 };
  const r1 = await json('/api/integrations/lince/stock', { method: 'POST', headers: A, body: { stock: [row, { Articulo: 'NOEXISTE', Color: 'X', Talle: 'U', Disponible: 3 }] } });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.notFound, 1);
  assert.equal(await stockOf(), 7);

  // Venta web pagada: hasta que se cargue en Lince, se descuenta de lo que diga Lince.
  const co = await json('/api/checkout', { method: 'POST', body: { items: [{ variant_id: v.id, qty: 1 }], customer: { name: 'Lince Prueba', email: 'lince@prueba.com', phone: '1155556666', dni: '30111555' }, shipping: { method: 'retiro' } } });
  await json('/api/dev/mock-payment', { method: 'POST', body: { token: co.data.token, approve: true } });
  await json('/api/integrations/lince/stock', { method: 'POST', headers: A, body: { stock: [row] } });
  assert.equal(await stockOf(), 6);
  const st = await json('/api/admin/lince', { headers: H });
  const pend = st.data.pendingOrders.find((o) => o.email === 'lince@prueba.com');
  assert.ok(pend && pend.items[0].ref_code === p.ref);
  await json(`/api/admin/lince/orders/${pend.id}/loaded`, { method: 'POST', headers: H });
  await json('/api/integrations/lince/stock', { method: 'POST', headers: A, body: { stock: [row] } });
  assert.equal(await stockOf(), 7);
  // El precio no se toca salvo que se active la opción.
  assert.notEqual((await json('/api/catalog')).data.products.find((x) => x.id === p.id).variants.find((x) => x.id === v.id).price, 1);
  // En modo agente, el botón del panel explica que lo hace la PC del local.
  assert.equal((await json('/api/admin/lince/sync', { method: 'POST', headers: H })).status, 400);
});

test('estadísticas por rango de fechas', async () => {
  const login = await json('/api/admin/login', { method: 'POST', body: { email: 'test@samadhi.local', password: 'clave-de-prueba-123' } });
  const H = { cookie: login.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' };
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const r = await json(`/api/admin/stats?from=${today}&to=${today}`, { headers: H });
  assert.equal(r.status, 200);
  assert.equal(r.data.range.days, 1);
  assert.ok(r.data.kpis.orders >= 1 && r.data.kpis.revenue > 0, 'cuenta los pedidos pagados de hoy');
  assert.equal(r.data.series.length, 1);
  assert.ok(r.data.topProducts.length >= 1);
  const old = await json('/api/admin/stats?from=2020-01-01&to=2020-01-31', { headers: H });
  assert.equal(old.data.kpis.orders, 0);
  assert.equal(old.data.range.unit, 'day');
});

test('seguir mi pedido, botón de arrepentimiento y contenido', async () => {
  const { data: cat } = await json('/api/catalog');
  assert.ok(cat.content.faq.length >= 5 && cat.content.terms.includes('Términos') && cat.content.returns.includes('arrepentimiento'));
  const v = cat.products.flatMap((p) => p.variants).find((x) => x.stock === null || x.stock > 2);
  const co = await json('/api/checkout', { method: 'POST', body: { items: [{ variant_id: v.id, qty: 1 }], customer: { name: 'Seguimiento Prueba', email: 'track@prueba.com', phone: '1155556666', dni: '30111666' }, shipping: { method: 'retiro' } } });
  await json('/api/dev/mock-payment', { method: 'POST', body: { token: co.data.token, approve: true } });
  const bad = await json('/api/track', { method: 'POST', body: { number: co.data.number, email: 'otra@prueba.com' } });
  assert.equal(bad.status, 404);
  const t = await json('/api/track', { method: 'POST', body: { number: co.data.number.toLowerCase(), email: 'TRACK@prueba.com' } });
  assert.equal(t.status, 200);
  assert.equal(t.data.steps.length, 5);
  assert.ok(t.data.steps[1].done && t.data.steps[1].current && !t.data.steps[2].done);
  assert.equal(t.data.steps[3].key, 'ready_pickup');
  const w = await json('/api/arrepentimiento', { method: 'POST', body: { number: co.data.number, email: 'track@prueba.com', reason: 'No me convenció' } });
  assert.match(w.data.code, /^ARR-[A-Z0-9]{6}$/);
  const w2 = await json('/api/arrepentimiento', { method: 'POST', body: { number: co.data.number, email: 'track@prueba.com' } });
  assert.equal(w2.data.code, w.data.code);
  assert.equal(w2.data.existing, true);
  const login = await json('/api/admin/login', { method: 'POST', body: { email: 'test@samadhi.local', password: 'clave-de-prueba-123' } });
  const H = { cookie: login.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' };
  assert.ok((await json('/api/admin/withdrawals', { headers: H })).data.some((x) => x.code === w.data.code));
  await json('/api/admin/content', { method: 'PUT', headers: H, body: { faq: [{ q: '¿Hacen envíos?', a: 'Sí.' }] } });
  assert.equal((await json('/api/catalog')).data.content.faq.length, 1);
  const rv = await json('/api/reviews');
  assert.equal(rv.data.connected, false);
});

test('probador: motor propio con prendas preparadas y FASHN en modo prueba', async () => {
  const { data: cat } = await json('/api/catalog');
  assert.equal(cat.tryon.enabled, true);
  assert.equal(cat.tryon.engine, 'samadhi');
  const ids = Object.keys(cat.tryon.garments);
  assert.ok(ids.length >= 50, 'vienen prendas preparadas con el catálogo');
  const g = cat.tryon.garments[ids[0]];
  assert.ok(['top', 'bottom', 'full'].includes(g.kind) && g.pts.length >= 4 && g.url.startsWith('/probador/'));
  assert.equal((await fetch(B + g.url)).status, 200);
  assert.equal((await fetch(B + '/vendor/mediapipe-pose/pose.js')).status, 200);
  // Pide cuenta: sin sesión no se puede probar.
  assert.equal(cat.tryon.requireLogin, true);
  const anon = await json('/api/tryon/log', { method: 'POST', body: { productId: Number(ids[0]) } });
  assert.equal(anon.status, 401); assert.equal(anon.data.code, 'login');
  const reg = await json('/api/auth/register', { method: 'POST', body: { name: 'Paula Probador', email: 'paula.probador@prueba.com', password: 'una-clave-larga' } });
  const ck = { cookie: reg.headers.get('set-cookie').split(';')[0] };
  const lg = await json('/api/tryon/log', { method: 'POST', headers: ck, body: { productId: Number(ids[0]) } });
  assert.ok(lg.data.log);
  const p = cat.products.find((x) => x.images.length);
  assert.equal((await json('/api/tryon', { method: 'POST', headers: ck, body: { productId: p.id, photo: 'no-es-una-foto' } })).status, 422);
  const photo = 'data:image/jpeg;base64,' + Buffer.alloc(300 * 1024, 7).toString('base64'); // pesa más de 200 kB: prueba el límite propio de esta ruta
  // Gemini viene elegido pero sin clave: el servidor avisa para que la tienda use el motor propio.
  const nok = await json('/api/tryon', { method: 'POST', headers: ck, body: { productId: p.id, image: 0, photo } });
  assert.equal(nok.status, 503);
  assert.equal(nok.data.code, 'sin-clave');
  { const l = await json('/api/admin/login', { method: 'POST', body: { email: 'test@samadhi.local', password: 'clave-de-prueba-123' } });
    await json('/api/admin/tryon', { method: 'PUT', headers: { cookie: l.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' }, body: { engine: 'fashn', enabled: true } }); }
  const st = await json('/api/tryon', { method: 'POST', headers: ck, body: { productId: p.id, image: 0, photo } });
  assert.equal(st.status, 200);
  assert.ok(st.data.id && st.data.mock);
  assert.equal((await json('/api/tryon/' + st.data.id)).data.status, 'processing');
  await new Promise((r) => setTimeout(r, 2600));
  const done = await json('/api/tryon/' + st.data.id);
  assert.equal(done.data.status, 'completed');
  await json('/api/tryon/added', { method: 'POST', body: { log: done.data.log } });
  const login = await json('/api/admin/login', { method: 'POST', body: { email: 'test@samadhi.local', password: 'clave-de-prueba-123' } });
  { const pe = await json('/api/admin/tryon/people', { headers: { cookie: login.headers.get('set-cookie').split(';')[0] } });
    const who = pe.data.people.find((x) => x.email === 'paula.probador@prueba.com');
    assert.ok(who && who.tries >= 2 && who.products.length >= 1, 'el panel muestra quién se probó qué'); }
  const H = { cookie: login.headers.get('set-cookie').split(';')[0], 'x-samadhi-admin': '1' };
  const a = await json('/api/admin/tryon', { headers: H });
  assert.equal(a.data.stats.month, 2);
  assert.equal(a.data.settings.engine, 'fashn');
  assert.equal(a.data.stats.added, 1);
  assert.ok(a.data.garmentsOn >= 50);
  const gl = await json('/api/admin/tryon/garments', { headers: H });
  const row = gl.data.find((r) => r.url);
  await json('/api/admin/tryon', { method: 'PUT', headers: H, body: { engine: 'samadhi', enabled: true } });
  await json('/api/admin/tryon/garments/' + row.id, { method: 'PUT', headers: H, body: { status: 'oculta' } });
  assert.ok(!(await json('/api/catalog')).data.tryon.garments[row.id]);
  const tiny = 'data:image/webp;base64,' + Buffer.from('RIFF0000WEBP').toString('base64');
  const sv = await json('/api/admin/tryon/garments/' + row.id, { method: 'POST', headers: H, body: { data: tiny, kind: 'top', pts: [{ name: 'shL', x: 1, y: 1 }, { name: 'shR', x: 2, y: 1 }, { name: 'hipL', x: 1, y: 3 }, { name: 'hipR', x: 2, y: 3 }], size: [10, 20], quality: 0.8 } });
  assert.match(sv.data.url, /^\/uploads\/probador\//);
  assert.equal((await fetch(B + sv.data.url)).status, 200);
  await json('/api/admin/tryon', { method: 'PUT', headers: H, body: { engine: 'gemini', enabled: true } });
});

test('Gemini: arma el pedido con las dos fotos y la indicación', async () => {
  const { buildPrompt, closestRatio, geminiTryOn } = await import('../server/integrations/gemini.js');
  assert.equal(closestRatio(720, 1280), '9:16');
  assert.equal(closestRatio(1000, 1500), '2:3');
  assert.match(buildPrompt({ kind: 'top', name: 'Blazer' }), /upper-body garment.*Blazer.*instead of her current top/s);
  assert.match(buildPrompt({ kind: 'full', name: 'Vestido Juana' }), /complete outfit change.*ONLY the dress.*bare legs/s);
  await assert.rejects(geminiTryOn({ apiKey: '', person: 'data:image/jpeg;base64,AA==', garment: { mimeType: 'image/png', data: 'AA==' }, kind: 'top' }), (e) => e.code === 'sin-clave');
  // Respuesta simulada del servicio: devuelve la imagen generada.
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { const body = JSON.parse(opts.body); assert.equal(body.contents[0].parts.length, 3); assert.ok(String(url).includes(':generateContent'));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBOR' } }] } }] }), { status: 200 }); };
  try { const r = await geminiTryOn({ apiKey: 'k', person: 'data:image/jpeg;base64,AA==', personSize: [600, 900], garment: { mimeType: 'image/png', data: 'AA==' }, kind: 'full' }); assert.equal(r.image, 'data:image/png;base64,iVBOR'); }
  finally { globalThis.fetch = real; }
});
