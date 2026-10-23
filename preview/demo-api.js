// Servidor de prueba para la vista previa: responde las mismas rutas que server/ pero en el navegador,
// con el catálogo real y pedidos de ejemplo. Los cambios se guardan solo en este navegador.
const KEY = 'samadhi-demo-v10';
const SEED = window.SAMADHI_EMBED;
const DEMO_USERS = window.__SAMADHI_DEMO_USERS;

const STATUS = { pending_payment: 'Esperando pago', paid: 'Pagado', preparing: 'En preparación', ready_pickup: 'Listo para retirar', shipped: 'Despachado', delivered: 'Entregado', cancelled: 'Cancelado', refunded: 'Devuelto' };
const METHOD = { andreani_domicilio: 'Andreani a domicilio', andreani_sucursal: 'Andreani a sucursal', retiro: 'Retiro en el local' };
const PAY = { approved: 'Aprobado', pending: 'Pendiente', rejected: 'Rechazado', refunded: 'Devuelto' };
const ROLES = { admin: 'Administrador', manager: 'Gerente de tienda' };
const PAID = ['paid', 'preparing', 'ready_pickup', 'shipped', 'delivered'];

class ApiError extends Error { constructor(status, message, data) { super(message); this.status = status; this.data = { error: message, ...(data || {}) }; } }
const fail = (status, msg, data) => { throw new ApiError(status, msg, data); };
const sqlDate = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
const fmt = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-AR');
const digits = (s) => String(s || '').replace(/\D/g, '');
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''));
const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const token = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const slugify = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

// ── Estado inicial ─────────────────────────────────────
function seedState() {
  const st = {
    v: 10,
    products: SEED.products.map((p, i) => ({
      id: p.id, slug: p.slug, name: p.name, ref_code: p.ref || '', description: p.desc || '', collection: p.collection || '',
      visible: 1, featured: p.featured ? 1 : 0, free_shipping: p.freeShipping ? 1 : 0, position: i, weight_kg: 0.5, height_cm: 5, width_cm: 30, depth_cm: 30,
      seo_title: '', seo_description: '', images: [...p.images], categories: [...p.categories],
      variants: p.variants.map((v) => ({ id: v.id, color: v.color, size: v.size, other: v.other || '', price: v.price, promo_price: v.promo, stock: v.stock, sku: '', barcode: '' })),
    })),
    categories: SEED.categories.map((c, i) => ({ id: c.id, name: c.name, slug: c.slug, collection: c.collection || '', position: c.position ?? i, visible: 1 })),
    banners: SEED.banners.map((b, i) => ({ ...b, position: i, active: 1 })),
    settings: {
      store: { name: 'Samadhi Style', tagline: 'Lo auténtico también se viste.', email: '', phone: '', whatsapp: SEED.store.whatsapp || '', instagram: SEED.store.instagram || '', address: '', announcement: SEED.store.announcement || '', spaUrl: SEED.store.spaUrl || 'https://casa-samadhi.vercel.app' },
      shipping: { pickupEnabled: true, pickupAddress: 'La Plata (dirección de ejemplo)', pickupHours: 'Lunes a sábado de 10 a 19', freeShippingFrom: 0, andreaniDomicilio: true, andreaniSucursal: true, extraHandling: 0,
        origin: { calle: '', numero: '', codigoPostal: '', localidad: '', region: 'AR-B', pais: 'Argentina' }, sender: { nombreCompleto: 'Samadhi Style', email: '', documentoTipo: 'CUIT', documentoNumero: '', telefono: '' } },
      payments: { installments: 3, transferEnabled: true, transferDiscount: 10, bankHolder: 'Samadhi Style (ejemplo)', bankName: 'Banco de ejemplo', bankCbu: '0000003100000000000001', bankAlias: 'SAMADHI.STYLE.EJEMPLO', transferHours: 48 },
      checkout: { requireDni: true, orderPrefix: 'S', nextOrderNumber: 1001 },
      tryon: { enabled: true, engine: 'gemini', dailyLimit: 300, perHour: 12, mode: 'balanced', hiddenCategories: null, requireLogin: true },
      content: { ...window.__CONTENT.CONTENT_DEFAULTS, faq: window.__CONTENT.CONTENT_DEFAULTS.faq.map((x) => ({ ...x })) },
      emails: { enabled: Object.fromEntries(Object.keys(window.__EMAIL.TEMPLATES).map((k) => [k, true])), paymentReminderHours: 24, transferReminderHoursBefore: 12, pickupReminderDays: 3, cartReminder1Hours: 1, cartReminder2Hours: 48, staffEmails: 'admin@samadhistyle.com.ar' },
    },
    staff: DEMO_USERS.filter((u) => u.kind === 'staff').map((u, i) => ({ id: i + 1, email: u.email, name: u.name, role: u.role, password: u.password, created_at: sqlDate() })),
    customers: [], orders: [], coupons: [
      { id: 1, code: 'BIENVENIDA10', kind: 'percent', value: 10, min_subtotal: 0, max_uses: null, uses: 3, starts_at: null, ends_at: null, active: 1 },
      { id: 2, code: 'ENVIOGRATIS', kind: 'free_shipping', value: 0, min_subtotal: 150000, max_uses: 50, uses: 7, starts_at: null, ends_at: null, active: 1 },
    ],
    webhooks: [], carts: [], emails: [], resets: [], withdrawals: [], tryons: [],
    garments: Object.fromEntries(Object.entries(SEED.tryon?.garments || {}).map(([id, g]) => [id, { ...g, status: 'aprobada', source: 'catálogo' }])), lince: { settings: { autoMinutes: 15, updatePrices: false }, since: null, syncs: [] },
    ids: { order: 0, customer: 0, coupon: 2, banner: 100, category: 1000, product: 100000, variant: 1000000, staff: 10, event: 0, cart: 0, email: 0 },
    session: { staff: null, customer: null },
  };
  const cu = DEMO_USERS.find((u) => u.kind === 'customer');
  addCustomer(st, { email: cu.email, name: cu.name, phone: cu.phone, dni: cu.dni, password: cu.password });
  seedHistory(st);
  seedOrders(st);
  seedCarts(st);
  { // Uso del probador en los últimos 30 días (para la sección del panel).
    const r = rnd(77), pool = st.products.filter((p) => p.visible && p.images.length && !/acces|bolso|cintur/i.test(p.name));
    for (let i = 0; i < 140; i++) {
      const p = pool[Math.floor(r() ** 2 * pool.length)];
      const cu = st.customers.length && r() < 0.8 ? st.customers[Math.floor(r() * Math.min(18, st.customers.length))] : null;
      st.tryons.push({ id: i + 1, at: sqlDate(new Date(Date.now() - r() * 30 * 864e5)), product_id: p.id, status: r() < 0.06 ? 'error' : 'lista', ms: 6500 + Math.round(r() * 4000), added: r() < 0.27 ? 1 : 0, customer_id: cu?.id || null });
    }
  }
  { // Un arrepentimiento de ejemplo, para ver la sección en el panel.
    const o = st.orders.filter((x) => x.status === 'delivered' && x.email.endsWith('@ejemplo.com')).at(-1);
    if (o) st.withdrawals.push({ id: 1, code: 'ARR-K7Q2MX', order_id: o.id, order_number: o.number, name: o.name, email: o.email, reason: 'El talle me quedó grande.', status: 'nuevo', created_at: sqlDate(new Date(Date.now() - 5 * 3600e3)) });
  }
  st.lince.since = sqlDate(new Date(Date.now() - 3 * 864e5));
  linceApply(st, linceMock(st), 'automática (prueba)', sqlDate(new Date(Date.now() - 40 * 60e3)));
  return st;
}

function addCustomer(st, c) {
  const id = ++st.ids.customer;
  st.customers.push({ id, email: c.email, name: c.name, phone: c.phone || '', dni: c.dni || '', notes: '', password: c.password || null, created_at: c.created_at || sqlDate() });
  return id;
}

// Historial de un año (pedidos ya entregados) para que Estadísticas tenga algo que mostrar.
function seedHistory(st) {
  const r = rnd(4242);
  const first = ['Lucía', 'Martina', 'Carolina', 'Valentina', 'Florencia', 'Agustina', 'Camila', 'Julieta', 'Paula', 'Sofía', 'Mercedes', 'Inés', 'Rocío', 'Belén', 'Micaela', 'Natalia', 'Romina', 'Daniela', 'Victoria', 'Lara', 'Antonella', 'Josefina', 'Milagros', 'Pilar'];
  const last = ['Fernández', 'Gómez', 'Ruiz', 'Sosa', 'Díaz', 'Pérez', 'Romero', 'Álvarez', 'Medina', 'Herrera', 'Castro', 'Aguirre', 'López', 'Benítez', 'Molina', 'Torres', 'Ortiz', 'Silva'];
  const provs = [['La Plata', 'Buenos Aires', 7], ['CABA', 'CABA', 4], ['Mar del Plata', 'Buenos Aires', 2], ['Córdoba', 'Córdoba', 2], ['Rosario', 'Santa Fe', 2], ['Mendoza', 'Mendoza', 1], ['Neuquén', 'Neuquén', 1], ['Tucumán', 'Tucumán', 1]];
  const provPick = () => { let t = r() * provs.reduce((a, x) => a + x[2], 0); for (const p of provs) if ((t -= p[2]) < 0) return p; return provs[0]; };
  const pool = st.products.filter((p) => p.images.length);
  const people = Array.from({ length: 140 }, (_, i) => { const n = `${first[i % first.length]} ${last[Math.floor(r() * last.length)]}`; return { name: n, email: `${slugify(n).replace('-', '.')}${i}@ejemplo.com` }; });
  const now = Date.now();
  for (let day = 400; day >= 2; day--) {
    const at = new Date(now - day * 864e5);
    const m = at.getUTCMonth(), wd = at.getUTCDay();
    // Más ventas en diciembre, en octubre (Día de la Madre) y en mayo; fines de semana un poco más.
    const season = m === 11 ? 2.1 : m === 9 ? 1.7 : m === 4 ? 1.4 : m === 0 || m === 1 ? 0.7 : 1;
    const growth = 0.75 + 0.5 * (1 - day / 400);
    const lambda = 1.15 * season * growth * (wd === 0 || wd === 6 ? 1.25 : 1);
    let n = 0; for (let L = Math.exp(-lambda), p = 1; (p *= r()) > L; ) n++;
    for (let k = 0; k < n; k++) {
      const who = people[Math.floor(r() ** 1.6 * people.length)]; // algunas compran varias veces
      let cust = st.customers.find((c) => c.email === who.email);
      const cid = cust ? cust.id : addCustomer(st, { email: who.email, name: who.name, phone: '221' + String(4000000 + Math.floor(r() * 999999)), dni: String(25000000 + Math.floor(r() * 15000000)), created_at: sqlDate(at) });
      const items = [];
      for (let q = 1 + (r() < 0.35 ? 1 : 0) + (r() < 0.1 ? 1 : 0); q > 0; q--) {
        const p = pool[Math.floor(r() ** 1.3 * pool.length)], v = p.variants[Math.floor(r() * p.variants.length)];
        items.push({ id: items.length + 1, product_id: p.id, variant_id: v.id, name: p.name, variant_label: [v.color, v.size && `Talle ${v.size}`].filter(Boolean).join(' · '), sku: '', image: p.images[0] || '', unit_price: v.promo_price ?? v.price, qty: 1 });
      }
      const transfer = r() < 0.3, retiro = r() < 0.22, [loc, prov] = retiro ? ['La Plata', 'Buenos Aires'] : provPick();
      const method = retiro ? 'retiro' : r() < 0.7 ? 'andreani_domicilio' : 'andreani_sucursal';
      const subtotal = items.reduce((a, x) => a + x.unit_price, 0);
      const coupon = !transfer && r() < 0.08 ? 'BIENVENIDA10' : '';
      const discount = transfer ? Math.round(subtotal * 0.1) : coupon ? Math.round(subtotal * 0.1) : 0;
      const ship = retiro ? 0 : subtotal >= 150000 && r() < 0.5 ? 0 : [6200, 7400, 9800][Math.floor(r() * 3)];
      const created = new Date(at.getTime() + (10 + r() * 12) * 3600e3 - 3 * 3600e3);
      const fate = r();
      const status = fate < 0.06 ? 'cancelled' : fate < 0.08 ? 'refunded' : 'delivered';
      const paid = status !== 'cancelled';
      const s2 = st.settings.checkout;
      st.orders.push({
        id: ++st.ids.order, number: `${s2.orderPrefix}-${s2.nextOrderNumber++}`, token: token(), customer_id: cid, email: who.email, name: who.name, phone: '', dni: '',
        status, payment_status: paid ? 'approved' : 'pending', payment_id: '', payment_method: paid ? (transfer ? 'transferencia' : ['visa', 'master', 'account_money', 'debvisa'][Math.floor(r() * 4)]) : '', mp_preference_id: '',
        subtotal, discount, shipping_cost: ship, total: subtotal - discount + ship, coupon_code: coupon, shipping_method: method,
        shipping_address: { cp: '', calle: '', numero: '', piso: '', depto: '', localidad: loc, provincia: prov, referencia: '' }, shipping_branch: '', andreani_number: '', tracking_status: '', tracking_events: [],
        customer_note: '', internal_note: '', stock_applied: 0, lince_at: sqlDate(created), created_at: sqlDate(created), paid_at: paid ? sqlDate(new Date(created.getTime() + 20 * 60e3)) : null, shipped_at: null,
        items, events: [{ id: ++st.ids.event, kind: 'created', message: 'Pedido de ejemplo (historial)', at: sqlDate(created) }],
      });
    }
  }
}

// Pedidos de ejemplo de los últimos 30 días (marcados con email @ejemplo.com).
function seedOrders(st) {
  const r = rnd(20261021);
  const names = ['Lucía Fernández', 'Martina Gómez', 'Carolina Ruiz', 'Valentina Sosa', 'Florencia Díaz', 'Agustina Pérez', 'Camila Romero', 'Julieta Álvarez', 'Paula Medina', 'Sofía Herrera', 'Mercedes Castro', 'Inés Aguirre'];
  const cps = [['1900', 'La Plata', 'Buenos Aires'], ['1425', 'CABA', 'CABA'], ['1636', 'Olivos', 'Buenos Aires'], ['5000', 'Córdoba', 'Córdoba'], ['2000', 'Rosario', 'Santa Fe'], ['7600', 'Mar del Plata', 'Buenos Aires']];
  const pool = st.products.filter((p) => p.variants.some((v) => v.stock === null || v.stock > 0) && p.images.length);
  const plan = [
    ['delivered', 28], ['delivered', 25], ['delivered', 21], ['shipped', 17], ['delivered', 14], ['shipped', 9], ['delivered', 8], ['shipped', 5],
    ['preparing', 3], ['paid', 2], ['paid', 1], ['pending_payment', 0.3], ['cancelled', 6], ['ready_pickup', 1.5], ['paid', 0.1],
  ];
  const cliente = st.customers[0];
  plan.forEach(([status, daysAgo], i) => {
    const mine = i === 3 || i === 13; // dos pedidos de la clienta de prueba
    const name = mine ? cliente.name : names[i % names.length];
    const email = mine ? cliente.email : `${slugify(name).replace('-', '.')}@ejemplo.com`;
    let customer = st.customers.find((c) => c.email === email);
    const cid = customer ? customer.id : addCustomer(st, { email, name, phone: '221' + String(4000000 + Math.floor(r() * 999999)), dni: String(25000000 + Math.floor(r() * 15000000)), created_at: sqlDate(new Date(Date.now() - (daysAgo + 2) * 864e5)) });
    const n = 1 + Math.floor(r() * 2.4);
    const items = [];
    for (let k = 0; k < n; k++) {
      const p = pool[Math.floor(r() * pool.length)];
      const v = p.variants.find((x) => x.stock === null || x.stock > 0) || p.variants[0];
      items.push({ product_id: p.id, variant_id: v.id, name: p.name, variant_label: [v.color, v.size && `Talle ${v.size}`, v.other].filter(Boolean).join(' · '), sku: v.sku, image: p.images[0] || '', unit_price: v.promo_price ?? v.price, qty: 1 });
    }
    const method = status === 'ready_pickup' ? 'retiro' : ['andreani_domicilio', 'andreani_domicilio', 'andreani_sucursal'][Math.floor(r() * 3)];
    const [cp, loc, prov] = mine ? cps[0] : cps[Math.floor(r() * cps.length)];
    const transfer = i % 4 === 1;
    const subtotal = items.reduce((a, x) => a + x.unit_price * x.qty, 0);
    const discount = transfer ? Math.round(subtotal * 0.1) : 0;
    const shipping = method === 'retiro' ? 0 : [6200, 7400, 9800][Math.floor(r() * 3)];
    const created = new Date(Date.now() - daysAgo * 864e5);
    const o = baseOrder(st, {
      customer_id: cid, email, name, phone: '2215046554', dni: '30111222', items, subtotal, discount, shipping_cost: shipping, method,
      address: { cp, calle: 'Calle de ejemplo', numero: String(100 + Math.floor(r() * 1800)), piso: '', depto: '', localidad: loc, provincia: prov, referencia: '' },
      payment_method: transfer ? 'transferencia' : '', created, branch: method === 'andreani_sucursal' ? `Sucursal Andreani ${loc}` : '',
    });
    if (status !== 'pending_payment' && status !== 'cancelled') {
      o.payment_status = 'approved'; o.payment_id = transfer ? '' : String(1300000000 + Math.floor(r() * 9e8)); o.payment_method = transfer ? 'transferencia' : ['visa', 'master', 'account_money'][Math.floor(r() * 3)];
      o.paid_at = sqlDate(new Date(created.getTime() + 15 * 60e3)); o.stock_applied = 1;
      event(st, o, 'payment', transfer ? 'Transferencia recibida (marcado por el equipo)' : `Mercado Pago: Aprobado (pago ${o.payment_id})`, o.paid_at);
      mailOrder(st, 'payment_approved', o, {}, o.paid_at);
      mailStaff(st, 'staff_new_order', o, {}, o.paid_at);
    }
    if (['shipped', 'delivered'].includes(status) && method !== 'retiro') {
      o.andreani_number = '3600' + String(Math.floor(r() * 1e11)).padStart(11, '0');
      o.shipped_at = sqlDate(new Date(created.getTime() + 864e5));
      event(st, o, 'shipping', `Envío Andreani creado: ${o.andreani_number}`, o.shipped_at);
      o.tracking_events = [{ fecha: o.shipped_at, estado: 'Ingreso al circuito operativo', sucursal: 'La Plata' }, { fecha: sqlDate(new Date(created.getTime() + 2 * 864e5)), estado: 'En viaje', sucursal: 'Centro de distribución' }];
      if (status === 'delivered') o.tracking_events.push({ fecha: sqlDate(new Date(created.getTime() + 3 * 864e5)), estado: 'Entregado', sucursal: loc });
      o.tracking_status = o.tracking_events.at(-1).estado;
      mailOrder(st, 'order_shipped', o, { tracking: { number: o.andreani_number, url: '#' } }, o.shipped_at);
      if (status === 'delivered') mailOrder(st, 'order_delivered', o, {}, o.tracking_events.at(-1).fecha);
    }
    if (status === 'ready_pickup') { o.ready_at = sqlDate(new Date(created.getTime() + 864e5 * 0.5)); mailOrder(st, 'order_ready_pickup', o, pickupCtx(st), o.ready_at); }
    if (status === 'pending_payment' && transfer) mailStaff(st, 'staff_transfer_pending', o, {}, o.created_at);
    if (status === 'cancelled') {
      const at = sqlDate(new Date(created.getTime() + 72 * 3600e3));
      event(st, o, 'status', 'Cancelado automáticamente: no se pagó en 72 horas.', at);
      mailOrder(st, 'payment_reminder', o, {}, sqlDate(new Date(created.getTime() + 24 * 3600e3)));
      mailOrder(st, 'order_cancelled', o, { reason: 'porque no se registró el pago a tiempo' }, at);
    }
    o.status = status;
  });
}

function baseOrder(st, d) {
  const s = st.settings.checkout;
  const id = ++st.ids.order;
  const o = {
    id, number: `${s.orderPrefix}-${s.nextOrderNumber++}`, token: token(), customer_id: d.customer_id, email: d.email, name: d.name, phone: d.phone, dni: d.dni,
    status: 'pending_payment', payment_status: 'pending', payment_id: '', payment_method: d.payment_method || '', mp_preference_id: '',
    subtotal: d.subtotal, discount: d.discount, shipping_cost: d.shipping_cost, total: d.subtotal - d.discount + d.shipping_cost, coupon_code: d.coupon || '',
    shipping_method: d.method, shipping_address: d.address, shipping_branch: d.branch || '', andreani_number: '', tracking_status: '', tracking_events: [],
    customer_note: d.note || '', internal_note: '', stock_applied: 0, created_at: sqlDate(d.created || new Date()), paid_at: null, shipped_at: null,
    items: d.items.map((x, i) => ({ id: i + 1, ...x })), events: [],
  };
  st.orders.push(o);
  event(st, o, 'created', `Pedido creado · ${fmt(o.total)} · ${METHOD[o.shipping_method]} · ${o.payment_method === 'transferencia' ? 'transferencia' : 'Mercado Pago'}`, o.created_at);
  if (o.payment_method === 'transferencia') mailOrder(st, 'transfer_instructions', o, { transfer: transferCtx(st) }, o.created_at);
  else mailOrder(st, 'order_received', o, {}, o.created_at);
  return o;
}

// ── Emails simulados: se guarda el contexto y se arma el HTML al abrirlo ──
const demoStore = (st) => ({ name: st.settings.store.name, url: '.', whatsapp: st.settings.store.whatsapp, instagram: st.settings.store.instagram });
const LINKS = { order: '#', shop: '#', cart: '#', reset: '#', unsubscribe: '#', panel: '#' };
function orderMailCtx(o) {
  return { name: o.name, order: { number: o.number, subtotal: o.subtotal, discount: o.discount, shippingCost: o.shipping_cost, total: o.total, shippingMethod: o.shipping_method, shippingLabel: METHOD[o.shipping_method],
    items: o.items.map((i) => ({ name: i.name, variant_label: i.variant_label, qty: i.qty, unit_price: i.unit_price, image: i.image })), customerName: o.name, email: o.email, phone: o.phone, paymentMethod: o.payment_method === 'transferencia' ? 'transferencia' : 'mercadopago' } };
}
const transferCtx = (st) => { const p = st.settings.payments; return { holder: p.bankHolder, bank: p.bankName, cbu: p.bankCbu, alias: p.bankAlias, hours: p.transferHours, discount: p.transferDiscount }; };
const pickupCtx = (st) => ({ pickup: { address: st.settings.shipping.pickupAddress, hours: st.settings.shipping.pickupHours } });
function mailLog(st, key, to, ctx, at, orderId = null, force = false) {
  const set = st.settings.emails;
  if (!force && !set.enabled[key]) return 'desactivado';
  const t = window.__EMAIL.TEMPLATES[key];
  if (t.marketing && st.customers.find((c) => c.email === to)?.optOut) return 'dado de baja';
  const c = { store: demoStore(st), ...ctx, links: { ...LINKS, ...(ctx.links || {}) } };
  const subject = t.subject(c);
  st.emails.unshift({ id: ++st.ids.email, at: at || sqlDate(), template: key, to_email: to, subject, status: 'enviado (simulado)', order_id: orderId, ctx });
  if (st.emails.length > 300) st.emails.length = 300;
  return 'enviado (simulado)';
}
const mailOrder = (st, key, o, extra = {}, at) => mailLog(st, key, o.email, { ...orderMailCtx(o), ...extra }, at, o.id);
const mailStaff = (st, key, o, extra = {}, at) => { for (const to of String(st.settings.emails.staffEmails || '').split(/[,;\s]+/).filter((x) => x.includes('@'))) mailLog(st, key, to, { ...orderMailCtx(o), ...extra }, at, o?.id); };

// Bolsas de ejemplo para la sección Carritos.
function seedCarts(st) {
  const pool = st.products.filter((p) => p.images.length && p.variants.some((v) => v.stock === null || v.stock > 0));
  const pick = (i) => { const p = pool[(i * 37) % pool.length]; const v = p.variants.find((x) => x.stock === null || x.stock > 0); return { variant_id: v.id, qty: 1 }; };
  const plan = [
    ['Paula Medina', 'paula.medina@ejemplo.com', [pick(1), pick(2)], 5, 1, 'active'],
    ['Sofía Herrera', 'sofia.herrera@ejemplo.com', [pick(3)], 0.6, 0, 'active'],
    ['Camila Romero', 'camila.romero@ejemplo.com', [pick(4), pick(5), pick(6)], 60, 2, 'active'],
    ['Inés Aguirre', 'ines.aguirre@ejemplo.com', [pick(7)], 30, 1, 'converted'],
    ['Mercedes Castro', 'mercedes.castro@ejemplo.com', [pick(8)], 400, 2, 'expired'],
  ];
  for (const [name, email, items, hoursAgo, reminders, status] of plan) {
    const updated = sqlDate(new Date(Date.now() - hoursAgo * 3600e3));
    const c = { id: ++st.ids.cart, token: token(), email, name, items, status, reminders, last_reminder_at: null, order_id: null, created_at: updated, updated_at: updated };
    if (reminders >= 1) { c.last_reminder_at = sqlDate(new Date(Date.now() - (hoursAgo - 1) * 3600e3)); mailLog(st, 'cart_reminder_1', email, cartMailCtx(st, c), c.last_reminder_at); }
    if (reminders >= 2) { c.last_reminder_at = sqlDate(new Date(Date.now() - (hoursAgo - 48) * 3600e3)); mailLog(st, 'cart_reminder_2', email, cartMailCtx(st, c), c.last_reminder_at); }
    if (status === 'converted') { const o = st.orders.find((x) => x.status === 'paid'); if (o) c.order_id = o.id; }
    st.carts.push(c);
  }
}
function cartMailCtx(st, c) {
  const items = c.items.map((i) => { for (const p of st.products) { const v = p.variants.find((x) => x.id === i.variant_id); if (v) return { name: p.name, variant_label: [v.color, v.size && `Talle ${v.size}`].filter(Boolean).join(' · '), qty: i.qty, unit_price: v.promo_price ?? v.price, image: p.images[0] || '', stock: v.stock }; } return null; }).filter(Boolean);
  return { name: c.name, cart: { items, total: items.reduce((a, i) => a + i.unit_price * i.qty, 0) }, links: { cart: '?carrito=' + c.token } };
}
function event(st, o, kind, message, at) { o.events.unshift({ id: ++st.ids.event, at: at || sqlDate(), kind, message }); }

let S;
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const st = JSON.parse(raw); if (st.v === 9 && st.products?.length === SEED.products.length) return st; } } catch {}
  return seedState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
S = load();
window.__SAMADHI_RESET = () => { try { localStorage.removeItem(KEY); } catch {} S = seedState(); save(); };

// ── Ayudas ──────────────────────────────────────────────
const prodById = (id) => S.products.find((p) => p.id === Number(id));
const variantById = (id) => { for (const p of S.products) { const v = p.variants.find((x) => x.id === Number(id)); if (v) return { p, v }; } return null; };
const labelOf = (v) => [v.color, v.size && `Talle ${v.size}`, v.other].filter(Boolean).join(' · ');
const staffMe = () => S.staff.find((u) => u.id === S.session.staff) || null;
const customerMe = () => S.customers.find((c) => c.id === S.session.customer && c.password) || null;
function tryonLogin() { if (S.settings.tryon.requireLogin !== false && !customerMe() && !S.session.staff) fail(401, 'Para usar el probador virtual ingresá a tu cuenta (o creala, es gratis).', { code: 'login' }); }
function tryonPeople(days, q, customerId) {
  const since = Date.now() - days * 864e5;
  let rows = S.tryons.filter((t) => t.customer_id && ['lista', 'prueba', 'propio'].includes(t.status) && Date.parse(t.at.replace(' ', 'T') + 'Z') > since && (!customerId || t.customer_id === customerId))
    .map((t) => { const c = S.customers.find((x) => x.id === t.customer_id) || {}; const p = S.products.find((x) => x.id === t.product_id) || {}; return { id: t.id, at: t.at, added: t.added, product_id: t.product_id, product: p.name || 'Prenda borrada', image: p.images?.[0] || null, customer_id: t.customer_id, name: c.name || '', email: c.email || '', phone: c.phone || '' }; })
    .sort((a, z) => z.at.localeCompare(a.at));
  if (q) { const k = q.toLowerCase(); rows = rows.filter((r) => `${r.name} ${r.email} ${r.product}`.toLowerCase().includes(k)); }
  const people = new Map();
  for (const r of rows) {
    const x = people.get(r.customer_id) || { customer_id: r.customer_id, name: r.name, email: r.email, phone: r.phone, tries: 0, added: 0, last: r.at, products: new Map() };
    x.tries++; x.added += r.added ? 1 : 0;
    const pr = x.products.get(r.product_id) || { product_id: r.product_id, name: r.product, image: r.image, times: 0, added: 0, last: r.at };
    pr.times++; pr.added += r.added ? 1 : 0; x.products.set(r.product_id, pr); people.set(r.customer_id, x);
  }
  const anonymous = S.tryons.filter((t) => !t.customer_id && ['lista', 'prueba', 'propio'].includes(t.status) && Date.parse(t.at.replace(' ', 'T') + 'Z') > since).length;
  return { people: [...people.values()].map((x) => ({ ...x, products: [...x.products.values()] })), recent: rows.slice(0, 200), anonymous };
}

function tryonHidden() {
  const h = S.settings.tryon.hiddenCategories;
  return Array.isArray(h) ? h : S.categories.filter((c) => /acces|bolso|cartera|cintur|bijou|aros|collar|pa[ñn]uelo|sombrero|gorro|lentes|calzado|zapat|bota|sandal|media/i.test(c.name)).map((c) => c.id);
}
const tryJobs = new Map();
function publicCatalog() {
  const products = S.products.filter((p) => p.visible && p.variants.length).map((p) => {
    const vs = p.variants.map((v) => ({ id: v.id, color: v.color, size: v.size, other: v.other, price: v.price, promo: v.promo_price && v.promo_price < v.price ? v.promo_price : null, stock: v.stock === '' ? null : v.stock }));
    const min = Math.min(...vs.map((v) => v.promo ?? v.price));
    const ref = vs.find((v) => (v.promo ?? v.price) === min) || vs[0];
    return { id: p.id, slug: p.slug, name: p.name, ref: p.ref_code, desc: p.description, collection: p.collection, featured: !!p.featured, freeShipping: !!p.free_shipping,
      isNew: /SS'27/.test(p.collection), images: p.images, categories: p.categories, price: ref.price, promo: ref.promo, variants: vs, inStock: vs.some((v) => v.stock === null || v.stock > 0) };
  });
  const used = new Set(products.flatMap((p) => p.categories));
  const st = S.settings;
  return {
    products,
    categories: S.categories.filter((c) => c.visible && used.has(c.id)).sort((a, b) => a.position - b.position).map((c) => ({ ...c, count: products.filter((p) => p.categories.includes(c.id)).length })),
    banners: S.banners.filter((b) => b.active).sort((a, b) => a.position - b.position),
    store: { name: st.store.name, tagline: st.store.tagline, instagram: st.store.instagram, whatsapp: st.store.whatsapp, email: st.store.email, announcement: st.store.announcement, spaUrl: st.store.spaUrl || 'https://casa-samadhi.vercel.app' },
    shipping: { pickup: st.shipping.pickupEnabled ? { address: st.shipping.pickupAddress, hours: st.shipping.pickupHours } : null, freeShippingFrom: st.shipping.freeShippingFrom || 0, domicilio: !!st.shipping.andreaniDomicilio, sucursal: !!st.shipping.andreaniSucursal },
    tryon: { requireLogin: S.settings.tryon.requireLogin !== false, ...(S.settings.tryon.engine === 'fashn' ? { enabled: S.settings.tryon.enabled, engine: 'fashn', mock: true, hidden: tryonHidden() }
      : S.settings.tryon.engine === 'gemini' ? { enabled: S.settings.tryon.enabled, engine: 'gemini', hidden: tryonHidden(), garments: Object.fromEntries(Object.entries(S.garments).filter(([id, g]) => g.status === 'aprobada').map(([id, { status, source, ...g }]) => [id, g])) }
      : { enabled: S.settings.tryon.enabled, engine: 'samadhi', garments: Object.fromEntries(Object.entries(S.garments).filter(([id, g]) => g.status === 'aprobada' && S.products.find((p) => p.id === Number(id))?.visible).map(([id, { status, source, ...g }]) => [id, g])), hidden: [] }) },
    content: { faq: S.settings.content.faq, terms: S.settings.content.terms, returns: S.settings.content.returns, reviews: S.settings.content.reviewsEnabled },
    payments: { installments: st.payments.installments || 1, transfer: st.payments.transferEnabled ? { discount: st.payments.transferDiscount || 0 } : null },
  };
}

function priceCart(raw) {
  if (!Array.isArray(raw) || !raw.length) fail(400, 'Tu bolsa está vacía.');
  const items = [], problems = [];
  for (const it of raw) {
    const f = variantById(it.variant_id);
    const qty = Math.floor(Number(it.qty));
    if (!f || !f.p.visible) { problems.push('Una de las prendas ya no está disponible.'); continue; }
    if (f.v.stock !== null && f.v.stock < qty) { problems.push(f.v.stock === 0 ? `${f.p.name} (${labelOf(f.v)}) se agotó.` : `De ${f.p.name} (${labelOf(f.v)}) quedan ${f.v.stock}.`); continue; }
    items.push({ product_id: f.p.id, variant_id: f.v.id, name: f.p.name, variant_label: labelOf(f.v), sku: f.v.sku, image: f.p.images[0] || '', unit_price: f.v.promo_price ?? f.v.price, qty, free: !!f.p.free_shipping });
  }
  if (problems.length) fail(409, problems.join(' '));
  return { items, subtotal: items.reduce((a, i) => a + i.unit_price * i.qty, 0) };
}
function findCoupon(code, subtotal) {
  const c = S.coupons.find((x) => x.code.toLowerCase() === String(code || '').trim().toLowerCase() && x.active);
  const today = new Date().toISOString().slice(0, 10);
  if (!c) fail(404, 'Ese cupón no existe o ya no está activo.');
  if (c.starts_at && today < c.starts_at) fail(400, 'Ese cupón todavía no está vigente.');
  if (c.ends_at && today > c.ends_at) fail(400, 'Ese cupón ya venció.');
  if (c.max_uses && c.uses >= c.max_uses) fail(400, 'Ese cupón ya alcanzó su límite de usos.');
  if (subtotal < c.min_subtotal) fail(400, `Ese cupón es para compras desde ${fmt(c.min_subtotal)}.`);
  return c;
}
const couponDiscount = (c, sub) => (!c ? 0 : c.kind === 'percent' ? Math.round((sub * Math.min(100, c.value)) / 100) : c.kind === 'fixed' ? Math.min(sub, c.value) : 0);
function shippingOptions(cp, items, subtotal, coupon) {
  const s = S.settings.shipping;
  const free = (s.freeShippingFrom > 0 && subtotal >= s.freeShippingFrom) || (items.length && items.every((i) => i.free)) || coupon?.kind === 'free_shipping';
  const n = Number(cp);
  let base = 9800;
  if (n >= 1000 && n <= 1499) base = 6200; else if (n >= 1600 && n <= 1999) base = 7400; else if (n >= 9000) base = 14500;
  const opts = [];
  if (/^\d{4}$/.test(cp)) {
    if (s.andreaniDomicilio) opts.push({ method: 'andreani_domicilio', label: METHOD.andreani_domicilio, cost: free ? 0 : base + (s.extraHandling || 0), days: '2 a 5 días hábiles' });
    if (s.andreaniSucursal) opts.push({ method: 'andreani_sucursal', label: METHOD.andreani_sucursal, cost: free ? 0 : Math.round(base * 0.78) + (s.extraHandling || 0), days: '3 a 6 días hábiles' });
  }
  if (s.pickupEnabled) opts.push({ method: 'retiro', label: METHOD.retiro, cost: 0, detail: [s.pickupAddress, s.pickupHours].filter(Boolean).join(' · ') });
  return { options: opts, free };
}
function applyStock(o, sign) {
  for (const it of o.items) { const f = variantById(it.variant_id); if (f && f.v.stock !== null) f.v.stock = Math.max(0, f.v.stock + sign * it.qty); }
}
function publicOrder(o) {
  const p = S.settings.payments;
  return {
    number: o.number, token: o.token, status: o.status, statusLabel: STATUS[o.status], paymentStatus: o.payment_status, paymentLabel: PAY[o.payment_status] || o.payment_status,
    name: o.name, email: o.email, items: o.items.map((i) => ({ name: i.name, variant_label: i.variant_label, image: i.image, unit_price: i.unit_price, qty: i.qty })),
    subtotal: o.subtotal, discount: o.discount, shippingCost: o.shipping_cost, total: o.total, shippingMethod: o.shipping_method, shippingLabel: METHOD[o.shipping_method],
    andreaniNumber: o.andreani_number, trackingUrl: o.andreani_number ? `https://www.andreani.com/#!/informacionEnvio/${o.andreani_number}` : '', trackingStatus: o.tracking_status, createdAt: o.created_at,
    paymentMethod: o.payment_method === 'transferencia' ? 'transferencia' : 'mercadopago',
    transfer: o.payment_method === 'transferencia' && o.status === 'pending_payment' ? { holder: p.bankHolder, bank: p.bankName, cbu: p.bankCbu, alias: p.bankAlias, hours: p.transferHours, discount: p.transferDiscount, whatsapp: S.settings.store.whatsapp } : null,
  };
}
function setStatus(o, status, by) {
  if (!STATUS[status]) fail(400, 'Estado desconocido.');
  if (status === 'paid' && o.status === 'pending_payment') { o.paid_at = sqlDate(); o.payment_status = 'approved'; if (!o.stock_applied) { applyStock(o, -1); o.stock_applied = 1; } }
  if ((status === 'cancelled' || status === 'refunded') && o.stock_applied) { applyStock(o, +1); o.stock_applied = 0; }
  if (status === 'refunded') o.payment_status = 'refunded';
  if (status === 'shipped') o.shipped_at = sqlDate();
  const prev = o.status;
  o.status = status;
  if (status === 'ready_pickup') o.ready_at = sqlDate();
  event(S, o, 'status', `Estado: ${STATUS[status]} (${by})`);
  if (prev !== status) {
    if (status === 'paid' && prev === 'pending_payment') { mailOrder(S, 'payment_approved', o); mailStaff(S, 'staff_new_order', o); }
    if (status === 'preparing') mailOrder(S, 'order_preparing', o);
    if (status === 'ready_pickup') mailOrder(S, 'order_ready_pickup', o, pickupCtx(S));
    if (status === 'shipped' && o.andreani_number) mailOrder(S, 'order_shipped', o, { tracking: { number: o.andreani_number, url: '#' } });
    if (status === 'delivered') mailOrder(S, 'order_delivered', o);
    if (status === 'cancelled') mailOrder(S, 'order_cancelled', o, { reason: '' });
    if (status === 'refunded') mailOrder(S, 'order_refunded', o);
  }
}

// ── Rutas de la tienda ─────────────────────────────────
function emailSampleDemo() {
  const feat = S.products.filter((p) => p.images.length).slice(0, 2);
  const items = feat.map((p) => { const v = p.variants[0]; return { name: p.name, variant_label: [v.color, v.size && `Talle ${v.size}`].filter(Boolean).join(' · '), qty: 1, unit_price: v.promo_price ?? v.price, image: p.images[0], stock: v.stock }; });
  const sub = items.reduce((a, i) => a + i.unit_price, 0);
  const c = window.__EMAIL.sampleContext(demoStore(S), { items, subtotal: sub });
  const demoCart = S.carts.find((x) => x.status === 'active');
  c.links = { ...LINKS, cart: demoCart ? '?carrito=' + demoCart.token : '#' }; c.transfer = transferCtx(S); Object.assign(c, pickupCtx(S));
  c.lowStock = items.map((i) => ({ name: i.name, variant: i.variant_label, stock: 1 }));
  return c;
}
const hrsAgo = (d) => (Date.now() - new Date(String(d).replace(' ', 'T') + 'Z').getTime()) / 3600e3;
function demoJobs() {
  const s = S.settings.emails, done = { expired: 0, carts: 0, payment: 0, transfer: 0, pickup: 0 };
  for (const c of S.carts.filter((x) => x.status === 'active')) {
    if (hrsAgo(c.updated_at) > 14 * 24) { c.status = 'expired'; continue; }
    const step = c.reminders, need = step === 0 ? s.cartReminder1Hours : step === 1 ? s.cartReminder2Hours : Infinity;
    if (hrsAgo(c.updated_at) < need) continue;
    const ctx = cartMailCtx(S, c); ctx.cart.items = ctx.cart.items.filter((i) => i.stock === null || i.stock > 0);
    if (!ctx.cart.items.length) { c.status = 'expired'; continue; }
    mailLog(S, step ? 'cart_reminder_2' : 'cart_reminder_1', c.email, ctx);
    c.reminders++; c.last_reminder_at = sqlDate(); done.carts++;
  }
  const th = Number(S.settings.payments.transferHours) || 48;
  for (const o of S.orders.filter((x) => x.status === 'pending_payment' && !x.reminded_at)) {
    const t = o.payment_method === 'transferencia';
    if (hrsAgo(o.created_at) < (t ? Math.max(1, th - s.transferReminderHoursBefore) : s.paymentReminderHours)) continue;
    o.reminded_at = sqlDate();
    if (t) { mailOrder(S, 'transfer_reminder', o, { transfer: transferCtx(S) }); done.transfer++; } else { mailOrder(S, 'payment_reminder', o); done.payment++; }
  }
  for (const o of S.orders.filter((x) => x.status === 'ready_pickup' && !x.pickup_reminded_at && hrsAgo(x.ready_at || x.created_at) > s.pickupReminderDays * 24)) {
    o.pickup_reminded_at = sqlDate(); mailOrder(S, 'pickup_reminder', o, pickupCtx(S)); done.pickup++;
  }
  return done;
}

// ── Lince (simulado): misma lógica de cruce que server/integrations/dragonfish.js ──
function lnorm(x) { return String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function linceMock(st) {
  const out = [];
  let i = 0;
  for (const p of st.products) if (p.ref_code && p.visible) for (const v of p.variants) { out.push({ Articulo: p.ref_code, Color: v.color, Talle: v.size, Disponible: (v.stock ?? 3) + (i % 9 === 0 ? 1 : i % 13 === 0 ? -1 : 0), Precio: v.price }); i++; }
  out.push({ Articulo: 'S27XX99', Color: 'Crudo', Talle: 'U', Disponible: 4, Precio: 59000 }, { Articulo: 'S26AC10', Color: 'Negro', Talle: '', Disponible: 2, Precio: 21000 });
  return out;
}
function linceLive(st, o) { return o.stock_applied && !o.lince_at && o.paid_at && o.paid_at >= st.lince.since; }
function linceApply(st, rows, source, at = sqlDate()) {
  const idx = new Map(), all = [];
  for (const p of st.products) if (p.ref_code) for (const v of p.variants) {
    all.push({ p, v });
    for (const k of [`${lnorm(p.ref_code)}|${lnorm(v.color)}|${lnorm(v.size)}`, `${lnorm(p.ref_code)}|*|${lnorm(v.size)}`, `${lnorm(p.ref_code)}|${lnorm(v.color)}|*`]) { if (!idx.has(k)) idx.set(k, []); idx.get(k).push({ p, v }); }
  }
  const pending = new Map();
  for (const o of st.orders.filter((x) => linceLive(st, x))) for (const i of o.items) pending.set(i.variant_id, (pending.get(i.variant_id) || 0) + i.qty);
  const tot = new Map(), notFound = [];
  for (const raw of rows) {
    const a = lnorm(raw.Articulo), c = lnorm(raw.Color), t = lnorm(raw.Talle);
    let m = idx.get(`${a}|${c}|${t}`) || (idx.get(`${a}|*|${t}`) || []).filter((x) => !x.v.color);
    if (!m.length) m = (idx.get(`${a}|${c}|*`) || []).filter((x) => !x.v.size);
    if (!m.length) { notFound.push({ articulo: raw.Articulo, color: raw.Color, talle: raw.Talle, qty: raw.Disponible }); continue; }
    for (const x of m) { const cur = tot.get(x.v.id) || { x, qty: 0, price: null }; cur.qty += Number(raw.Disponible) || 0; cur.price = raw.Precio || cur.price; tot.set(x.v.id, cur); }
  }
  let updated = 0, unchanged = 0, prices = 0; const changes = [];
  for (const [id, t] of tot) {
    const stock = Math.max(0, Math.floor(t.qty) - (pending.get(id) || 0));
    const np = st.lince.settings.updatePrices && t.price > 0 && t.price !== t.x.v.price ? t.price : null;
    if (stock === t.x.v.stock && !np) { unchanged++; continue; }
    if (stock !== t.x.v.stock) { updated++; if (changes.length < 60) changes.push({ name: t.x.p.name, variant: [t.x.v.color, t.x.v.size].filter(Boolean).join(' · '), from: t.x.v.stock, to: stock }); t.x.v.stock = stock; }
    if (np) { t.x.v.price = np; prices++; }
  }
  const missing = all.filter((x) => !tot.has(x.v.id)).length;
  st.lince.syncs.unshift({ id: st.lince.syncs.length + 1, at, source, rows: rows.length, updated, unchanged, not_found: notFound.length, prices, error: null, detail: { notFound, changes, missing } });
  st.lince.syncs.length = Math.min(st.lince.syncs.length, 15);
  return { rows: rows.length, updated, unchanged, notFound: notFound.length, prices, missing };
}

function storeRoute(method, path, q, b) {
  if (path === '/api/catalog') return publicCatalog();
  if (path === '/api/track' || path === '/api/arrepentimiento') {
    const n = String(b.number || '').toUpperCase().replace(/\s+/g, '').replace(/^#/, ''), email = String(b.email || '').toLowerCase().trim();
    if (!n || !isEmail(email)) fail(422, 'Escribí el número de pedido y el email con el que compraste.');
    const o = S.orders.find((x) => (x.number === n || x.number === 'S-' + n.replace(/^[A-Z]+-?/, '')) && x.email.toLowerCase() === email);
    if (!o) fail(404, 'No encontramos un pedido con ese número y ese email. Revisá el email de confirmación.');
    if (path === '/api/track') return { ...publicOrder(o), ...window.__TRACK.buildTimeline(o, o.events || []), trackingEvents: o.tracking_events || [], branch: o.shipping_branch, address: o.shipping_address || {} };
    const ex = S.withdrawals.find((w) => w.order_id === o.id && w.status !== 'rechazado');
    if (ex) return { code: ex.code, number: o.number, existing: true };
    const code = 'ARR-' + token().slice(0, 6).toUpperCase();
    const reason = String(b.reason || '').slice(0, 1000);
    S.withdrawals.unshift({ id: S.withdrawals.length + 1, code, order_id: o.id, order_number: o.number, name: o.name, email: o.email, reason, status: 'nuevo', created_at: sqlDate() });
    event(S, o, 'alert', `Botón de arrepentimiento · código ${code}${reason ? ' · ' + reason.slice(0, 200) : ''}`);
    const w = { code, orderNumber: o.number, email: o.email, reason };
    mailOrder(S, 'withdrawal_received', o, { withdrawal: w }); mailStaff(S, 'staff_withdrawal', o, { withdrawal: w });
    return { code, number: o.number, existing: false };
  }
  if (path === '/api/tryon' && method === 'POST') {
    tryonLogin();
    const p = S.products.find((x) => x.id === Number(b.productId));
    if (!p) fail(404, 'No encontramos esa prenda.');
    if (!/^data:image\//.test(String(b.photo || ''))) fail(422, 'Subí una foto tuya de cuerpo entero (JPG o PNG).');
    const id = token();
    const log = { id: S.tryons.length + 1, at: sqlDate(), product_id: p.id, status: 'prueba', ms: 2500, added: 0, customer_id: customerMe()?.id || null };
    S.tryons.push(log); tryJobs.set(id, { at: Date.now(), log: log.id });
    return { id, mock: true };
  }
  const tm = path.match(/^\/api\/tryon\/([\w-]+)$/);
  if (tm && method === 'GET') {
    const j = tryJobs.get(tm[1]); if (!j) fail(404, 'Esta prueba ya venció.');
    if (j.image) { tryJobs.delete(tm[1]); return { status: 'completed', image: j.image, log: j.log }; }
    if (Date.now() - j.at < 2500) return { status: 'processing' };
    return { status: 'completed', mock: true, log: j.log };
  }
  if (path === '/api/tryon/log') { tryonLogin(); const log = { id: S.tryons.length + 1, at: sqlDate(), product_id: Number(b.productId), status: 'propio', ms: 0, added: 0, customer_id: customerMe()?.id || null }; S.tryons.push(log); return { log: log.id }; }
  if (path === '/api/tryon/added') { const t = S.tryons.find((x) => x.id === Number(b.log)); if (t) t.added = 1; return { ok: true }; }
  if (path === '/api/reviews') {
    if (!S.settings.content.reviewsEnabled) return { enabled: false };
    // Vista previa: sin ficha de Google conectada. Tarjetas marcadas como "Ejemplo" para ver el diseño.
    return { enabled: true, connected: false, writeUrl: '', examples: [
      { author: 'Clienta de ejemplo', rating: 5, text: 'Así se ve una reseña de cinco estrellas: el texto que la clienta escribió en Google, con su nombre y su foto.' },
      { author: 'Reseña de ejemplo', rating: 4, text: 'Las reseñas largas se cortan con puntos suspensivos y el link de abajo lleva a todas las reseñas en Google Maps.' },
      { author: 'Ejemplo', rating: 5, text: 'Google entrega hasta cinco reseñas de la ficha. Desde el panel podés elegir mostrar sólo las de 4 o 5 estrellas.' },
    ] };
  }
  if (path === '/api/shipping/quote') {
    const cp = digits(b.cp).slice(0, 4);
    if (cp.length !== 4) fail(400, 'El código postal tiene 4 números.');
    const { items, subtotal } = priceCart(b.items);
    let coupon = null; try { coupon = b.coupon ? findCoupon(b.coupon, subtotal) : null; } catch { coupon = null; }
    return shippingOptions(cp, items, subtotal, coupon);
  }
  if (path === '/api/shipping/branches') return { branches: [{ id: 'B-' + q.get('cp'), nombre: `Sucursal Andreani ${q.get('cp')}`, direccion: 'Dirección de ejemplo 123' }, { id: 'P-' + q.get('cp'), nombre: `Punto Andreani ${q.get('cp')}`, direccion: 'Avenida de ejemplo 456' }] };
  if (path === '/api/coupons/check') { const { subtotal } = priceCart(b.items); const c = findCoupon(b.code, subtotal); return { code: c.code, kind: c.kind, value: c.value, discount: couponDiscount(c, subtotal) }; }
  if (path === '/api/checkout') return checkout(b);
  let m = path.match(/^\/api\/orders\/([^/]+)$/);
  if (m) { const o = S.orders.find((x) => x.token === m[1]); if (!o) fail(404, 'No encontramos ese pedido.'); return publicOrder(o); }
  if (path === '/api/dev/mock-payment') {
    const o = S.orders.find((x) => x.token === b.token);
    if (!o) fail(404, 'No encontramos ese pedido.');
    const pid = 'SIM' + Date.now();
    o.payment_id = pid; o.payment_status = b.approve ? 'approved' : 'rejected'; o.payment_method = b.approve ? 'visa' : o.payment_method;
    event(S, o, 'payment', `Mercado Pago: ${b.approve ? 'Aprobado' : 'Rechazado'} (pago ${pid})`);
    if (!b.approve) mailOrder(S, 'payment_rejected', o);
    if (b.approve && o.status === 'pending_payment') {
      o.status = 'paid'; o.paid_at = sqlDate(); if (!o.stock_applied) { applyStock(o, -1); o.stock_applied = 1; }
      mailOrder(S, 'payment_approved', o); mailStaff(S, 'staff_new_order', o);
      const low = o.items.map((i) => ({ i, f: variantById(i.variant_id) })).filter((x) => x.f && x.f.v.stock !== null && x.f.v.stock <= 1).map((x) => ({ name: x.i.name, variant: x.i.variant_label, stock: x.f.v.stock }));
      if (low.length) mailStaff(S, 'staff_low_stock', null, { lowStock: low });
      if (o.coupon_code) { const c = S.coupons.find((x) => x.code === o.coupon_code); if (c) c.uses++; }
    }
    S.webhooks.unshift({ id: Date.now(), at: sqlDate(), source: 'mercadopago', result: `pedido ${o.number}: ${o.payment_status}` });
    return { ok: true };
  }
  // Ingreso y cuenta
  if (path === '/api/auth/session') {
    const st = staffMe(), c = customerMe();
    return { staff: st ? { name: st.name, email: st.email, role: st.role, roleLabel: ROLES[st.role] } : null, customer: c ? { name: c.name, email: c.email, phone: c.phone, dni: c.dni } : null };
  }
  if (path === '/api/auth/login') {
    const email = String(b.email || '').toLowerCase().trim();
    const st = S.staff.find((u) => u.email === email && u.password === b.password);
    if (st) { S.session = { staff: st.id, customer: null }; return { type: 'staff', name: st.name, role: st.role, roleLabel: ROLES[st.role] }; }
    const c = S.customers.find((x) => x.email === email && x.password && x.password === b.password);
    if (c) { S.session = { staff: null, customer: c.id }; return { type: 'customer', name: c.name }; }
    fail(401, 'El email o la contraseña no coinciden.');
  }
  if (path === '/api/auth/register') {
    const email = String(b.email || '').toLowerCase().trim();
    const errors = {};
    if (String(b.name || '').trim().length < 3) errors.name = 'Escribí tu nombre y apellido.';
    if (!isEmail(email)) errors.email = 'Revisá el email.';
    if (String(b.password || '').length < 10) errors.password = 'Al menos 10 caracteres.';
    if (Object.keys(errors).length) fail(422, 'Revisá los datos marcados.', { errors });
    const ex = S.customers.find((x) => x.email === email);
    if (ex?.password) fail(409, 'Ya hay una cuenta con ese email. Ingresá con tu contraseña.');
    const id = ex ? (Object.assign(ex, { name: b.name.trim(), password: b.password }), ex.id) : addCustomer(S, { email, name: b.name.trim(), password: b.password });
    S.session = { staff: null, customer: id };
    mailLog(S, 'account_welcome', email, { name: b.name.trim() });
    return { type: 'customer', name: b.name.trim() };
  }
  if (path === '/api/auth/forgot') {
    const email = String(b.email || '').toLowerCase().trim();
    const who = S.staff.find((u) => u.email === email) || S.customers.find((c) => c.email === email && c.password);
    if (who) { const t = token(); S.resets.push({ token: t, email, at: Date.now() }); mailLog(S, 'password_reset', email, { name: who.name }, null, null, true); }
    return { ok: true, message: 'Si hay una cuenta con ese email, te mandamos un link para elegir una nueva contraseña. En la vista previa lo ves en el panel, en Emails.' };
  }
  if (path === '/api/auth/reset') fail(400, 'En la vista previa el link del email no abre la tienda. En la tienda publicada, este paso guarda la nueva contraseña.');
  if (path === '/api/cart' && method === 'POST') {
    const me = customerMe();
    const email = String(me?.email || b.email || '').toLowerCase().trim();
    if (!isEmail(email)) return { saved: false };
    const items = (b.items || []).map((i) => ({ variant_id: Number(i.variant_id), qty: Math.max(1, Number(i.qty) || 1) }));
    let c = S.carts.find((x) => x.email === email && x.status === 'active');
    if (!items.length) { if (c) c.status = 'empty'; return { saved: false }; }
    const now = sqlDate();
    if (!c) { c = { id: ++S.ids.cart, token: token(), email, name: me?.name || b.name || '', items, status: 'active', reminders: 0, last_reminder_at: null, order_id: null, created_at: now, updated_at: now }; S.carts.push(c); }
    else if (JSON.stringify(c.items) !== JSON.stringify(items)) Object.assign(c, { items, updated_at: now, reminders: 0, name: me?.name || b.name || c.name });
    return { saved: true };
  }
  if ((m = path.match(/^\/api\/cart\/([^/]+)$/))) { const c = S.carts.find((x) => x.token === m[1]); if (!c) fail(404, 'No encontramos esa bolsa.'); return { items: c.items, status: c.status }; }
  if (path === '/api/auth/logout') { S.session = { staff: null, customer: null }; return { ok: true }; }
  if (path.startsWith('/api/account/')) {
    const c = customerMe();
    if (!c) fail(401, 'Ingresá a tu cuenta para ver esto.');
    if (path === '/api/account/orders') return { orders: S.orders.filter((o) => o.customer_id === c.id || o.email === c.email).sort((a, z) => z.id - a.id).map(publicOrder) };
    if (path === '/api/account/me') { if (String(b.name || '').trim().length < 3) fail(422, 'Escribí tu nombre y apellido.'); Object.assign(c, { name: b.name.trim(), phone: digits(b.phone), dni: digits(b.dni) }); return { ok: true }; }
  }
  fail(404, 'No existe esa ruta.');
}

function checkout(b) {
  const c = b.customer || {}, ship = b.shipping || {};
  const name = String(c.name || '').trim(), email = String(c.email || '').trim().toLowerCase();
  const errors = {};
  if (name.length < 3) errors.name = 'Escribí tu nombre y apellido.';
  if (!isEmail(email)) errors.email = 'Revisá el email.';
  if (digits(c.phone).length < 8) errors.phone = 'Dejanos un teléfono con código de área.';
  if (digits(c.dni).length < 7) errors.dni = 'Andreani pide el DNI de quien recibe.';
  if (!METHOD[ship.method]) errors.method = 'Elegí cómo querés recibir tu pedido.';
  const addr = { cp: digits(ship.cp).slice(0, 4), calle: ship.calle || '', numero: ship.numero || '', piso: ship.piso || '', depto: ship.depto || '', localidad: ship.localidad || '', provincia: ship.provincia || '', referencia: ship.referencia || '' };
  if (ship.method === 'andreani_domicilio' && (!addr.calle || !addr.numero || !addr.localidad)) errors.calle = 'Completá la dirección.';
  if (ship.method === 'andreani_sucursal' && !ship.branch) errors.branch = 'Elegí la sucursal donde retirás.';
  if (Object.keys(errors).length) fail(422, 'Revisá los datos marcados.', { errors });
  const { items, subtotal } = priceCart(b.items);
  const coupon = b.coupon ? findCoupon(b.coupon, subtotal) : null;
  const cd = couponDiscount(coupon, subtotal);
  const pay = S.settings.payments;
  const transfer = b.payment === 'transferencia' && pay.transferEnabled;
  const td = transfer ? Math.round(((subtotal - cd) * pay.transferDiscount) / 100) : 0;
  let shipCost = 0;
  if (ship.method !== 'retiro') shipCost = shippingOptions(addr.cp, items, subtotal, coupon).options.find((o) => o.method === ship.method)?.cost ?? 0;
  const me = customerMe();
  let cust = me || S.customers.find((x) => x.email === email);
  const cid = cust ? (Object.assign(cust, { name, phone: digits(c.phone), dni: digits(c.dni) }), cust.id) : addCustomer(S, { email, name, phone: digits(c.phone), dni: digits(c.dni) });
  const o = baseOrder(S, { customer_id: cid, email, name, phone: digits(c.phone), dni: digits(c.dni), items, subtotal, discount: cd + td, shipping_cost: shipCost, method: ship.method, address: addr, branch: ship.branch, payment_method: transfer ? 'transferencia' : '', coupon: coupon?.code, note: b.note });
  if (transfer) mailStaff(S, 'staff_transfer_pending', o);
  S.carts.filter((x) => x.email === email && x.status === 'active').forEach((x) => { x.status = 'converted'; x.order_id = o.id; });
  return { demo: true, number: o.number, token: o.token, transfer };
}

// ── Rutas del panel ────────────────────────────────────
function adminRoute(method, path, q, b, raw) {
  const me = staffMe();
  if (!me) fail(401, 'Tu sesión venció. Volvé a entrar.');
  const isAdmin = me.role === 'admin';
  const onlyAdmin = () => { if (!isAdmin) fail(403, 'Tu usuario no tiene permiso para esta sección. Pedíselo a quien administra la tienda.'); };
  let m;
  if (path === '/me') return { id: me.id, email: me.email, name: me.name, role: me.role, roleLabel: ROLES[me.role] };
  if (path === '/dashboard') {
    const since = (d) => S.orders.filter((o) => PAID.includes(o.status) && o.paid_at && Date.now() - Date.parse(o.paid_at.replace(' ', 'T') + 'Z') < d * 864e5);
    const agg = (rows) => ({ orders: rows.length, total: rows.reduce((a, o) => a + o.total, 0) });
    const byStatus = {}; S.orders.forEach((o) => (byStatus[o.status] = (byStatus[o.status] || 0) + 1));
    const dmap = {}; since(30).forEach((o) => { const d = o.paid_at.slice(0, 10); dmap[d] = (dmap[d] || 0) + o.total; });
    const top = {}; since(30).forEach((o) => o.items.forEach((i) => { top[i.name] = top[i.name] || { name: i.name, qty: 0, total: 0 }; top[i.name].qty += i.qty; top[i.name].total += i.qty * i.unit_price; }));
    const low = [];
    S.products.filter((p) => p.visible).forEach((p) => p.variants.forEach((v) => { if (v.stock !== null && v.stock >= 1 && v.stock <= 2) low.push({ id: v.id, color: v.color, size: v.size, stock: v.stock, product_id: p.id, name: p.name }); }));
    return {
      today: agg(since(1)), week: agg(since(7)), month: agg(since(30)), byStatus,
      daily: Object.entries(dmap).map(([day, total]) => ({ day, total })), lowStock: low.sort((a, z) => a.stock - z.stock).slice(0, 12),
      top: Object.values(top).sort((a, z) => z.qty - a.qty).slice(0, 6), recent: [...S.orders].sort((a, z) => z.id - a.id).slice(0, 8),
      catalog: { products: S.products.length, visible: S.products.filter((p) => p.visible).length, soldOut: S.products.filter((p) => p.visible && !p.variants.some((v) => v.stock === null || v.stock > 0)).length },
      toShip: (byStatus.paid || 0) + (byStatus.preparing || 0),
    };
  }
  // Pedidos
  if (path === '/orders') {
    const st = q.get('status') || '', s = (q.get('q') || '').toLowerCase();
    const rows = S.orders.filter((o) => (!st || o.status === st) && (!s || `${o.number} ${o.name} ${o.email} ${o.andreani_number}`.toLowerCase().includes(s))).sort((a, z) => z.id - a.id);
    return { rows: rows.slice(0, 50).map((o) => ({ ...o, units: o.items.reduce((a, i) => a + i.qty, 0) })), total: rows.length, page: 1 };
  }
  if ((m = path.match(/^\/orders\/(\d+)(?:\/(\w[\w-]*))?$/))) {
    const o = S.orders.find((x) => x.id === Number(m[1]));
    if (!o) fail(404, 'No encontramos ese pedido.');
    const act = m[2];
    if (act === 'status') setStatus(o, b.status, me.email);
    else if (act === 'note') o.internal_note = String(b.note || '');
    else if (act === 'shipment') {
      if (!o.shipping_method.startsWith('andreani')) fail(400, 'Este pedido es para retirar en el local.');
      if (o.andreani_number) fail(400, `Este pedido ya tiene envío: ${o.andreani_number}.`);
      if (!['paid', 'preparing'].includes(o.status)) fail(400, 'Solo se puede crear el envío de pedidos pagados.');
      o.andreani_number = 'MOCK' + String(Date.now()).slice(-9); o.status = 'preparing';
      event(S, o, 'shipping', `Envío Andreani creado: ${o.andreani_number} (prueba)`);
    } else if (act === 'tracking') {
      if (!o.andreani_number) fail(400, 'Este pedido todavía no tiene envío de Andreani.');
      if (!o.tracking_events.length) o.tracking_events = [{ fecha: sqlDate(), estado: 'Envío creado (prueba)', sucursal: '' }];
      o.tracking_status = o.tracking_events.at(-1).estado;
    } else if (act === 'refund') { onlyAdmin(); setStatus(o, 'refunded', me.email); event(S, o, 'payment', 'Devolución total (prueba)'); }
    else if (act === 'sync-payment') { /* sin cambios en la vista previa */ }
    else if (act) fail(404, 'No existe esa ruta.');
    const cust = S.customers.find((c) => c.id === o.customer_id);
    return { ...o, statusLabel: STATUS[o.status], methodLabel: METHOD[o.shipping_method], paymentLabel: PAY[o.payment_status] || o.payment_status,
      trackingUrl: o.andreani_number ? `https://www.andreani.com/#!/informacionEnvio/${o.andreani_number}` : '', customerOrders: S.orders.filter((x) => x.customer_id === o.customer_id).length, customer_id: cust?.id };
  }
  // Productos
  const prodRow = (p) => {
    const now = p.variants.map((v) => v.promo_price ?? v.price);
    return { id: p.id, slug: p.slug, name: p.name, ref_code: p.ref_code, visible: p.visible, featured: p.featured, collection: p.collection, image: p.images[0] || '',
      price: Math.min(...now), list_price: Math.max(...p.variants.map((v) => v.price)), stock: p.variants.reduce((a, v) => a + (v.stock || 0), 0), unlimited: p.variants.filter((v) => v.stock === null).length, variants: p.variants.length };
  };
  if (path === '/products' && method === 'GET') {
    const s = (q.get('q') || '').toLowerCase(), cat = q.get('category'), vis = q.get('visible');
    const rows = S.products.filter((p) => (!s || `${p.name} ${p.ref_code} ${p.slug}`.toLowerCase().includes(s)) && (!cat || p.categories.includes(Number(cat))) && (vis === '' || vis === null || String(p.visible) === vis))
      .sort((a, z) => z.visible - a.visible || a.position - z.position).map(prodRow);
    return { rows, categories: S.categories.map((c) => ({ id: c.id, name: c.name })) };
  }
  const detail = (p) => ({ ...p, sold: S.orders.filter((o) => PAID.includes(o.status)).reduce((a, o) => a + o.items.filter((i) => i.product_id === p.id).reduce((x, i) => x + i.qty, 0), 0) });
  const saveProduct = (p, b) => {
    if (!String(b.name || '').trim()) fail(422, 'El producto necesita un nombre.');
    if (!b.variants?.length) fail(422, 'Agregá al menos una variante con precio.');
    for (const v of b.variants) if (!(Number(v.price) > 0)) fail(422, 'Cada variante necesita un precio mayor a cero.');
    Object.assign(p, {
      name: b.name.trim(), slug: slugify(b.slug || b.name), ref_code: b.ref_code || '', description: b.description || '', collection: b.collection || '', visible: b.visible ? 1 : 0,
      featured: b.featured ? 1 : 0, free_shipping: b.free_shipping ? 1 : 0, weight_kg: Number(b.weight_kg) || 0.5, height_cm: Number(b.height_cm) || 5, width_cm: Number(b.width_cm) || 30, depth_cm: Number(b.depth_cm) || 30,
      seo_title: b.seo_title || '', seo_description: b.seo_description || '', categories: (b.categories || []).map(Number), images: (b.images || []).filter(Boolean),
      variants: b.variants.map((v) => ({ id: Number(v.id) || ++S.ids.variant, color: String(v.color || '').trim(), size: String(v.size || '').trim().toUpperCase(), other: v.other || '', price: Math.round(v.price),
        promo_price: Number(v.promo_price) > 0 && Number(v.promo_price) < Number(v.price) ? Math.round(v.promo_price) : null, stock: v.stock === '' || v.stock === null || v.stock === undefined ? null : Math.max(0, Math.round(v.stock)), sku: v.sku || '', barcode: '' })),
    });
    return p;
  };
  if (path === '/products' && method === 'POST') { const p = saveProduct({ id: ++S.ids.product, position: -S.ids.product }, b); S.products.push(p); return detail(p); }
  if ((m = path.match(/^\/products\/(\d+)$/))) {
    const p = prodById(m[1]);
    if (!p) fail(404, 'No encontramos ese producto.');
    if (method === 'GET') return detail(p);
    if (method === 'PUT') return detail(saveProduct(p, b));
    if (method === 'DELETE') { onlyAdmin(); S.products = S.products.filter((x) => x !== p); return { ok: true }; }
  }
  if (path === '/products/bulk') {
    const ids = (b.ids || []).map(Number);
    if (!ids.length) fail(400, 'Elegí al menos un producto.');
    for (const p of S.products.filter((x) => ids.includes(x.id))) {
      if (b.action === 'show') p.visible = 1; else if (b.action === 'hide') p.visible = 0;
      else if (b.action === 'feature') p.featured = 1; else if (b.action === 'unfeature') p.featured = 0;
      else if (b.action === 'discount') p.variants.forEach((v) => (v.promo_price = Math.round((v.price * (100 - Math.min(90, b.percent))) / 10000) * 100));
      else if (b.action === 'clear-discount') p.variants.forEach((v) => (v.promo_price = null));
    }
    return { ok: true, count: ids.length };
  }
  if (path === '/stock') {
    const s = (q.get('q') || '').toLowerCase();
    return { rows: S.products.filter((p) => !s || p.name.toLowerCase().includes(s)).flatMap((p) => p.variants.map((v) => ({ ...v, product_id: p.id, name: p.name, visible: p.visible }))).slice(0, 2000) };
  }
  if ((m = path.match(/^\/variants\/(\d+)$/))) {
    const f = variantById(m[1]); if (!f) fail(404, 'No encontramos esa variante.');
    if ('stock' in b) f.v.stock = b.stock === '' || b.stock === null ? null : Math.max(0, Math.round(b.stock));
    if ('price' in b) f.v.price = Math.round(b.price) || f.v.price;
    if ('promo_price' in b) f.v.promo_price = Number(b.promo_price) > 0 && Number(b.promo_price) < f.v.price ? Math.round(b.promo_price) : null;
    return f.v;
  }
  // Categorías
  if (path === '/categories' && method === 'GET') return [...S.categories].sort((a, z) => a.position - z.position).map((c) => ({ ...c, products: S.products.filter((p) => p.visible && p.categories.includes(c.id)).length }));
  if (path === '/categories' && method === 'POST') { if (!String(b.name || '').trim()) fail(422, 'Escribí el nombre de la categoría.'); S.categories.push({ id: ++S.ids.category, name: b.name.trim(), slug: slugify(b.name), collection: b.collection || '', position: S.categories.length + 1, visible: 1 }); return { ok: true }; }
  if ((m = path.match(/^\/categories\/(\d+)$/))) {
    const c = S.categories.find((x) => x.id === Number(m[1]));
    if (method === 'DELETE') { S.categories = S.categories.filter((x) => x !== c); S.products.forEach((p) => (p.categories = p.categories.filter((id) => id !== c.id))); return { ok: true }; }
    Object.assign(c, { name: b.name, slug: slugify(b.name), collection: b.collection || '', visible: b.visible ? 1 : 0, position: Number(b.position) || 0 }); return { ok: true };
  }
  // Clientes
  const custRow = (c) => { const os = S.orders.filter((o) => o.customer_id === c.id); return { ...c, password: undefined, orders: os.length, spent: os.filter((o) => o.paid_at && !['refunded', 'cancelled'].includes(o.status)).reduce((a, o) => a + o.total, 0), last_order: os.map((o) => o.created_at).sort().at(-1) || null }; };
  if (path === '/customers') { const s = (q.get('q') || '').toLowerCase(); return { rows: S.customers.filter((c) => !s || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(s)).map(custRow).sort((a, z) => String(z.last_order).localeCompare(String(a.last_order))) }; }
  if ((m = path.match(/^\/customers\/(\d+)$/))) {
    const c = S.customers.find((x) => x.id === Number(m[1])); if (!c) fail(404, 'No encontramos esa clienta.');
    if (method === 'PUT') { c.notes = b.notes || ''; return { ok: true }; }
    return { ...custRow(c), orders: S.orders.filter((o) => o.customer_id === c.id).sort((a, z) => z.id - a.id), tryons: tryonPeople(365, '', c.id).recent };
  }
  // Cupones
  if (path === '/coupons' && method === 'GET') return [...S.coupons].sort((a, z) => z.id - a.id);
  const couponVals = (b) => {
    const code = String(b.code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) fail(422, 'El código va de 3 a 30 letras o números, sin espacios.');
    return { code, kind: b.kind, value: Math.round(b.value) || 0, min_subtotal: Math.round(b.min_subtotal) || 0, max_uses: Number(b.max_uses) || null, starts_at: b.starts_at || null, ends_at: b.ends_at || null, active: b.active ? 1 : 0 };
  };
  if (path === '/coupons' && method === 'POST') { const v = couponVals(b); if (S.coupons.some((c) => c.code === v.code)) fail(409, 'Ya existe un cupón con ese código.'); S.coupons.push({ id: ++S.ids.coupon, uses: 0, ...v }); return { ok: true }; }
  if ((m = path.match(/^\/coupons\/(\d+)$/))) { const c = S.coupons.find((x) => x.id === Number(m[1])); if (method === 'DELETE') S.coupons = S.coupons.filter((x) => x !== c); else Object.assign(c, couponVals(b)); return { ok: true }; }
  // Banners
  if (path === '/banners' && method === 'GET') return [...S.banners].sort((a, z) => a.position - z.position);
  const bannerVals = (b) => { if (!String(b.title || '').trim()) fail(422, 'El banner necesita un título.'); if (!b.image_url) fail(422, 'El banner necesita una foto.'); return { eyebrow: b.eyebrow || '', title: b.title, subtitle: b.subtitle || '', cta_label: b.cta_label || '', cta_link: b.cta_link || '', image_url: b.image_url, video_url: String(b.video_url || ''), tone: b.tone === 'light' ? 'light' : 'dark', active: b.active ? 1 : 0 }; };
  if (path === '/banners' && method === 'POST') { S.banners.push({ id: ++S.ids.banner, position: S.banners.length, ...bannerVals(b) }); return { ok: true }; }
  if (path === '/banners/order') { b.ids.forEach((id, i) => { const x = S.banners.find((y) => y.id === Number(id)); if (x) x.position = i; }); return { ok: true }; }
  if ((m = path.match(/^\/banners\/(\d+)$/))) { const x = S.banners.find((y) => y.id === Number(m[1])); if (method === 'DELETE') S.banners = S.banners.filter((y) => y !== x); else Object.assign(x, bannerVals(b)); return { ok: true }; }
  // Configuración (solo administración)
  if (path === '/settings') {
    onlyAdmin();
    if (method === 'PUT') { for (const k of ['store', 'shipping', 'checkout', 'payments']) if (b[k]) S.settings[k] = { ...S.settings[k], ...b[k] }; return { ok: true }; }
    return { ...structuredClone(S.settings), integrations: { publicUrl: 'https://www.samadhistyle.com.ar', webhookUrl: 'https://www.samadhistyle.com.ar/api/webhooks/mercadopago', mercadopago: 'prueba', webhookSecret: false, andreani: 'prueba', andreaniContratos: { domicilio: false, sucursal: false }, email: 'sin configurar', sessionSecret: true } };
  }
  if (path === '/integrations/andreani/test') { onlyAdmin(); return { ok: true, ...shippingOptions(digits(b.cp), [], 0, null).options[0], mock: true }; }
  if (path === '/webhooks') { onlyAdmin(); return S.webhooks.slice(0, 60); }
  if (path === '/import') { onlyAdmin(); fail(400, 'En la vista previa no se importan archivos. En la tienda publicada, este paso actualiza el catálogo desde el CSV de Tiendanube.'); }
  if (path === '/uploads') { if (!raw) fail(400, 'Subí una foto.'); return { url: URL.createObjectURL(raw) }; }
  // Usuarios (solo administración)
  if (path === '/tryon' && method === 'GET') {
    const ok = (t) => t.status === 'lista' || t.status === 'prueba' || t.status === 'propio';
    const within = (t, d) => Date.now() - Date.parse(t.at.replace(' ', 'T') + 'Z') < d * 864e5;
    const month = S.tryons.filter((t) => ok(t) && within(t, 30));
    const byP = new Map(); for (const t of month) { const x = byP.get(t.product_id) || { product_id: t.product_id, tries: 0, added: 0 }; x.tries++; x.added += t.added; byP.set(t.product_id, x); }
    const top = [...byP.values()].sort((a, z) => z.tries - a.tries).slice(0, 10).map((x) => { const p = S.products.find((y) => y.id === x.product_id); return { ...x, name: p?.name || '', image: p?.images[0] || '' }; });
    const done = month.filter((t) => t.status === 'lista');
    return { settings: S.settings.tryon, hidden: tryonHidden(), mock: true, garmentsOn: Object.values(S.garments).filter((g) => g.status === 'aprobada').length, categories: S.categories.filter((c) => c.visible),
      stats: { today: S.tryons.filter((t) => ok(t) && within(t, 1)).length, month: month.length, added: month.reduce((a, t) => a + t.added, 0), errors: S.tryons.filter((t) => t.status === 'error' && within(t, 30)).length,
        avgSeconds: done.length ? Math.round(done.reduce((a, t) => a + t.ms, 0) / done.length / 100) / 10 : null, top } };
  }
  if (path === '/tryon/people') return tryonPeople(Math.min(365, Number(q.get('days')) || 30), q.get('q') || '', q.get('customer') ? Number(q.get('customer')) : null);
  if (path === '/tryon' && method === 'PUT') {
    onlyAdmin();
    const t = S.settings.tryon;
    if (['samadhi', 'fashn', 'gemini'].includes(b.engine)) t.engine = b.engine;
    if (b.requireLogin !== undefined) t.requireLogin = !!b.requireLogin;
    Object.assign(t, { enabled: !!b.enabled, dailyLimit: Number(b.dailyLimit) || t.dailyLimit, perHour: Number(b.perHour) || t.perHour, mode: b.mode || t.mode, hiddenCategories: Array.isArray(b.hiddenCategories) ? b.hiddenCategories : t.hiddenCategories });
    return { ok: true };
  }
  if (path === '/tryon/garments' && method === 'GET') {
    const cat = new Map(S.categories.map((c) => [c.id, c.name]));
    return S.products.filter((p) => p.visible).map((p) => { const g = S.garments[p.id]; return { id: p.id, name: p.name, slug: p.slug, cats: p.categories.map((i) => cat.get(i)).filter(Boolean).join(', '), images: p.images.slice(0, 4), url: g?.url || null, kind: g?.kind || null, status: g?.status || null, source: g?.source || null, quality: g?.quality ?? null }; });
  }
  if ((m = path.match(/^\/tryon\/garments\/(\d+)$/))) {
    const id = Number(m[1]);
    if (method === 'PUT') { const g = S.garments[id]; if (!g) fail(404, 'Esa prenda todavía no está preparada.'); if (b.status) g.status = b.status; if (b.kind) g.kind = b.kind; return { ok: true }; }
    if (method === 'POST') {
      if (!/^data:image\//.test(String(b.data || ''))) fail(422, 'Falta la imagen de la prenda.');
      S.garments[id] = { url: b.data, kind: b.kind, pts: b.pts, w: b.size?.[0], h: b.size?.[1], quality: b.quality, status: b.status === 'oculta' ? 'oculta' : 'aprobada', source: 'panel' };
      return { url: b.data };
    }
  }
  if (path === '/content' && method === 'GET') { onlyAdmin(); return { ...S.settings.content, google: { connected: false } }; }
  if (path === '/content' && method === 'PUT') {
    onlyAdmin();
    const c = S.settings.content;
    if (Array.isArray(b.faq)) c.faq = b.faq.map((x) => ({ q: String(x.q || '').trim(), a: String(x.a || '').trim() })).filter((x) => x.q && x.a).slice(0, 40);
    for (const k of ['terms', 'returns']) if (b[k] !== undefined) c[k] = String(b[k]).slice(0, 40000);
    if (b.reviewsEnabled !== undefined) c.reviewsEnabled = !!b.reviewsEnabled;
    if (b.reviewsMinRating !== undefined) c.reviewsMinRating = Number(b.reviewsMinRating) || 0;
    return { ok: true };
  }
  if (path === '/withdrawals' && method === 'GET') return S.withdrawals;
  if ((m = path.match(/^\/withdrawals\/(\d+)$/))) { const w = S.withdrawals.find((x) => x.id === Number(m[1])); if (w) w.status = String(b.status || w.status); return { ok: true }; }
  if (path === '/stats') {
    const catName = new Map(S.categories.map((c) => [c.id, c.name]));
    const pcat = new Map(S.products.map((p) => [p.id, p.categories.map((id) => catName.get(id)).filter(Boolean)]));
    const orders = S.orders.map((o) => ({ ...o, provincia: o.shipping_address?.provincia || '', items: o.items.map((i) => ({ ...i, categories: pcat.get(i.product_id) || [] })) }));
    return window.__STATS.computeStats({ orders, carts: S.carts, from: q.get('from'), to: q.get('to') });
  }
  // ── Lince (simulado) ──
  if (path === '/lince' && method === 'GET') {
    const ok = S.lince.syncs.find((x) => !x.error);
    const vis = S.products.filter((p) => p.visible);
    return { mode: 'prueba', url: '', settings: S.lince.settings, last: S.lince.syncs.map(({ detail, ...x }) => x), detail: ok?.detail || null, lastOkAt: ok?.at || null,
      pendingOrders: S.orders.filter((o) => linceLive(S, o)).sort((a, z) => (a.paid_at > z.paid_at ? 1 : -1)).map((o) => ({ id: o.id, number: o.number, name: o.name, email: o.email, total: o.total, paid_at: o.paid_at, status: o.status,
        items: o.items.map((i) => ({ name: i.name, variant_label: i.variant_label, qty: i.qty, unit_price: i.unit_price, ref_code: variantById(i.variant_id)?.p.ref_code || '' })) })),
      coverage: { products: vis.length, withCode: vis.filter((p) => p.ref_code).length } };
  }
  if (path === '/lince/sync') return linceApply(S, linceMock(S), `panel · ${me.email} (prueba)`);
  if ((m = path.match(/^\/lince\/orders\/(\d+)\/loaded$/))) { const o = S.orders.find((x) => x.id === Number(m[1])); if (!o) fail(404, 'No encontramos ese pedido.'); if (!o.lince_at) { o.lince_at = sqlDate(); event(S, o, 'status', `Cargado en Lince (${me.email})`); } return { ok: true }; }
  if (path === '/lince' && method === 'PUT') { onlyAdmin(); S.lince.settings = { autoMinutes: Math.max(5, Number(b.autoMinutes) || 15), updatePrices: !!b.updatePrices }; return { ok: true }; }
  // ── Emails y carritos (simulados) ──
  if (path === '/emails' && method === 'GET') {
    onlyAdmin();
    const set = S.settings.emails, T = window.__EMAIL.TEMPLATES;
    return {
      templates: Object.entries(T).map(([key, t]) => ({ key, label: t.label, group: t.group, to: t.to, when: t.when, marketing: !!t.marketing, enabled: !!set.enabled[key] })),
      groups: window.__EMAIL.GROUPS, settings: { ...set, enabled: undefined }, smtp: false, staffFallback: '',
      log: S.emails.slice(0, 60).map(({ ctx, ...r }) => r),
    };
  }
  if (path === '/emails' && method === 'PUT') {
    onlyAdmin();
    const cur = S.settings.emails;
    const num = (k, min, max) => (b[k] === undefined ? cur[k] : Math.min(max, Math.max(min, Number(b[k]) || cur[k])));
    S.settings.emails = { ...cur, enabled: { ...cur.enabled, ...(b.enabled || {}) },
      paymentReminderHours: num('paymentReminderHours', 1, 168), transferReminderHoursBefore: num('transferReminderHoursBefore', 1, 72),
      pickupReminderDays: num('pickupReminderDays', 1, 30), cartReminder1Hours: num('cartReminder1Hours', 1, 72), cartReminder2Hours: num('cartReminder2Hours', 2, 240),
      staffEmails: b.staffEmails === undefined ? cur.staffEmails : String(b.staffEmails).slice(0, 500) };
    return { ok: true };
  }
  if ((m = path.match(/^\/emails\/preview\/(\w+)$/))) { onlyAdmin(); if (!window.__EMAIL.TEMPLATES[m[1]]) fail(404, 'No existe ese email.'); return window.__EMAIL.render(m[1], emailSampleDemo()); }
  if (path === '/emails/test') {
    onlyAdmin();
    if (!window.__EMAIL.TEMPLATES[b.key]) fail(404, 'No existe ese email.');
    const { store, links, ...ctx } = emailSampleDemo();
    mailLog(S, b.key, me.email, ctx, null, null, true);
    return { status: 'enviado (simulado)' };
  }
  if ((m = path.match(/^\/emails\/log\/(\d+)$/))) {
    onlyAdmin();
    const r = S.emails.find((x) => x.id === Number(m[1])); if (!r) fail(404, 'No encontramos ese email.');
    const { subject, html } = window.__EMAIL.render(r.template, { store: demoStore(S), ...r.ctx, links: { ...LINKS, ...(r.ctx.links || {}) } });
    return { ...r, subject, html };
  }
  if (path === '/emails/run') { onlyAdmin(); return demoJobs(); }
  if (path === '/carts') {
    const rows = S.carts.slice().sort((a, z) => (a.updated_at < z.updated_at ? 1 : -1)).map((c) => {
      const cx = cartMailCtx(S, c); const o = c.order_id && S.orders.find((x) => x.id === c.order_id);
      return { id: c.id, email: c.email, name: c.name, items: cx.cart.items, subtotal: cx.cart.total, status: c.status, reminders: c.reminders, last_reminder_at: c.last_reminder_at, order: o ? { id: o.id, number: o.number } : null, created_at: c.created_at, updated_at: c.updated_at };
    });
    const by = (st) => rows.filter((c) => c.status === st);
    return { rows, stats: { active: by('active').length, reminded: rows.filter((c) => c.reminders > 0).length, recovered: rows.filter((c) => c.status === 'converted' && c.reminders > 0).length, activeValue: by('active').reduce((a, c) => a + c.subtotal, 0) } };
  }
  if (path === '/users' && method === 'GET') { onlyAdmin(); return { users: S.staff.map(({ password, ...u }) => u), roles: ROLES }; }
  if (path === '/users' && method === 'POST') {
    onlyAdmin();
    if (!isEmail(b.email)) fail(422, 'Revisá el email.');
    if (String(b.password || '').length < 10) fail(422, 'La contraseña necesita al menos 10 caracteres.');
    if (S.staff.some((u) => u.email === b.email.toLowerCase())) fail(409, 'Ese email ya tiene acceso.');
    S.staff.push({ id: ++S.ids.staff, email: b.email.toLowerCase(), name: b.name || '', role: ROLES[b.role] ? b.role : 'manager', password: b.password, created_at: sqlDate() });
    return { ok: true };
  }
  if ((m = path.match(/^\/users\/(\d+)$/))) {
    onlyAdmin();
    const id = Number(m[1]);
    if (id === me.id) fail(400, method === 'DELETE' ? 'No podés quitarte el acceso a vos misma.' : 'No podés sacarte el rol de administración a vos misma.');
    if (method === 'DELETE') S.staff = S.staff.filter((u) => u.id !== id);
    else { const u = S.staff.find((x) => x.id === id); if (!ROLES[b.role]) fail(422, 'Elegí un rol válido.'); u.role = b.role; }
    return { ok: true };
  }
  if (path === '/me/password') {
    if (b.current !== me.password) fail(400, 'La contraseña actual no coincide.');
    if (String(b.next || '').length < 10) fail(422, 'La nueva contraseña necesita al menos 10 caracteres.');
    me.password = b.next; return { ok: true };
  }
  fail(404, 'No existe esa ruta.');
}

// ── Entradas ───────────────────────────────────────────
const tick = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 120));
window.__SAMADHI_API = async (url, { method = 'GET', body } = {}) => {
  await tick();
  const u = new URL(url, 'https://demo.local');
  // Probador con IA: en la demo de Vercel lo genera la función /api/probador (Google Gemini).
  if (u.pathname === '/api/tryon' && method === 'POST' && S.settings.tryon.engine === 'gemini') {
    const b = body || {}, p = S.products.find((x) => x.id === Number(b.productId));
    if (S.settings.tryon.requireLogin !== false && !customerMe() && !S.session.staff) { const err = new Error('Para usar el probador virtual ingresá a tu cuenta (o creala, es gratis).'); err.data = { code: 'login' }; err.status = 401; throw err; }
    if (!p) { const err = new Error('No encontramos esa prenda.'); err.status = 404; throw err; }
    let r, d = {};
    try { r = await fetch('/api/probador', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: b.photo, photoSize: b.photoSize, garmentUrl: b.garmentUrl, kind: b.kind || S.garments[p.id]?.kind, name: p.name }) }); d = await r.json().catch(() => ({})); }
    catch { r = null; }
    if (!r || r.status === 404 || r.status === 405 || d.code === 'sin-clave') { const err = new Error('El probador con IA no está disponible acá.'); err.data = { code: 'sin-ia' }; err.status = 503; throw err; }
    if (!r.ok || !d.image) { const err = new Error(d.error || 'No pudimos generar la imagen.'); err.data = { code: d.code, detail: d.detail || `${r.status}` }; err.status = r.status; throw err; }
    const id = token(); const log = { id: S.tryons.length + 1, at: sqlDate(), product_id: p.id, status: 'lista', ms: 0, added: 0, customer_id: customerMe()?.id || null };
    S.tryons.push(log); tryJobs.set(id, { at: 0, log: log.id, image: d.image }); save();
    return { id };
  }
  try { const out = storeRoute(method, u.pathname, u.searchParams, body || {}); save(); return structuredClone(out); }
  catch (e) { if (e instanceof ApiError) { const err = new Error(e.message); err.data = e.data; err.status = e.status; throw err; } throw e; }
};
window.__SAMADHI_ADMIN_API = async (path, { method = 'GET', body, raw } = {}) => {
  await tick();
  const u = new URL(path, 'https://demo.local');
  try { const out = adminRoute(method, u.pathname, u.searchParams, body || {}, raw); save(); return out === undefined ? {} : JSON.parse(JSON.stringify(out)); }
  catch (e) { if (e instanceof ApiError) { const err = new Error(e.message); err.status = e.status; throw err; } throw e; }
};
