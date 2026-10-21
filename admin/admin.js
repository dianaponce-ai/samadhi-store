// Panel de administración de Samadhi Style
// Se puede montar dentro de otra página (vista previa): window.__ADMIN_EMBED = { root, api, exit, link }.
const EMBED = window.__ADMIN_EMBED || null;
const ROOT = EMBED?.root || document;
const $ = (s, el = ROOT) => el.querySelector(s);
const $$ = (s, el = ROOT) => [...el.querySelectorAll(s)];
let ME = { role: 'admin' };
const isAdmin = () => ME.role === 'admin';
let embedHash = 'resumen';
const currentHash = () => (EMBED ? embedHash : location.hash.slice(1));
function navTo(h) {
  if (EMBED) { embedHash = h; route(); } else location.hash = h;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const num = (n) => Number(n || 0).toLocaleString('es-AR');
const date = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z')).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const day = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '');
const thumb = (u) => (u || '').replace(/-1024-1024\.webp$/, '-320-0.webp');

let toastT;
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2600);
}

async function api(path, { method = 'GET', body, raw, type } = {}) {
  const opts = { method, headers: { 'x-samadhi-admin': '1' } };
  if (raw) { opts.body = raw; opts.headers['Content-Type'] = type || 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  if (EMBED) return EMBED.api(path, { method, body, raw, type });
  const res = await fetch('/api/admin' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error(data.error || 'Tu sesión venció.'); }
  if (!res.ok) throw new Error(data.error || 'No se pudo completar. Probá de nuevo.');
  return data;
}

// ── Sesión ───────────────────────────────────────────────
async function showLogin() {
  if (EMBED) return EMBED.exit();
  $('#app').hidden = true; $('#login').hidden = false;
  try { const r = await fetch('/api/admin/setup-needed').then((r) => r.json()); $('#lHint').hidden = !r.needed; } catch {}
  $('#lEmail').focus();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#lErr').textContent = '';
  try {
    await api('/login', { method: 'POST', body: { email: $('#lEmail').value, password: $('#lPass').value } });
    $('#lPass').value = '';
    boot();
  } catch (err) { $('#lErr').textContent = err.message; }
});
$('#logout').addEventListener('click', async () => {
  if (EMBED) return EMBED.exit(true);
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
});
// Links internos del panel (#seccion) y links a la tienda o a archivos.
ROOT.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (href.startsWith('#') && EMBED) { e.preventDefault(); navTo(href.slice(1)); }
  else if (href.startsWith('/') && EMBED) { e.preventDefault(); const msg = EMBED.link(href); if (msg) toast(msg); }
});

// ── Navegación ───────────────────────────────────────────
const SECTIONS = [
  ['resumen', 'Resumen'], ['estadisticas', 'Estadísticas'], ['pedidos', 'Pedidos'], ['productos', 'Productos'], ['stock', 'Stock y precios'],
  ['categorias', 'Categorías'], ['clientes', 'Clientes'], ['carritos', 'Carritos'], ['probador', 'Probador IA'], ['lince', 'Lince'], ['arrepentimientos', 'Arrepentimientos'], ['cupones', 'Cupones'], ['banners', 'Banners'], ['contenido', 'Contenido'],
  ['emails', 'Emails'], ['importar', 'Importar'], ['configuracion', 'Configuración'], ['usuarios', 'Usuarios'],
];
// Secciones que solo ve el rol Administrador. El gerente maneja pedidos, catálogo, clientes, cupones y banners.
const ADMIN_ONLY = new Set(['contenido', 'emails', 'importar', 'configuracion', 'usuarios']);
let toShip = 0;
function renderNav(active) {
  $('#nav').innerHTML = SECTIONS.filter(([k]) => isAdmin() || !ADMIN_ONLY.has(k)).map(([k, l]) => `<button data-nav="${k}" ${k === active ? 'aria-current="page"' : ''}>${l}${k === 'pedidos' && toShip ? `<span class="count">${toShip}</span>` : ''}</button>`).join('');
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (b) navTo(b.dataset.nav); });
if (!EMBED) window.addEventListener('hashchange', route);

function route() {
  let [sec = 'resumen', id] = currentHash().split('/');
  if (ADMIN_ONLY.has(sec) && !isAdmin()) sec = 'resumen';
  const map = { pedido: 'pedidos', producto: 'productos', cliente: 'clientes' };
  renderNav(map[sec] || sec);
  const view = $('#view');
  view.onchange = null;
  view.innerHTML = '<p class="muted">Cargando…</p>';
  const fn = {
    resumen: viewDashboard, pedidos: viewOrders, pedido: () => viewOrder(id), productos: viewProducts, producto: () => viewProduct(id),
    stock: viewStock, categorias: viewCategories, clientes: viewCustomers, cliente: () => viewCustomer(id), cupones: viewCoupons,
    banners: viewBanners, importar: viewImport, configuracion: viewSettings, usuarios: viewUsers, emails: viewEmails, carritos: viewCarts, lince: viewLince, estadisticas: viewStats, contenido: viewContent, probador: viewTryon, arrepentimientos: viewWithdrawals,
  }[sec] || viewDashboard;
  Promise.resolve(fn()).catch((err) => { view.innerHTML = `<div class="notice">${esc(err.message)}</div>`; });
  view.focus({ preventScroll: true });
  if (EMBED) EMBED.scrollTop?.(); else window.scrollTo(0, 0);
}

const STATUS = { pending_payment: 'Esperando pago', paid: 'Pagado', preparing: 'En preparación', ready_pickup: 'Listo para retirar', shipped: 'Despachado', delivered: 'Entregado', cancelled: 'Cancelado', refunded: 'Devuelto' };
const pill = (s) => `<span class="pill s-${s}">${STATUS[s] || s}</span>`;
const METHOD = { andreani_domicilio: 'Andreani · domicilio', andreani_sucursal: 'Andreani · sucursal', retiro: 'Retiro' };

// Confirmación en la página (el panel no usa ventanas emergentes).
function confirmInline(anchor, message, onYes, yesLabel = 'Confirmar') {
  const box = document.createElement('div');
  box.className = 'confirm';
  box.innerHTML = `<span>${esc(message)}</span><button class="btn sm danger" data-yes>${esc(yesLabel)}</button><button class="btn sm" data-no>Cancelar</button>`;
  anchor.after(box);
  anchor.hidden = true;
  box.querySelector('[data-no]').onclick = () => { box.remove(); anchor.hidden = false; };
  box.querySelector('[data-yes]').onclick = async () => { box.querySelectorAll('button').forEach((b) => (b.disabled = true)); try { await onYes(); } finally { box.remove(); anchor.hidden = false; } };
}

// ── Resumen ──────────────────────────────────────────────
async function viewDashboard() {
  const d = await api('/dashboard');
  toShip = d.toShip; renderNav('resumen');
  const days = [];
  for (let i = 29; i >= 0; i--) { const dt = new Date(Date.now() - i * 864e5); days.push(dt.toISOString().slice(0, 10)); }
  const byDay = Object.fromEntries(d.daily.map((r) => [r.day, r.total]));
  const max = Math.max(1, ...days.map((k) => byDay[k] || 0));
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Resumen</h1><div class="sub">${num(d.catalog.visible)} productos publicados · ${num(d.catalog.soldOut)} agotados</div></div>
      <div class="actions"><a class="btn primary" href="#pedidos">${d.toShip ? `Despachar ${d.toShip} pedido${d.toShip > 1 ? 's' : ''}` : 'Ver pedidos'}</a></div></div>
    <div class="grid g4">
      <div class="card kpi accent"><div class="l">Para despachar</div><div class="v">${num(d.toShip)}</div><div class="l">pagados sin enviar</div></div>
      <div class="card kpi"><div class="l">Ventas hoy</div><div class="v">${fmt(d.today.total)}</div><div class="l">${num(d.today.orders)} pedidos</div></div>
      <div class="card kpi"><div class="l">Últimos 7 días</div><div class="v">${fmt(d.week.total)}</div><div class="l">${num(d.week.orders)} pedidos</div></div>
      <div class="card kpi"><div class="l">Últimos 30 días</div><div class="v">${fmt(d.month.total)}</div><div class="l">${num(d.month.orders)} pedidos · ticket ${fmt(d.month.orders ? d.month.total / d.month.orders : 0)}</div></div>
    </div>
    <div class="grid g3" style="margin-top:14px">
      <div class="card"><h2>Ventas por día · 30 días</h2>
        <div class="bars" role="img" aria-label="Ventas diarias de los últimos 30 días">${days.map((k) => `<div style="height:${((byDay[k] || 0) / max) * 100}%" title="${day(k)}: ${fmt(byDay[k] || 0)}"></div>`).join('')}</div>
        <div class="bars-x"><span>${day(days[0])}</span><span>${day(days[14])}</span><span>hoy</span></div>
      </div>
      <div class="card"><h2>Más vendidos · 30 días</h2>${d.top.length ? `<table>${d.top.map((t) => `<tr><td>${esc(t.name)}</td><td class="r n">${t.qty} u.</td></tr>`).join('')}</table>` : '<p class="muted">Todavía no hay ventas en este período.</p>'}</div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h2>Últimos pedidos</h2>${d.recent.length ? `<table>${d.recent.map((o) => `<tr class="click" data-href="#pedido/${o.id}"><td><b>${esc(o.number)}</b><div class="small muted">${esc(o.name)}</div></td><td>${pill(o.status)}</td><td class="r n">${fmt(o.total)}</td></tr>`).join('')}</table>` : '<p class="muted">Cuando entre el primer pedido lo vas a ver acá.</p>'}</div>
      <div class="card"><h2>Por agotarse</h2>${d.lowStock.length ? `<table>${d.lowStock.map((v) => `<tr class="click" data-href="#producto/${v.product_id}"><td>${esc(v.name)}<div class="small muted">${esc([v.color, v.size].filter(Boolean).join(' · '))}</div></td><td class="r"><span class="pill s-low">${v.stock} u.</span></td></tr>`).join('')}</table>` : '<p class="muted">Ninguna variante publicada tiene 1 o 2 unidades.</p>'}</div>
    </div>`;
}
ROOT.addEventListener('click', (e) => { const r = e.target.closest('[data-href]'); if (r && !e.target.closest('button, a, input')) navTo(r.dataset.href.slice(1)); });

// ── Pedidos ──────────────────────────────────────────────
const ordersState = { status: '', q: '', page: 1 };
async function viewOrders() {
  const qs = new URLSearchParams({ status: ordersState.status, q: ordersState.q, page: ordersState.page });
  const d = await api('/orders?' + qs);
  const dash = await api('/dashboard'); toShip = dash.toShip; renderNav('pedidos');
  const counts = dash.byStatus;
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Pedidos</h1><div class="sub">${num(d.total)} ${ordersState.status ? STATUS[ordersState.status].toLowerCase() : 'en total'}</div></div>
      <div class="actions"><a class="btn" href="/api/admin/orders.csv">Descargar planilla</a></div></div>
    <div class="tabs">${[['', 'Todos'], ...Object.entries(STATUS)].map(([k, l]) => `<button class="${ordersState.status === k ? 'on' : ''}" data-st="${k}">${l}${k && counts[k] ? `<span class="c">${counts[k]}</span>` : ''}</button>`).join('')}</div>
    <div class="toolbar"><input id="oq" type="search" placeholder="Buscar por número, nombre, email o envío" value="${esc(ordersState.q)}"></div>
    ${d.rows.length ? `<div class="tablewrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Clienta</th><th>Entrega</th><th>Estado</th><th class="r">Total</th></tr></thead><tbody>
      ${d.rows.map((o) => `<tr class="click" data-href="#pedido/${o.id}"><td><b>${esc(o.number)}</b><div class="small muted">${o.units} u.</div></td><td class="small">${date(o.created_at)}</td>
        <td>${esc(o.name)}<div class="small muted">${esc(o.email)}</div></td><td class="small">${METHOD[o.shipping_method] || ''}${o.andreani_number ? `<div class="muted">${esc(o.andreani_number)}</div>` : ''}</td>
        <td>${pill(o.status)}</td><td class="r n">${fmt(o.total)}</td></tr>`).join('')}</tbody></table></div>
      ${d.total > 50 ? `<div class="actions" style="margin-top:12px">${ordersState.page > 1 ? '<button class="btn" data-pg="-1">Anteriores</button>' : ''}${ordersState.page * 50 < d.total ? '<button class="btn" data-pg="1">Siguientes</button>' : ''}</div>` : ''}`
      : '<div class="card empty">No hay pedidos con ese filtro.</div>'}`;
  $$('[data-st]').forEach((b) => (b.onclick = () => { ordersState.status = b.dataset.st; ordersState.page = 1; viewOrders(); }));
  $$('[data-pg]').forEach((b) => (b.onclick = () => { ordersState.page += Number(b.dataset.pg); viewOrders(); }));
  let t; $('#oq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { ordersState.q = e.target.value; ordersState.page = 1; viewOrders().then(() => { const i = $('#oq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); };
}

const NEXT = {
  pending_payment: [['paid', 'Marcar como pagado'], ['cancelled', 'Cancelar pedido']],
  paid: [['preparing', 'Pasar a preparación']],
  preparing: [],
  ready_pickup: [['delivered', 'Marcar entregado']],
  shipped: [['delivered', 'Marcar entregado']],
  delivered: [],
  cancelled: [],
  refunded: [],
};
async function viewOrder(id) {
  const o = await api('/orders/' + id);
  const a = o.shipping_address;
  const isAndreani = o.shipping_method.startsWith('andreani');
  const next = [...NEXT[o.status]];
  if (o.status === 'preparing' || o.status === 'paid') next.push(isAndreani ? ['shipped', 'Marcar despachado'] : ['ready_pickup', 'Listo para retirar']);
  $('#view').innerHTML = `
    <div class="page-head"><div><a class="small linkish" href="#pedidos">← Pedidos</a><h1 style="margin-top:8px">${esc(o.number)}</h1><div class="sub">${date(o.created_at)} · ${pill(o.status)}</div></div>
      <div class="actions" id="stActions">${next.map(([s, l]) => `<button class="btn ${s === 'cancelled' ? 'danger' : 'primary'}" data-set="${s}">${l}</button>`).join('')}</div></div>
    ${o.events.some((e) => e.kind === 'alert') ? `<div class="notice" style="margin-bottom:14px">${o.events.filter((e) => e.kind === 'alert').map((e) => esc(e.message)).join('<br>')}</div>` : ''}
    <div class="grid g3">
      <div class="grid" style="align-content:start">
        <div class="card"><h2>Prendas</h2><table>${o.items.map((i) => `<tr><td style="width:52px">${i.image ? `<img class="thumb" src="${esc(thumb(i.image))}" alt="">` : ''}</td><td>${esc(i.name)}<div class="small muted">${esc(i.variant_label)}${i.sku ? ' · ' + esc(i.sku) : ''}</div></td><td class="n">${i.qty} × ${fmt(i.unit_price)}</td><td class="r n">${fmt(i.qty * i.unit_price)}</td></tr>`).join('')}
          <tr><td></td><td colspan="2" class="muted">Productos</td><td class="r n">${fmt(o.subtotal)}</td></tr>
          ${o.discount ? `<tr><td></td><td colspan="2" class="muted">Cupón ${esc(o.coupon_code)}</td><td class="r n">− ${fmt(o.discount)}</td></tr>` : ''}
          <tr><td></td><td colspan="2" class="muted">Envío</td><td class="r n">${fmt(o.shipping_cost)}</td></tr>
          <tr><td></td><td colspan="2"><b>Total</b></td><td class="r n"><b>${fmt(o.total)}</b></td></tr></table></div>
        <div class="card"><h2>Envío</h2>
          <dl class="kv"><dt>Entrega</dt><dd>${esc(o.methodLabel)}</dd>
          ${o.shipping_method === 'andreani_domicilio' ? `<dt>Dirección</dt><dd>${esc(`${a.calle} ${a.numero}${a.piso ? ', piso ' + a.piso : ''}${a.depto ? ' ' + a.depto : ''}`)}<br>${esc(`${a.cp} ${a.localidad}, ${a.provincia}`)}${a.referencia ? `<br><span class="muted">${esc(a.referencia)}</span>` : ''}</dd>` : ''}
          ${o.shipping_method === 'andreani_sucursal' ? `<dt>Sucursal</dt><dd>${esc(o.shipping_branch)} · CP ${esc(a.cp)}</dd>` : ''}
          ${o.andreani_number ? `<dt>N.º Andreani</dt><dd><b>${esc(o.andreani_number)}</b> · <a class="linkish" href="${esc(o.trackingUrl)}" target="_blank" rel="noopener">seguimiento</a></dd>` : ''}
          ${o.tracking_status ? `<dt>Último estado</dt><dd>${esc(o.tracking_status)}</dd>` : ''}</dl>
          ${isAndreani ? `<div class="actions" style="margin-top:14px">
            ${!o.andreani_number ? `<button class="btn primary" id="mkShip" ${['paid', 'preparing'].includes(o.status) ? '' : 'disabled'}>Crear envío en Andreani</button>${['paid', 'preparing'].includes(o.status) ? '' : '<span class="small muted">Se habilita cuando el pedido está pagado.</span>'}` : `
              <a class="btn primary" href="/api/admin/orders/${o.id}/label" target="_blank" rel="noopener">Imprimir etiqueta</a>
              <button class="btn" id="trk">Actualizar seguimiento</button>`}
          </div>` : ''}
          ${o.tracking_events.length ? `<ul class="timeline" style="margin-top:14px">${o.tracking_events.slice().reverse().map((e) => `<li><span class="small muted">${esc(String(e.fecha).replace('T', ' ').slice(0, 16))}</span><span>${esc(e.estado)}${e.sucursal ? ` · ${esc(e.sucursal)}` : ''}</span></li>`).join('')}</ul>` : ''}
        </div>
        <div class="card"><h2>Historial</h2><ul class="timeline">${o.events.map((e) => `<li><span class="small muted">${date(e.at)}</span><span class="k-${e.kind}">${esc(e.message)}</span></li>`).join('')}</ul></div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card"><h2>Clienta</h2><dl class="kv"><dt>Nombre</dt><dd><a class="linkish" href="#cliente/${o.customer_id}">${esc(o.name)}</a> <span class="small muted">(${o.customerOrders} pedido${o.customerOrders > 1 ? 's' : ''})</span></dd>
          <dt>Email</dt><dd>${esc(o.email)}</dd><dt>Teléfono</dt><dd>${esc(o.phone)}</dd><dt>DNI</dt><dd>${esc(o.dni)}</dd>
          ${o.customer_note ? `<dt>Mensaje</dt><dd>${esc(o.customer_note)}</dd>` : ''}</dl></div>
        <div class="card"><h2>Pago</h2><dl class="kv"><dt>${o.payment_method === 'transferencia' ? 'Transferencia' : 'Mercado Pago'}</dt><dd>${o.payment_method === 'transferencia' && o.status === 'pending_payment' ? 'Esperando el comprobante. Cuando llegue, tocá “Marcar como pagado”.' : esc(o.paymentLabel)}</dd>${o.payment_id ? `<dt>N.º de pago</dt><dd>${esc(o.payment_id)}</dd>` : ''}${o.payment_method ? `<dt>Medio</dt><dd>${esc(o.payment_method)}</dd>` : ''}${o.paid_at ? `<dt>Acreditado</dt><dd>${date(o.paid_at)}</dd>` : ''}</dl>
          <div class="actions" style="margin-top:12px">${o.payment_id && !o.payment_id.startsWith('SIM') ? '<button class="btn sm" id="syncPay">Consultar en Mercado Pago</button>' : ''}
          ${isAdmin() && o.paid_at && !['refunded', 'cancelled'].includes(o.status) ? '<button class="btn sm danger" id="refund">Devolver el dinero</button>' : ''}</div></div>
        <div class="card"><h2>Nota interna</h2><textarea id="note" rows="4" placeholder="Solo la ve el equipo.">${esc(o.internal_note)}</textarea><div class="actions" style="margin-top:8px"><button class="btn sm" id="saveNote">Guardar nota</button></div></div>
      </div>
    </div>`;
  const reload = () => viewOrder(id);
  const act = async (btn, fn, ok) => { btn.disabled = true; try { await fn(); toast(ok); reload(); } catch (e) { toast(e.message, true); btn.disabled = false; } };
  $$('[data-set]').forEach((b) => (b.onclick = () => {
    const go = () => act(b, () => api(`/orders/${id}/status`, { method: 'POST', body: { status: b.dataset.set } }), 'Pedido actualizado');
    if (b.dataset.set === 'cancelled') confirmInline(b, 'El pedido se cancela y, si había descontado stock, se repone.', go, 'Cancelar pedido'); else go();
  }));
  $('#mkShip')?.addEventListener('click', (e) => act(e.target, () => api(`/orders/${id}/shipment`, { method: 'POST' }), 'Envío creado en Andreani'));
  $('#trk')?.addEventListener('click', (e) => act(e.target, () => api(`/orders/${id}/tracking`, { method: 'POST' }), 'Seguimiento actualizado'));
  $('#syncPay')?.addEventListener('click', (e) => act(e.target, () => api(`/orders/${id}/sync-payment`, { method: 'POST' }), 'Pago consultado'));
  $('#saveNote').onclick = (e) => act(e.target, () => api(`/orders/${id}/note`, { method: 'POST', body: { note: $('#note').value } }), 'Nota guardada');
  $('#refund')?.addEventListener('click', (e) => confirmInline(e.target, `Se devuelven ${fmt(o.total)} por Mercado Pago y el stock vuelve a la tienda.`, () => act(e.target, () => api(`/orders/${id}/refund`, { method: 'POST', body: {} }), 'Devolución pedida'), 'Devolver'));
}

// ── Productos ────────────────────────────────────────────
const prodState = { q: '', category: '', visible: '', sel: new Set() };
async function viewProducts() {
  const qs = new URLSearchParams({ q: prodState.q, category: prodState.category, visible: prodState.visible });
  const d = await api('/products?' + qs);
  const stockCell = (p) => (p.unlimited ? '<span class="muted">sin límite</span>' : p.stock > 0 ? `${p.stock} u.` : '<span class="pill s-low">Agotado</span>');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Productos</h1><div class="sub">${d.rows.length} resultado${d.rows.length === 1 ? '' : 's'}</div></div><div class="actions"><a class="btn primary" href="#producto/nuevo">Nuevo producto</a></div></div>
    <div class="toolbar">
      <input id="pq" type="search" placeholder="Buscar por nombre o artículo" value="${esc(prodState.q)}">
      <select id="pcat"><option value="">Todas las categorías</option>${d.categories.map((c) => `<option value="${c.id}" ${String(c.id) === prodState.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="pvis"><option value="">Publicados y ocultos</option><option value="1" ${prodState.visible === '1' ? 'selected' : ''}>Publicados</option><option value="0" ${prodState.visible === '0' ? 'selected' : ''}>Ocultos</option></select>
    </div>
    <div class="toolbar" id="bulk" ${prodState.sel.size ? '' : 'hidden'}>
      <b id="selN">${prodState.sel.size} elegidos</b>
      <button class="btn sm" data-bulk="show">Publicar</button><button class="btn sm" data-bulk="hide">Ocultar</button>
      <button class="btn sm" data-bulk="feature">Destacar</button><button class="btn sm" data-bulk="unfeature">Quitar destacado</button>
      <input id="bpct" type="number" min="1" max="90" placeholder="% off" style="width:90px;min-width:0"><button class="btn sm" data-bulk="discount">Aplicar descuento</button>
      <button class="btn sm" data-bulk="clear-discount">Quitar descuento</button>
    </div>
    <div class="tablewrap"><table><thead><tr><th><input type="checkbox" id="selAll" aria-label="Elegir todos"></th><th></th><th>Producto</th><th>Colección</th><th class="r">Precio</th><th class="r">Stock</th><th>Estado</th></tr></thead><tbody>
    ${d.rows.map((p) => `<tr class="click" data-href="#producto/${p.id}"><td><input type="checkbox" data-sel="${p.id}" ${prodState.sel.has(p.id) ? 'checked' : ''} aria-label="Elegir ${esc(p.name)}"></td>
      <td style="width:52px">${p.image ? `<img class="thumb" src="${esc(thumb(p.image))}" alt="" loading="lazy">` : '<div class="thumb"></div>'}</td>
      <td><b>${esc(p.name)}</b><div class="small muted">${esc(p.ref_code || p.slug)} · ${p.variants} variantes</div></td>
      <td class="small">${esc(p.collection)}</td>
      <td class="r n">${fmt(p.price)}${p.list_price > p.price ? `<div class="small muted"><s>${fmt(p.list_price)}</s></div>` : ''}</td>
      <td class="r n">${stockCell(p)}</td>
      <td>${p.visible ? '<span class="pill s-delivered">Publicado</span>' : '<span class="pill s-cancelled">Oculto</span>'}${p.featured ? ' <span class="pill s-preparing">Destacado</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  let t;
  $('#pq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { prodState.q = e.target.value; viewProducts().then(() => { const i = $('#pq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); };
  $('#pcat').onchange = (e) => { prodState.category = e.target.value; viewProducts(); };
  $('#pvis').onchange = (e) => { prodState.visible = e.target.value; viewProducts(); };
  const syncBulk = () => { $('#bulk').hidden = !prodState.sel.size; $('#selN').textContent = `${prodState.sel.size} elegidos`; };
  $$('[data-sel]').forEach((c) => (c.onchange = () => { c.checked ? prodState.sel.add(Number(c.dataset.sel)) : prodState.sel.delete(Number(c.dataset.sel)); syncBulk(); }));
  $('#selAll').onchange = (e) => { $$('[data-sel]').forEach((c) => { c.checked = e.target.checked; e.target.checked ? prodState.sel.add(Number(c.dataset.sel)) : prodState.sel.delete(Number(c.dataset.sel)); }); syncBulk(); };
  $$('[data-bulk]').forEach((b) => (b.onclick = async () => {
    const action = b.dataset.bulk;
    const percent = Number($('#bpct').value);
    if (action === 'discount' && !(percent > 0)) return toast('Escribí el porcentaje de descuento.', true);
    try { const r = await api('/products/bulk', { method: 'POST', body: { ids: [...prodState.sel], action, percent } }); toast(`${r.count} productos actualizados`); prodState.sel.clear(); viewProducts(); }
    catch (e) { toast(e.message, true); }
  }));
}

async function viewProduct(id) {
  const isNew = id === 'nuevo';
  const cats = await api('/categories');
  const p = isNew ? { name: '', slug: '', ref_code: '', description: '', collection: '', visible: 1, featured: 0, free_shipping: 0, weight_kg: 0.5, height_cm: 5, width_cm: 30, depth_cm: 30, variants: [{ color: '', size: 'M', other: '', price: '', promo_price: '', stock: '', sku: '' }], images: [], categories: [], sold: 0 } : await api('/products/' + id);
  const state = { images: [...p.images], variants: p.variants.map((v) => ({ ...v })) };
  const vRow = (v, i) => `<tr data-vi="${i}"><td><input data-f="color" value="${esc(v.color)}" placeholder="Color"></td><td><input data-f="size" value="${esc(v.size)}" placeholder="Talle" style="width:70px"></td>
    <td><input data-f="other" value="${esc(v.other || '')}" placeholder="—"></td><td><input data-f="price" type="number" min="0" value="${v.price ?? ''}" style="width:110px"></td>
    <td><input data-f="promo_price" type="number" min="0" value="${v.promo_price ?? ''}" style="width:110px" placeholder="—"></td>
    <td><input data-f="stock" type="number" min="0" value="${v.stock ?? ''}" style="width:80px" placeholder="∞"></td><td><input data-f="sku" value="${esc(v.sku || '')}" style="width:110px"></td>
    <td><button class="btn sm" data-vdel="${i}" aria-label="Quitar variante">✕</button></td></tr>`;
  const imgsHTML = () => state.images.map((u, i) => `<div class="im ${i === 0 ? 'first' : ''}"><img src="${esc(thumb(u))}" alt=""><div class="ops"><button data-left="${i}" aria-label="Mover antes" ${i ? '' : 'disabled'}>←</button><button data-idel="${i}">Quitar</button><button data-right="${i}" aria-label="Mover después" ${i < state.images.length - 1 ? '' : 'disabled'}>→</button></div></div>`).join('') || '<p class="muted">Sin fotos todavía.</p>';
  $('#view').innerHTML = `
    <div class="page-head"><div><a class="small linkish" href="#productos">← Productos</a><h1 style="margin-top:8px">${isNew ? 'Nuevo producto' : esc(p.name)}</h1>${isNew ? '' : `<div class="sub">${p.sold} vendidos · <a class="linkish" href="/#p/${esc(p.slug)}" target="_blank" rel="noopener">ver en la tienda</a></div>`}</div>
      <div class="actions">${isNew || !isAdmin() ? '' : '<button class="btn danger" id="del">Eliminar</button>'}<button class="btn primary" id="save">Guardar</button></div></div>
    <p class="err" id="perr" role="alert"></p>
    <div class="grid g3">
      <div class="grid" style="align-content:start">
        <div class="card form"><h2>Datos</h2>
          <label class="fl"><span>Nombre</span><input id="p-name" value="${esc(p.name)}"></label>
          <div class="row"><label class="fl"><span>Artículo</span><input id="p-ref" value="${esc(p.ref_code)}" placeholder="S27VE66"></label><label class="fl"><span>Colección</span><input id="p-coll" value="${esc(p.collection)}" placeholder="SS'27"></label></div>
          <label class="fl"><span>Descripción y medidas</span><textarea id="p-desc" rows="7">${esc(p.description)}</textarea></label>
        </div>
        <div class="card"><h2>Fotos</h2><div class="imgs" id="imgs">${imgsHTML()}</div>
          <div class="toolbar" style="margin:14px 0 0"><input id="imgUrl" placeholder="Pegá el link de una foto"><button class="btn sm" id="addUrl">Agregar link</button>
          <label class="btn sm">Subir foto<input id="imgFile" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label></div></div>
        <div class="card"><h2>Variantes, precio y stock</h2><p class="hint" style="margin-bottom:10px">Stock vacío = sin límite. Precio promocional vacío = sin descuento.</p>
          <div class="tablewrap" style="border:0"><table class="vtable"><thead><tr><th>Color</th><th>Talle</th><th>Otro</th><th>Precio</th><th>Promo</th><th>Stock</th><th>SKU</th><th></th></tr></thead><tbody id="vrows">${state.variants.map(vRow).join('')}</tbody></table></div>
          <div class="actions" style="margin-top:10px"><button class="btn sm" id="addV">Agregar variante</button></div></div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card form"><h2>Publicación</h2>
          <label class="check"><input type="checkbox" id="p-vis" ${p.visible ? 'checked' : ''}> Publicado en la tienda</label>
          <label class="check"><input type="checkbox" id="p-feat" ${p.featured ? 'checked' : ''}> Destacado</label>
          <label class="check"><input type="checkbox" id="p-free" ${p.free_shipping ? 'checked' : ''}> Envío sin cargo</label>
        </div>
        <div class="card"><h2>Categorías</h2><div class="chips">${cats.map((c) => `<label><input type="checkbox" value="${c.id}" data-cat ${p.categories.includes(c.id) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}</div></div>
        <div class="card form"><h2>Paquete para Andreani</h2><div class="row">
          <label class="fl"><span>Peso (kg)</span><input id="p-w" type="number" step="0.05" value="${p.weight_kg}"></label><label class="fl"><span>Alto (cm)</span><input id="p-h" type="number" value="${p.height_cm}"></label>
          <label class="fl"><span>Ancho (cm)</span><input id="p-wi" type="number" value="${p.width_cm}"></label><label class="fl"><span>Largo (cm)</span><input id="p-d" type="number" value="${p.depth_cm}"></label></div></div>
        <div class="card form"><h2>Buscadores</h2><label class="fl"><span>Dirección (URL)</span><input id="p-slug" value="${esc(p.slug)}" placeholder="se arma con el nombre"></label>
          <label class="fl"><span>Título</span><input id="p-seot" value="${esc(p.seo_title || '')}"></label><label class="fl"><span>Descripción</span><textarea id="p-seod" rows="2">${esc(p.seo_description || '')}</textarea></label></div>
      </div>
    </div>`;
  const readVariants = () => { state.variants = $$('#vrows tr').map((tr) => { const i = Number(tr.dataset.vi); const v = { ...state.variants[i] }; $$('[data-f]', tr).forEach((inp) => (v[inp.dataset.f] = inp.value)); return v; }); };
  const redrawV = () => { $('#vrows').innerHTML = state.variants.map(vRow).join(''); };
  const redrawI = () => { $('#imgs').innerHTML = imgsHTML(); };
  $('#addV').onclick = () => { readVariants(); const last = state.variants[state.variants.length - 1] || {}; state.variants.push({ color: last.color || '', size: '', other: '', price: last.price || '', promo_price: last.promo_price || '', stock: '', sku: '' }); redrawV(); };
  $('#vrows').onclick = (e) => { const b = e.target.closest('[data-vdel]'); if (!b) return; readVariants(); state.variants.splice(Number(b.dataset.vdel), 1); redrawV(); };
  $('#imgs').onclick = (e) => {
    const t = e.target;
    if (t.dataset.idel) { state.images.splice(Number(t.dataset.idel), 1); redrawI(); }
    if (t.dataset.left) { const i = Number(t.dataset.left); [state.images[i - 1], state.images[i]] = [state.images[i], state.images[i - 1]]; redrawI(); }
    if (t.dataset.right) { const i = Number(t.dataset.right); [state.images[i + 1], state.images[i]] = [state.images[i], state.images[i + 1]]; redrawI(); }
  };
  $('#addUrl').onclick = () => { const u = $('#imgUrl').value.trim(); if (!/^https?:\/\/|^\/uploads\//.test(u)) return toast('Pegá un link que empiece con https://', true); state.images.push(u); $('#imgUrl').value = ''; redrawI(); };
  $('#imgFile').onchange = async (e) => {
    for (const f of e.target.files) {
      try { const r = await api('/uploads', { method: 'POST', raw: f, type: f.type }); state.images.push(r.url); redrawI(); }
      catch (err) { toast(err.message, true); }
    }
    e.target.value = '';
  };
  $('#save').onclick = async (e) => {
    readVariants();
    const body = {
      name: $('#p-name').value, ref_code: $('#p-ref').value, collection: $('#p-coll').value, description: $('#p-desc').value,
      visible: $('#p-vis').checked, featured: $('#p-feat').checked, free_shipping: $('#p-free').checked,
      categories: $$('[data-cat]:checked').map((c) => Number(c.value)), images: state.images, variants: state.variants,
      weight_kg: $('#p-w').value, height_cm: $('#p-h').value, width_cm: $('#p-wi').value, depth_cm: $('#p-d').value,
      slug: $('#p-slug').value, seo_title: $('#p-seot').value, seo_description: $('#p-seod').value,
    };
    e.target.disabled = true; $('#perr').textContent = '';
    try { const r = await api(isNew ? '/products' : '/products/' + id, { method: isNew ? 'POST' : 'PUT', body }); toast('Producto guardado'); if (isNew) navTo('producto/' + r.id); else viewProduct(id); }
    catch (err) { $('#perr').textContent = err.message; e.target.disabled = false; }
  };
  $('#del')?.addEventListener('click', (e) => confirmInline(e.target, 'Se borra el producto con sus variantes y fotos. Los pedidos viejos no cambian. Si solo querés sacarlo de la tienda, destildá "Publicado".', async () => {
    await api('/products/' + id, { method: 'DELETE' }); toast('Producto eliminado'); navTo('productos');
  }, 'Eliminar'));
}

// ── Stock y precios ──────────────────────────────────────
async function viewStock(q = '') {
  const d = await api('/stock?q=' + encodeURIComponent(q));
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Stock y precios</h1><div class="sub">Editá y salí del casillero: se guarda solo.</div></div></div>
    <div class="toolbar"><input id="sq" type="search" placeholder="Buscar producto o SKU" value="${esc(q)}"></div>
    <div class="tablewrap"><table><thead><tr><th>Producto</th><th>Variante</th><th class="r">Precio</th><th class="r">Promo</th><th class="r">Stock</th></tr></thead><tbody>
    ${d.rows.map((v) => `<tr><td>${esc(v.name)}${v.visible ? '' : ' <span class="small muted">(oculto)</span>'}</td><td class="small">${esc([v.color, v.size, v.other].filter(Boolean).join(' · ') || 'Única')}</td>
      <td class="r"><input class="inline-edit" type="number" min="0" data-v="${v.id}" data-k="price" value="${v.price}"></td>
      <td class="r"><input class="inline-edit" type="number" min="0" data-v="${v.id}" data-k="promo_price" value="${v.promo_price ?? ''}" placeholder="—"></td>
      <td class="r"><input class="inline-edit" type="number" min="0" data-v="${v.id}" data-k="stock" value="${v.stock ?? ''}" placeholder="∞" style="width:70px"></td></tr>`).join('')}
    </tbody></table></div>`;
  let t; $('#sq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => viewStock(e.target.value).then(() => { const i = $('#sq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 350); };
  $('#view').onchange = async (e) => {
    const inp = e.target.closest('[data-v]'); if (!inp) return;
    try { await api('/variants/' + inp.dataset.v, { method: 'PATCH', body: { [inp.dataset.k]: inp.value } }); inp.classList.add('saved'); setTimeout(() => inp.classList.remove('saved'), 900); }
    catch (err) { toast(err.message, true); }
  };
}

// ── Categorías ───────────────────────────────────────────
async function viewCategories() {
  const cats = await api('/categories');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Categorías</h1><div class="sub">El orden define cómo aparecen en la tienda.</div></div></div>
    <div class="card" style="margin-bottom:14px"><div class="toolbar" style="margin:0"><input id="cn" placeholder="Nueva categoría"><input id="cc" placeholder="Colección (opcional)" style="max-width:180px"><button class="btn primary" id="cadd">Agregar</button></div></div>
    <div class="tablewrap"><table><thead><tr><th>Orden</th><th>Nombre</th><th>Colección</th><th class="r">Productos</th><th>Visible</th><th></th></tr></thead><tbody>
    ${cats.map((c) => `<tr data-c="${c.id}"><td><input type="number" data-k="position" value="${c.position}" style="width:70px"></td><td><input data-k="name" value="${esc(c.name)}"></td>
      <td><input data-k="collection" value="${esc(c.collection)}" style="width:120px"></td><td class="r n">${c.products}</td><td><input type="checkbox" data-k="visible" ${c.visible ? 'checked' : ''} aria-label="Visible"></td>
      <td class="r"><button class="btn sm" data-csave>Guardar</button> <button class="btn sm danger" data-cdel>Borrar</button></td></tr>`).join('')}</tbody></table></div>`;
  $('#cadd').onclick = async () => { try { await api('/categories', { method: 'POST', body: { name: $('#cn').value, collection: $('#cc').value } }); toast('Categoría creada'); viewCategories(); } catch (e) { toast(e.message, true); } };
  $$('[data-csave]').forEach((b) => (b.onclick = async () => {
    const tr = b.closest('tr'); const g = (k) => tr.querySelector(`[data-k="${k}"]`);
    try { await api('/categories/' + tr.dataset.c, { method: 'PUT', body: { name: g('name').value, collection: g('collection').value, position: g('position').value, visible: g('visible').checked } }); toast('Categoría guardada'); } catch (e) { toast(e.message, true); }
  }));
  $$('[data-cdel]').forEach((b) => (b.onclick = () => confirmInline(b, 'Los productos quedan, solo se quita la categoría.', async () => { await api('/categories/' + b.closest('tr').dataset.c, { method: 'DELETE' }); toast('Categoría borrada'); viewCategories(); }, 'Borrar')));
}

// ── Clientes ─────────────────────────────────────────────
async function viewCustomers(q = '') {
  const d = await api('/customers?q=' + encodeURIComponent(q));
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Clientes</h1><div class="sub">${d.rows.length} personas compraron o iniciaron una compra</div></div></div>
    <div class="toolbar"><input id="cq" type="search" placeholder="Buscar por nombre, email o teléfono" value="${esc(q)}"></div>
    ${d.rows.length ? `<div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Contacto</th><th class="r">Pedidos</th><th class="r">Compró</th><th>Último pedido</th></tr></thead><tbody>
    ${d.rows.map((c) => `<tr class="click" data-href="#cliente/${c.id}"><td><b>${esc(c.name)}</b></td><td class="small">${esc(c.email)}<div class="muted">${esc(c.phone)}</div></td><td class="r n">${c.orders}</td><td class="r n">${fmt(c.spent)}</td><td class="small">${date(c.last_order)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="card empty">Todavía no hay clientes.</div>'}`;
  let t; $('#cq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => viewCustomers(e.target.value).then(() => { const i = $('#cq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 300); };
}
async function viewCustomer(id) {
  const c = await api('/customers/' + id);
  $('#view').innerHTML = `
    <div class="page-head"><div><a class="small linkish" href="#clientes">← Clientes</a><h1 style="margin-top:8px">${esc(c.name)}</h1><div class="sub">Desde ${date(c.created_at)}</div></div></div>
    <div class="grid g3"><div class="tablewrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th class="r">Total</th></tr></thead><tbody>
      ${c.orders.map((o) => `<tr class="click" data-href="#pedido/${o.id}"><td><b>${esc(o.number)}</b></td><td class="small">${date(o.created_at)}</td><td>${pill(o.status)}</td><td class="r n">${fmt(o.total)}</td></tr>`).join('')}</tbody></table></div>
    <div class="grid" style="align-content:start"><div class="card"><h2>Contacto</h2><dl class="kv"><dt>Email</dt><dd>${esc(c.email)}</dd><dt>Teléfono</dt><dd>${esc(c.phone)}</dd><dt>DNI</dt><dd>${esc(c.dni)}</dd></dl></div>
    <div class="card"><h2>Notas</h2><textarea id="cnotes" rows="4" placeholder="Talles, preferencias, lo que sirva para atenderla mejor.">${esc(c.notes)}</textarea><div class="actions" style="margin-top:8px"><button class="btn sm" id="csave">Guardar</button></div></div></div></div>`;
  $('#csave').onclick = async () => { try { await api('/customers/' + id, { method: 'PUT', body: { notes: $('#cnotes').value } }); toast('Notas guardadas'); } catch (e) { toast(e.message, true); } };
}

// ── Cupones ──────────────────────────────────────────────
const KIND = { percent: '% de descuento', fixed: 'Monto fijo', free_shipping: 'Envío sin cargo' };
async function viewCoupons(editId = null) {
  const list = await api('/coupons');
  const c = list.find((x) => x.id === editId) || { code: '', kind: 'percent', value: 10, min_subtotal: 0, max_uses: '', starts_at: '', ends_at: '', active: 1 };
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Cupones</h1></div></div>
    <div class="grid g3">
      <div>${list.length ? `<div class="tablewrap"><table><thead><tr><th>Código</th><th>Descuento</th><th>Desde</th><th class="r">Usos</th><th>Vigencia</th><th></th></tr></thead><tbody>
        ${list.map((x) => `<tr><td><b>${esc(x.code)}</b> ${x.active ? '' : '<span class="pill s-cancelled">Pausado</span>'}</td><td>${x.kind === 'percent' ? x.value + '%' : x.kind === 'fixed' ? fmt(x.value) : 'Envío gratis'}</td>
          <td class="n">${x.min_subtotal ? fmt(x.min_subtotal) : '—'}</td><td class="r n">${x.uses}${x.max_uses ? ' / ' + x.max_uses : ''}</td><td class="small">${x.starts_at || '…'} → ${x.ends_at || '…'}</td>
          <td class="r"><button class="btn sm" data-edit="${x.id}">Editar</button> <button class="btn sm danger" data-cdel="${x.id}">Borrar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">Todavía no hay cupones.</div>'}</div>
      <form class="card form" id="cform" novalidate><h2>${editId ? 'Editar cupón' : 'Nuevo cupón'}</h2>
        <label class="fl"><span>Código</span><input id="k-code" value="${esc(c.code)}" placeholder="SAMADHI10" style="text-transform:uppercase"></label>
        <label class="fl"><span>Tipo</span><select id="k-kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="row"><label class="fl"><span>Valor</span><input id="k-val" type="number" min="0" value="${c.value}"></label><label class="fl"><span>Compra mínima</span><input id="k-min" type="number" min="0" value="${c.min_subtotal}"></label></div>
        <div class="row"><label class="fl"><span>Desde</span><input id="k-from" type="date" value="${c.starts_at || ''}"></label><label class="fl"><span>Hasta</span><input id="k-to" type="date" value="${c.ends_at || ''}"></label></div>
        <label class="fl"><span>Usos máximos</span><input id="k-max" type="number" min="1" value="${c.max_uses ?? ''}" placeholder="Sin límite"></label>
        <label class="check"><input type="checkbox" id="k-act" ${c.active ? 'checked' : ''}> Activo</label>
        <p class="err" id="kerr"></p>
        <div class="actions"><button class="btn primary" type="submit">${editId ? 'Guardar cambios' : 'Crear cupón'}</button>${editId ? '<button class="btn" type="button" id="kcancel">Cancelar</button>' : ''}</div>
      </form>
    </div>`;
  $$('[data-edit]').forEach((b) => (b.onclick = () => viewCoupons(Number(b.dataset.edit))));
  $$('[data-cdel]').forEach((b) => (b.onclick = () => confirmInline(b, 'El cupón deja de funcionar.', async () => { await api('/coupons/' + b.dataset.cdel, { method: 'DELETE' }); toast('Cupón borrado'); viewCoupons(); }, 'Borrar')));
  $('#kcancel')?.addEventListener('click', () => viewCoupons());
  $('#cform').onsubmit = async (e) => {
    e.preventDefault();
    const body = { code: $('#k-code').value, kind: $('#k-kind').value, value: $('#k-val').value, min_subtotal: $('#k-min').value, max_uses: $('#k-max').value, starts_at: $('#k-from').value, ends_at: $('#k-to').value, active: $('#k-act').checked };
    try { await api(editId ? '/coupons/' + editId : '/coupons', { method: editId ? 'PUT' : 'POST', body }); toast('Cupón guardado'); viewCoupons(); } catch (err) { $('#kerr').textContent = err.message; }
  };
}

// ── Banners ──────────────────────────────────────────────
async function viewBanners(editId = null) {
  const list = await api('/banners');
  const b = list.find((x) => x.id === editId) || { eyebrow: '', title: '', subtitle: '', cta_label: 'Ver más', cta_link: '#tienda', image_url: '', video_url: '', tone: 'dark', active: 1 };
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Banners</h1><div class="sub">Se recorren en vertical en la portada, en este orden.</div></div></div>
    <div class="grid g3">
      <div class="grid" style="align-content:start">${list.map((x, i) => `<div class="card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <img class="banner-prev" src="${esc(thumb(x.image_url))}" alt="">
        <div style="flex:1;min-width:160px"><div class="small muted">${String(i + 1).padStart(2, '0')} · ${esc(x.eyebrow)}</div><div style="font-family:var(--display);font-size:24px">${esc(x.title)}</div><div class="small muted">${esc(x.subtitle)}</div>${x.active ? '' : '<span class="pill s-cancelled">Pausado</span>'}</div>
        <div class="actions"><button class="btn sm" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button class="btn sm" data-down="${i}" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Bajar">↓</button><button class="btn sm" data-edit="${x.id}">Editar</button><button class="btn sm danger" data-bdel="${x.id}">Borrar</button></div></div>`).join('') || '<div class="card empty">Sin banners. La portada arranca directo en la tienda.</div>'}</div>
      <form class="card form" id="bform" novalidate><h2>${editId ? 'Editar banner' : 'Nuevo banner'}</h2>
        <label class="fl"><span>Antetítulo</span><input id="b-eye" value="${esc(b.eyebrow)}" placeholder="Colección SS'27"></label>
        <label class="fl"><span>Título</span><input id="b-title" value="${esc(b.title)}"></label>
        <label class="fl"><span>Bajada</span><input id="b-sub" value="${esc(b.subtitle)}"></label>
        <div class="row"><label class="fl"><span>Botón</span><input id="b-cta" value="${esc(b.cta_label)}"></label><label class="fl"><span>Lleva a</span><input id="b-link" value="${esc(b.cta_link)}" placeholder="#c/vestidos"></label></div>
        <p class="hint">Para abrir una categoría usá <code>#c/</code> y su nombre (por ejemplo <code>#c/denim</code>). Para un producto, <code>#p/</code> y su dirección.</p>
        <label class="fl"><span>Foto (link)</span><input id="b-img" value="${esc(b.image_url)}"></label>
        <label class="fl"><span>Video (link .mp4, opcional · la foto queda de portada mientras carga)</span><input id="b-vid" value="${esc(b.video_url || '')}" placeholder="/media/hero.mp4"></label>
        <label class="btn sm" style="justify-self:start">Subir foto<input id="b-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
        <label class="fl"><span>Texto sobre la foto</span><select id="b-tone"><option value="dark" ${b.tone !== 'light' ? 'selected' : ''}>Claro sobre foto oscura</option><option value="light" ${b.tone === 'light' ? 'selected' : ''}>Oscuro sobre foto clara</option></select></label>
        <label class="check"><input type="checkbox" id="b-act" ${b.active ? 'checked' : ''}> Activo</label>
        <p class="err" id="berr"></p>
        <div class="actions"><button class="btn primary" type="submit">${editId ? 'Guardar cambios' : 'Crear banner'}</button>${editId ? '<button class="btn" type="button" id="bcancel">Cancelar</button>' : ''}</div>
      </form>
    </div>`;
  const order = async (from, to) => { const ids = list.map((x) => x.id); [ids[from], ids[to]] = [ids[to], ids[from]]; await api('/banners/order', { method: 'POST', body: { ids } }); viewBanners(editId); };
  $$('[data-up]').forEach((x) => (x.onclick = () => order(Number(x.dataset.up), Number(x.dataset.up) - 1)));
  $$('[data-down]').forEach((x) => (x.onclick = () => order(Number(x.dataset.down), Number(x.dataset.down) + 1)));
  $$('[data-edit]').forEach((x) => (x.onclick = () => viewBanners(Number(x.dataset.edit))));
  $$('[data-bdel]').forEach((x) => (x.onclick = () => confirmInline(x, 'El banner se quita de la portada.', async () => { await api('/banners/' + x.dataset.bdel, { method: 'DELETE' }); toast('Banner borrado'); viewBanners(); }, 'Borrar')));
  $('#bcancel')?.addEventListener('click', () => viewBanners());
  $('#b-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const r = await api('/uploads', { method: 'POST', raw: f, type: f.type }); $('#b-img').value = r.url; toast('Foto subida'); } catch (err) { toast(err.message, true); } };
  $('#bform').onsubmit = async (e) => {
    e.preventDefault();
    const body = { eyebrow: $('#b-eye').value, title: $('#b-title').value, subtitle: $('#b-sub').value, cta_label: $('#b-cta').value, cta_link: $('#b-link').value, image_url: $('#b-img').value, video_url: $('#b-vid').value, tone: $('#b-tone').value, active: $('#b-act').checked };
    try { await api(editId ? '/banners/' + editId : '/banners', { method: editId ? 'PUT' : 'POST', body }); toast('Banner guardado'); viewBanners(); } catch (err) { $('#berr').textContent = err.message; }
  };
}

// ── Importar ─────────────────────────────────────────────
function viewImport() {
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Importar productos</h1><div class="sub">Desde la exportación de Tiendanube.</div></div></div>
    <div class="card form" style="max-width:640px">
      <p>En Tiendanube entrá a <b>Productos → Exportar productos</b> y subí acá el archivo CSV. Se actualizan nombres, precios, promociones y stock por variante; los productos nuevos se agregan. Las fotos que ya cargaste en este panel no se tocan.</p>
      <label class="fl"><span>Archivo CSV</span><input id="csv" type="file" accept=".csv,text/csv"></label>
      <div class="actions"><button class="btn primary" id="imp">Importar</button></div>
      <div id="impres"></div>
    </div>`;
  $('#imp').onclick = async (e) => {
    const f = $('#csv').files[0];
    if (!f) return toast('Elegí el archivo CSV.', true);
    e.target.disabled = true; e.target.textContent = 'Importando…';
    try {
      const r = await api('/import', { method: 'POST', raw: f, type: 'text/csv' });
      $('#impres').innerHTML = `<div class="notice ok">Listo: ${r.products} productos (${r.created} nuevos, ${r.updated} actualizados, ${r.hidden} ocultos) y ${r.variants} variantes.</div>`;
    } catch (err) { $('#impres').innerHTML = `<div class="notice">${esc(err.message)}</div>`; }
    e.target.disabled = false; e.target.textContent = 'Importar';
  };
}

// ── Configuración ────────────────────────────────────────
async function viewSettings() {
  const s = await api('/settings');
  const I = s.integrations, st = s.store, sh = s.shipping, ck = s.checkout, pm = s.payments;
  const stat = (v, okWord = 'conectado') => (v === okWord || v === true ? `<span class="pill s-delivered">${v === true ? 'listo' : v}</span>` : `<span class="pill s-pending_payment">${v === false ? 'falta' : v}</span>`);
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Configuración</h1></div><div class="actions"><button class="btn primary" id="saveSet">Guardar cambios</button></div></div>
    <div class="grid g2">
      <div class="card form"><h2>Tienda</h2>
        <label class="fl"><span>Nombre</span><input data-s="store.name" value="${esc(st.name)}"></label>
        <label class="fl"><span>Frase</span><input data-s="store.tagline" value="${esc(st.tagline)}"></label>
        <label class="fl"><span>Barra de anuncios</span><input data-s="store.announcement" value="${esc(st.announcement)}"></label>
        <div class="row"><label class="fl"><span>Instagram</span><input data-s="store.instagram" value="${esc(st.instagram)}"></label><label class="fl"><span>WhatsApp</span><input data-s="store.whatsapp" value="${esc(st.whatsapp)}"></label></div>
        <label class="fl"><span>Email de contacto</span><input data-s="store.email" value="${esc(st.email)}"></label>
      </div>
      <div class="card form"><h2>Integraciones</h2>
        <dl class="kv"><dt>Mercado Pago</dt><dd>${stat(I.mercadopago)}${I.mercadopago === 'prueba' ? '<div class="small muted">Completá MP_ACCESS_TOKEN en el archivo .env para cobrar de verdad.</div>' : ''}</dd>
          <dt>Aviso de pagos</dt><dd>${stat(I.webhookSecret)}<div class="small muted">En Mercado Pago → Tus integraciones → Webhooks, pegá esta dirección y elegí el evento “Pagos”:</div>
            <div class="copyrow" style="margin-top:6px"><input readonly value="${esc(I.webhookUrl)}" id="wh"><button class="btn sm" id="copyWh">Copiar</button></div></dd>
          <dt>Andreani</dt><dd>${stat(I.andreani)}${I.andreani === 'prueba' ? '<div class="small muted">Completá las credenciales ANDREANI_* del .env. Mientras tanto se cotiza con una tabla de prueba.</div>' : `<div class="small muted">Contrato domicilio: ${I.andreaniContratos.domicilio ? 'sí' : 'falta'} · sucursal: ${I.andreaniContratos.sucursal ? 'sí' : 'falta'}</div>`}
            <div class="copyrow" style="margin-top:6px"><input id="tcp" placeholder="CP" value="1425" style="max-width:90px"><button class="btn sm" id="testAnd">Probar cotización</button></div><div class="small" id="testRes"></div></dd>
          <dt>Emails</dt><dd>${stat(I.email)}</dd>
          <dt>Sesiones</dt><dd>${stat(I.sessionSecret)}${I.sessionSecret ? '' : '<div class="small muted">Completá SESSION_SECRET para no tener que volver a entrar en cada reinicio.</div>'}</dd></dl>
      </div>
      <div class="card form"><h2>Envíos</h2>
        <label class="check"><input type="checkbox" data-s="shipping.andreaniDomicilio" ${sh.andreaniDomicilio ? 'checked' : ''}> Andreani a domicilio</label>
        <label class="check"><input type="checkbox" data-s="shipping.andreaniSucursal" ${sh.andreaniSucursal ? 'checked' : ''}> Andreani a sucursal</label>
        <label class="check"><input type="checkbox" data-s="shipping.pickupEnabled" ${sh.pickupEnabled ? 'checked' : ''}> Retiro en el local</label>
        <div class="row"><label class="fl"><span>Dirección de retiro</span><input data-s="shipping.pickupAddress" value="${esc(sh.pickupAddress)}"></label><label class="fl"><span>Horario</span><input data-s="shipping.pickupHours" value="${esc(sh.pickupHours)}"></label></div>
        <div class="row"><label class="fl"><span>Envío sin cargo desde ($)</span><input type="number" min="0" data-s="shipping.freeShippingFrom" value="${sh.freeShippingFrom}"><span class="help">0 = nunca</span></label>
          <label class="fl"><span>Recargo por embalaje ($)</span><input type="number" min="0" data-s="shipping.extraHandling" value="${sh.extraHandling}"></label></div>
      </div>
      <div class="card form"><h2>Origen de los envíos (Andreani)</h2>
        <div class="row"><label class="fl"><span>Calle</span><input data-s="shipping.origin.calle" value="${esc(sh.origin.calle)}"></label><label class="fl"><span>Altura</span><input data-s="shipping.origin.numero" value="${esc(sh.origin.numero)}"></label></div>
        <div class="row"><label class="fl"><span>Código postal</span><input data-s="shipping.origin.codigoPostal" value="${esc(sh.origin.codigoPostal)}"></label><label class="fl"><span>Localidad</span><input data-s="shipping.origin.localidad" value="${esc(sh.origin.localidad)}"></label></div>
        <div class="row"><label class="fl"><span>Remitente</span><input data-s="shipping.sender.nombreCompleto" value="${esc(sh.sender.nombreCompleto)}"></label><label class="fl"><span>CUIT</span><input data-s="shipping.sender.documentoNumero" value="${esc(sh.sender.documentoNumero)}"></label></div>
        <div class="row"><label class="fl"><span>Email remitente</span><input data-s="shipping.sender.email" value="${esc(sh.sender.email)}"></label><label class="fl"><span>Teléfono</span><input data-s="shipping.sender.telefono" value="${esc(sh.sender.telefono)}"></label></div>
      </div>
      <div class="card form"><h2>Pagos</h2>
        <label class="fl"><span>Cuotas máximas con Mercado Pago</span><input type="number" min="1" max="12" data-s="payments.installments" value="${pm.installments}"><span class="help">Que sean sin interés lo activás en tu cuenta de Mercado Pago (Promociones → Cuotas sin interés).</span></label>
        <label class="check"><input type="checkbox" data-s="payments.transferEnabled" ${pm.transferEnabled ? 'checked' : ''}> Aceptar transferencia bancaria</label>
        <div class="row"><label class="fl"><span>Descuento por transferencia (%)</span><input type="number" min="0" max="50" data-s="payments.transferDiscount" value="${pm.transferDiscount}"></label>
          <label class="fl"><span>Horas para transferir</span><input type="number" min="1" data-s="payments.transferHours" value="${pm.transferHours}"></label></div>
        <div class="row"><label class="fl"><span>Titular</span><input data-s="payments.bankHolder" value="${esc(pm.bankHolder)}"></label><label class="fl"><span>Banco</span><input data-s="payments.bankName" value="${esc(pm.bankName)}"></label></div>
        <div class="row"><label class="fl"><span>CBU / CVU</span><input data-s="payments.bankCbu" value="${esc(pm.bankCbu)}" inputmode="numeric"></label><label class="fl"><span>Alias</span><input data-s="payments.bankAlias" value="${esc(pm.bankAlias)}"></label></div>
        ${pm.transferEnabled && !(pm.bankCbu || pm.bankAlias) ? '<div class="notice">Cargá el CBU o el alias: es lo que ve la clienta después de comprar con transferencia.</div>' : ''}
      </div>
      <div class="card form"><h2>Checkout</h2>
        <label class="check"><input type="checkbox" data-s="checkout.requireDni" ${ck.requireDni ? 'checked' : ''}> Pedir DNI (Andreani lo necesita)</label>
        <div class="row"><label class="fl"><span>Prefijo de pedido</span><input data-s="checkout.orderPrefix" value="${esc(ck.orderPrefix)}"></label><label class="fl"><span>Próximo número</span><input type="number" data-s="checkout.nextOrderNumber" value="${ck.nextOrderNumber}"></label></div>
      </div>
      <div class="card"><h2>Últimos avisos de Mercado Pago</h2><div id="whlog" class="small muted">Cargando…</div></div>
    </div>`;
  $('#copyWh').onclick = async () => { try { await navigator.clipboard.writeText($('#wh').value); toast('Dirección copiada'); } catch { $('#wh').select(); } };
  $('#testAnd').onclick = async (e) => { e.target.disabled = true; try { const r = await api('/integrations/andreani/test', { method: 'POST', body: { cp: $('#tcp').value } }); $('#testRes').textContent = `Domicilio: ${fmt(r.cost)}${r.mock ? ' (tabla de prueba)' : ''}`; } catch (err) { $('#testRes').textContent = err.message; } e.target.disabled = false; };
  $('#saveSet').onclick = async (e) => {
    const out = {};
    $$('[data-s]').forEach((inp) => {
      const path = inp.dataset.s.split('.');
      let o = out;
      path.slice(0, -1).forEach((k) => (o = o[k] ||= {}));
      o[path.at(-1)] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Number(inp.value || 0) : inp.value;
    });
    out.shipping.origin = { ...sh.origin, ...out.shipping.origin };
    out.shipping.sender = { ...sh.sender, ...out.shipping.sender };
    e.target.disabled = true;
    try { await api('/settings', { method: 'PUT', body: out }); toast('Configuración guardada'); } catch (err) { toast(err.message, true); }
    e.target.disabled = false;
  };
  api('/webhooks').then((rows) => { $('#whlog').innerHTML = rows.length ? `<table>${rows.slice(0, 12).map((r) => `<tr><td>${date(r.at)}</td><td>${esc(r.result)}</td></tr>`).join('')}</table>` : 'Todavía no llegó ningún aviso.'; }).catch(() => {});
}

// ── Usuarios ─────────────────────────────────────────────
async function viewUsers() {
  const [{ users, roles }, me] = await Promise.all([api('/users'), api('/me')]);
  const roleOpts = (sel) => Object.entries(roles).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Usuarios del panel</h1><div class="sub">El gerente de tienda maneja pedidos, productos, stock, clientes, cupones y banners. Configuración, importación, devoluciones y usuarios quedan para administración.</div></div></div>
    <div class="grid g2">
      <div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
          <td>${u.id === me.id ? `<span class="pill s-paid">${esc(roles[u.role])}</span>` : `<select data-urole="${u.id}" aria-label="Rol de ${esc(u.name)}" style="width:auto">${roleOpts(u.role)}</select>`}</td>
          <td class="r">${u.id === me.id ? '<span class="small muted">Vos</span>' : `<button class="btn sm danger" data-udel="${u.id}">Quitar acceso</button>`}</td></tr>`).join('')}</tbody></table></div>
      <div class="grid" style="align-content:start">
        <form class="card form" id="uform" novalidate><h2>Dar acceso</h2>
          <label class="fl"><span>Nombre</span><input id="u-name"></label><label class="fl"><span>Email</span><input id="u-email" type="email"></label>
          <label class="fl"><span>Rol</span><select id="u-role">${roleOpts('manager')}</select></label>
          <label class="fl"><span>Contraseña inicial</span><input id="u-pass" type="password" autocomplete="new-password"><span class="help">Al menos 10 caracteres.</span></label>
          <p class="err" id="uerr"></p><div class="actions"><button class="btn primary" type="submit">Dar acceso</button></div></form>
        <form class="card form" id="pform" novalidate><h2>Cambiar mi contraseña</h2>
          <label class="fl"><span>Contraseña actual</span><input id="p-cur" type="password" autocomplete="current-password"></label>
          <label class="fl"><span>Nueva contraseña</span><input id="p-new" type="password" autocomplete="new-password"></label>
          <p class="err" id="pwerr"></p><div class="actions"><button class="btn" type="submit">Cambiar contraseña</button></div></form>
      </div>
    </div>`;
  $$('[data-urole]').forEach((sel) => (sel.onchange = async () => { try { await api('/users/' + sel.dataset.urole, { method: 'PUT', body: { role: sel.value } }); toast('Rol actualizado'); } catch (err) { toast(err.message, true); viewUsers(); } }));
  $$('[data-udel]').forEach((b) => (b.onclick = () => confirmInline(b, 'Esa persona ya no podrá entrar al panel.', async () => { await api('/users/' + b.dataset.udel, { method: 'DELETE' }); toast('Acceso quitado'); viewUsers(); }, 'Quitar acceso')));
  $('#uform').onsubmit = async (e) => { e.preventDefault(); try { await api('/users', { method: 'POST', body: { name: $('#u-name').value, email: $('#u-email').value, role: $('#u-role').value, password: $('#u-pass').value } }); toast('Acceso creado'); viewUsers(); } catch (err) { $('#uerr').textContent = err.message; } };
  $('#pform').onsubmit = async (e) => { e.preventDefault(); try { await api('/me/password', { method: 'POST', body: { current: $('#p-cur').value, next: $('#p-new').value } }); toast('Contraseña cambiada'); e.target.reset(); } catch (err) { $('#pwerr').textContent = err.message; } };
}

// ── Emails automáticos ───────────────────────────────────
// Muestra un email dentro de un Shadow DOM para que los estilos del panel no lo alteren.
function showEmail(container, subject, html) {
  container.innerHTML = `<div class="mail-subject"><span class="small muted">Asunto</span><b>${esc(subject)}</b></div><div class="mail-frame"></div>`;
  const frame = container.querySelector('.mail-frame');
  const sr = frame.attachShadow({ mode: 'open' });
  sr.innerHTML = `<style>:host{all:initial;display:block} img{max-width:100%}</style>${html.replace(/<!doctype[^>]*>|<\/?(html|head|body)[^>]*>|<meta[^>]*>|<title>.*?<\/title>/gi, '')}`;
  // Los links del email se pueden probar: el de "recuperar mi bolsa" arma la bolsa en la tienda.
  sr.addEventListener('click', (e) => {
    const a = e.composedPath().find((x) => x.tagName === 'A');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href') || '';
    const m = href.match(/[?&]carrito=([\w-]+)/);
    if (EMBED) { if (m && window.__SAMADHI_RECOVER_CART) { EMBED.exit?.(); window.__SAMADHI_RECOVER_CART(m[1]); } else toast('En la vista previa, este link no abre otra página.'); }
    else if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
  });
}
async function viewEmails() {
  const d = await api('/emails');
  const S = d.settings;
  const groups = Object.entries(d.groups).map(([g, label]) => {
    const list = d.templates.filter((t) => t.group === g);
    return `<div class="card"><h2>${esc(label)}</h2><div class="mail-list">${list.map((t) => `
      <div class="mail-row">
        <label class="switch" title="${t.enabled ? 'Activado' : 'Desactivado'}"><input type="checkbox" data-en="${t.key}" ${t.enabled ? 'checked' : ''} aria-label="Enviar ${esc(t.label)}"><span></span></label>
        <div class="mail-meta"><b>${esc(t.label)}</b><span class="small muted">${esc(t.when)} · Para: ${esc(t.to)}${t.marketing ? ' · con link de baja' : ''}</span></div>
        <div class="actions"><button class="btn sm" data-pv="${t.key}">Ver</button><button class="btn sm" data-test="${t.key}">Probar</button></div>
      </div>`).join('')}</div></div>`;
  }).join('');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Emails automáticos</h1><div class="sub">${d.templates.filter((t) => t.enabled).length} de ${d.templates.length} activados · se mandan solos según lo que pasa en la tienda</div></div>
      <div class="actions"><button class="btn" id="runJobs">Revisar recordatorios ahora</button></div></div>
    ${d.smtp ? '' : '<div class="notice" style="margin-bottom:14px">Todavía falta configurar el envío (SMTP_URL en el archivo .env). Mientras tanto los emails se generan y quedan en el historial, pero no salen.</div>'}
    <div class="grid g3">
      <div class="grid" style="align-content:start">${groups}</div>
      <div class="grid" style="align-content:start">
        <div class="card" id="pvCard"><h2>Vista previa</h2><div id="pvBox"><p class="muted">Tocá “Ver” en cualquier email para verlo como le llega a la clienta.</p></div></div>
        <form class="card form" id="mailSet" novalidate><h2>Tiempos de los recordatorios</h2>
          <div class="row"><label class="fl"><span>Carrito: primer aviso (horas después de dejar la bolsa)</span><input type="number" min="1" name="cartReminder1Hours" value="${S.cartReminder1Hours}"></label>
            <label class="fl"><span>Carrito: último aviso (horas después de dejar la bolsa)</span><input type="number" min="2" name="cartReminder2Hours" value="${S.cartReminder2Hours}"></label></div>
          <div class="row"><label class="fl"><span>Pago pendiente (horas)</span><input type="number" min="1" name="paymentReminderHours" value="${S.paymentReminderHours}"></label>
            <label class="fl"><span>Reserva por transferencia: avisar antes de vencer (horas)</span><input type="number" min="1" name="transferReminderHoursBefore" value="${S.transferReminderHoursBefore}"></label></div>
          <label class="fl"><span>Pedido sin retirar (días)</span><input type="number" min="1" name="pickupReminderDays" value="${S.pickupReminderDays}"></label>
          <label class="fl"><span>Avisos al equipo: emails</span><input name="staffEmails" value="${esc(S.staffEmails || '')}" placeholder="${esc(d.staffFallback || 'hola@samadhistyle.com.ar, ventas@…')}"><span class="help">Separados por coma. Reciben los pedidos nuevos, las reservas por transferencia y el stock bajo.</span></label>
          <div class="actions"><button class="btn primary" type="submit">Guardar tiempos</button></div>
        </form>
      </div>
    </div>
    <div class="card" style="margin-top:14px"><h2>Últimos emails</h2>
      ${d.log.length ? `<div class="tablewrap" style="border:0"><table><thead><tr><th>Fecha</th><th>Email</th><th>Para</th><th>Estado</th></tr></thead><tbody>
        ${d.log.map((l) => `<tr class="click" data-log="${l.id}"><td class="small">${date(l.at)}</td><td>${esc(d.templates.find((t) => t.key === l.template)?.label || l.template)}<div class="small muted">${esc(l.subject)}</div></td><td class="small">${esc(l.to_email)}</td><td><span class="pill ${l.status === 'enviado' ? 's-delivered' : l.status.startsWith('error') ? 's-low' : 's-pending_payment'}">${esc(l.status)}</span></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Todavía no se mandó ningún email.</p>'}
    </div>`;
  const pv = async (key) => { const r = await api('/emails/preview/' + key); showEmail($('#pvBox'), r.subject, r.html); $('#pvCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  $$('[data-pv]').forEach((b) => (b.onclick = () => pv(b.dataset.pv).catch((e) => toast(e.message, true))));
  $$('[data-test]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { const r = await api('/emails/test', { method: 'POST', body: { key: b.dataset.test } }); toast(r.status === 'enviado' ? `Te lo mandamos a ${ME.email}` : `Generado: ${r.status}`); viewEmails(); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  }));
  $$('[data-en]').forEach((c) => (c.onchange = async () => {
    try { await api('/emails', { method: 'PUT', body: { enabled: { [c.dataset.en]: c.checked } } }); toast(c.checked ? 'Email activado' : 'Email desactivado'); }
    catch (e) { toast(e.message, true); c.checked = !c.checked; }
  }));
  $$('[data-log]').forEach((tr) => (tr.onclick = async () => { const r = await api('/emails/log/' + tr.dataset.log); showEmail($('#pvBox'), r.subject, r.html); $('#pvCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }));
  $('#mailSet').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/emails', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Tiempos guardados'); } catch (err) { toast(err.message, true); }
  };
  $('#runJobs').onclick = async (e) => {
    e.target.disabled = true;
    try { const r = await api('/emails/run', { method: 'POST' }); const n = r.carts + r.payment + r.transfer + r.pickup; toast(n ? `Se mandaron ${n} recordatorios` : 'No había recordatorios pendientes'); viewEmails(); }
    catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
}

// ── Carritos ─────────────────────────────────────────────
const CART_ST = { active: ['Esperando', 's-pending_payment'], converted: ['Compró', 's-delivered'], expired: ['Vencida', 's-cancelled'], empty: ['Vaciada', 's-cancelled'] };
async function viewCarts() {
  const d = await api('/carts');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Carritos</h1><div class="sub">Bolsas de clientas que dejaron su email. Si no compran, les llega “Tenés un carrito esperándote”.</div></div></div>
    <div class="grid g4" style="margin-bottom:14px">
      <div class="card kpi accent"><div class="l">Esperando</div><div class="v">${num(d.stats.active)}</div><div class="l">bolsas sin comprar</div></div>
      <div class="card kpi"><div class="l">En bolsas</div><div class="v">${fmt(d.stats.activeValue)}</div><div class="l">valor a recuperar</div></div>
      <div class="card kpi"><div class="l">Recordadas</div><div class="v">${num(d.stats.reminded)}</div><div class="l">recibieron el email</div></div>
      <div class="card kpi"><div class="l">Recuperadas</div><div class="v">${num(d.stats.recovered)}</div><div class="l">compraron después del aviso</div></div>
    </div>
    ${d.rows.length ? `<div class="tablewrap"><table><thead><tr><th>Clienta</th><th>Prendas</th><th class="r">Total</th><th>Última actividad</th><th>Avisos</th><th>Estado</th></tr></thead><tbody>
      ${d.rows.map((c) => `<tr><td><b>${esc(c.name || '—')}</b><div class="small muted">${esc(c.email)}</div></td>
        <td><div class="cart-thumbs">${c.items.slice(0, 4).map((i) => `<img class="thumb" src="${esc(thumb(i.image))}" alt="${esc(i.name)}" title="${esc(i.name)} · ${esc(i.variant_label)}">`).join('')}</div><div class="small muted">${c.items.map((i) => esc(i.name)).join(', ')}</div></td>
        <td class="r n">${fmt(c.subtotal)}</td><td class="small">${date(c.updated_at)}</td><td class="n">${c.reminders}${c.last_reminder_at ? `<div class="small muted">${date(c.last_reminder_at)}</div>` : ''}</td>
        <td><span class="pill ${CART_ST[c.status]?.[1] || ''}">${CART_ST[c.status]?.[0] || c.status}</span>${c.order ? ` <a class="linkish small" href="#pedido/${c.order.id}">${esc(c.order.number)}</a>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="card empty">Todavía no hay bolsas guardadas. Se guardan cuando una clienta ingresa a su cuenta o escribe su email en el checkout.</div>'}`;
}

// ── Estadísticas ─────────────────────────────────────────
const AR_TODAY = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dAdd = (k, n) => new Date(Date.parse(k + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const PRESETS = [
  ['hoy', 'Hoy', (t) => [t, t]], ['ayer', 'Ayer', (t) => [dAdd(t, -1), dAdd(t, -1)]], ['7', '7 días', (t) => [dAdd(t, -6), t]], ['30', '30 días', (t) => [dAdd(t, -29), t]],
  ['mes', 'Este mes', (t) => [t.slice(0, 8) + '01', t]],
  ['mespasado', 'Mes pasado', (t) => { const f = t.slice(0, 8) + '01'; const e = dAdd(f, -1); return [e.slice(0, 8) + '01', e]; }],
  ['90', '90 días', (t) => [dAdd(t, -89), t]], ['anio', 'Este año', (t) => [t.slice(0, 4) + '-01-01', t]], ['12m', '12 meses', (t) => [dAdd(t, -364), t]],
];
let STATS_F = { preset: '30' };
const dShort = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dLong = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function delta(cur, prev, { invert = false, pct = false } = {}) {
  if (pct) { const d = Math.round((cur - prev) * 100); if (!d) return '<span class="delta">igual que antes</span>'; return `<span class="delta ${(d > 0) !== invert ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} pts</span>`; }
  if (!prev) return cur ? '<span class="delta">sin datos antes</span>' : '<span class="delta">—</span>';
  const d = Math.round(((cur - prev) / prev) * 100);
  if (!d) return '<span class="delta">igual que antes</span>';
  return `<span class="delta ${(d > 0) !== invert ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}%</span>`;
}
function barList(rows, { money = true, max = 8 } = {}) {
  if (!rows.length) return '<div class="empty small">Sin ventas en el período.</div>';
  const top = Math.max(...rows.map((x) => x.value)) || 1;
  const total = rows.reduce((a, x) => a + x.value, 0) || 1;
  return `<div class="hbars">${rows.slice(0, max).map((x) => `<div class="hbar" title="${esc(x.label)}: ${money ? fmt(x.value) : num(x.value)} · ${x.count} ${x.count === 1 ? 'pedido' : 'pedidos'}">
    <div class="hbar-t"><span>${esc(x.label)}</span><span class="n">${money ? fmt(x.value) : num(x.value)} <span class="muted">· ${Math.round((x.value / total) * 100)}%</span></span></div>
    <div class="hbar-track"><i style="width:${Math.max(1.5, (x.value / top) * 100)}%"></i></div></div>`).join('')}</div>`;
}
function salesChart(series, unit) {
  const W = 760, H = 220, L = 54, B = 26, T = 10, R = 8;
  const max = Math.max(...series.map((x) => x.revenue), 1);
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  const n = series.length, bw = (W - L - R) / n, gap = Math.min(2, bw * 0.2);
  const y = (v) => T + (H - T - B) * (1 - v / nice);
  const short = (v) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(v));
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(nice * f)}" y2="${y(nice * f)}" class="gl"/><text x="${L - 8}" y="${y(nice * f) + 4}" text-anchor="end" class="ax">$ ${short(nice * f)}</text>`).join('');
  const every = Math.ceil(n / 8);
  const lab = (k) => (unit === 'month' ? new Date(k + 'T12:00:00Z').toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : dShort(k));
  const tip = (x) => `${unit === 'week' ? 'Semana del ' : ''}${unit === 'month' ? lab(x.key) : dLong(x.key)}`;
  const bars = series.map((x, i) => {
    const h = Math.max(0, y(0) - y(x.revenue)), bx = L + i * bw + gap / 2, w = Math.max(1, bw - gap), rr = Math.min(4, w / 2, h);
    const path = h ? `M${bx},${y(0)} V${y(0) - h + rr} Q${bx},${y(0) - h} ${bx + rr},${y(0) - h} H${bx + w - rr} Q${bx + w},${y(0) - h} ${bx + w},${y(0) - h + rr} V${y(0)} Z` : '';
    return `<g class="bar" data-tip="${esc(tip(x))}|${fmt(x.revenue)}|${x.orders} ${x.orders === 1 ? 'pedido' : 'pedidos'} · ${x.units} u.">
      <rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" class="hit"/>${path ? `<path d="${path}"/>` : ''}
      ${i % every === 0 ? `<text x="${bx + w / 2}" y="${H - 8}" text-anchor="middle" class="ax">${esc(lab(x.key))}</text>` : ''}</g>`;
  }).join('');
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Ventas por ${unit === 'day' ? 'día' : unit === 'week' ? 'semana' : 'mes'}">${grid}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="base"/>${bars}</svg><div class="chart-tip" hidden></div></div>`;
}
async function viewStats() {
  const t = AR_TODAY();
  if (STATS_F.preset !== 'custom') { const p = PRESETS.find((x) => x[0] === STATS_F.preset) || PRESETS[3]; [STATS_F.from, STATS_F.to] = p[2](t); }
  const d = await api(`/stats?from=${STATS_F.from}&to=${STATS_F.to}`);
  const k = d.kpis, pv = d.prev, R = d.range;
  const unitTxt = { day: 'por día', week: 'por semana', month: 'por mes' }[R.unit];
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Estadísticas</h1><div class="sub">${dLong(R.from)} – ${dLong(R.to)} · ${R.days} ${R.days === 1 ? 'día' : 'días'}. Comparado con ${dLong(R.prevFrom)} – ${dLong(R.prevTo)}.</div></div></div>
    <div class="card stats-filter">
      <div class="seg" role="group" aria-label="Período">${PRESETS.map(([key, label]) => `<button type="button" data-preset="${key}" aria-pressed="${STATS_F.preset === key}">${label}</button>`).join('')}<button type="button" data-preset="custom" aria-pressed="${STATS_F.preset === 'custom'}">Elegir fechas</button></div>
      <form class="range" id="stRange"><label class="fl"><span>Desde</span><input type="date" name="from" value="${R.from}" max="${t}"></label><label class="fl"><span>Hasta</span><input type="date" name="to" value="${R.to}" max="${t}"></label><button class="btn" type="submit">Aplicar</button></form>
    </div>
    <div class="grid g4" style="margin:14px 0">
      <div class="card kpi accent"><div class="l">Ventas</div><div class="v">${fmt(k.revenue)}</div><div class="l">${delta(k.revenue, pv.revenue)} · antes ${fmt(pv.revenue)}</div></div>
      <div class="card kpi"><div class="l">Pedidos pagados</div><div class="v">${num(k.orders)}</div><div class="l">${delta(k.orders, pv.orders)} · ${num(k.units)} prendas</div></div>
      <div class="card kpi"><div class="l">Ticket promedio</div><div class="v">${fmt(k.avgTicket)}</div><div class="l">${delta(k.avgTicket, pv.avgTicket)}</div></div>
      <div class="card kpi"><div class="l">Clientas</div><div class="v">${num(k.customers)}</div><div class="l">${num(k.newCustomers)} nuevas · ${num(k.returning)} volvieron</div></div>
    </div>
    <div class="card"><div class="card-head"><h2>Ventas ${unitTxt}</h2><span class="small muted">Pedidos pagados, por fecha de pago</span></div>
      ${k.orders ? salesChart(d.series, R.unit) : '<div class="empty">No hubo ventas en este período.</div>'}
      ${k.orders ? `<details class="small" style="margin-top:8px"><summary class="muted">Ver como tabla</summary><div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>${R.unit === 'day' ? 'Día' : R.unit === 'week' ? 'Semana desde' : 'Mes'}</th><th class="r">Ventas</th><th class="r">Pedidos</th><th class="r">Prendas</th></tr></thead><tbody>${d.series.filter((x) => x.orders).map((x) => `<tr><td>${dLong(x.key)}</td><td class="r n">${fmt(x.revenue)}</td><td class="r n">${x.orders}</td><td class="r n">${x.units}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    </div>
    <div class="grid g4" style="margin:14px 0">
      <div class="card kpi"><div class="l">Pagos completados</div><div class="v">${Math.round(k.paidRate * 100)}%</div><div class="l">${delta(k.paidRate, pv.paidRate, { pct: true })} · ${num(k.unpaid)} sin pagar de ${num(k.checkouts)}</div></div>
      <div class="card kpi"><div class="l">Carritos recuperados</div><div class="v">${num(k.recoveredCarts)}</div><div class="l">${fmt(k.recoveredValue)} · de ${num(k.carts)} bolsas guardadas</div></div>
      <div class="card kpi"><div class="l">Descuentos dados</div><div class="v">${fmt(k.discounts)}</div><div class="l">transferencia y cupones</div></div>
      <div class="card kpi"><div class="l">Devoluciones</div><div class="v">${fmt(k.refunds)}</div><div class="l">${num(k.refundCount)} ${k.refundCount === 1 ? 'pedido' : 'pedidos'} · ${delta(k.refunds, pv.refunds, { invert: true })}</div></div>
    </div>
    <div class="grid g2" style="align-items:start">
      <div class="card"><h2>Lo más vendido</h2>${d.topProducts.length ? `<div class="tablewrap"><table><thead><tr><th>Producto</th><th class="r">Prendas</th><th class="r">Ventas</th></tr></thead><tbody>
        ${d.topProducts.map((p, i) => `<tr><td><div style="display:flex;gap:10px;align-items:center"><span class="rank n">${i + 1}</span>${p.image ? `<img class="thumb" src="${esc(thumb(p.image))}" alt="">` : ''}${p.id ? `<a class="linkish" href="#producto/${p.id}">${esc(p.name)}</a>` : esc(p.name)}</div></td><td class="r n">${num(p.units)}</td><td class="r n">${fmt(p.revenue)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Sin ventas en el período.</div>'}</div>
      <div class="card"><h2>Por categoría</h2><p class="small muted" style="margin-top:-4px">Una prenda puede estar en más de una categoría.</p>${barList(d.byCategory)}</div>
    </div>
    <div class="grid g3" style="margin-top:14px;align-items:start">
      <div class="card"><h2>Cómo pagan</h2>${barList(d.byPayment)}</div>
      <div class="card"><h2>Cómo reciben</h2>${barList(d.byShipping)}</div>
      <div class="card"><h2>Dónde compran</h2>${barList(d.byProvince)}</div>
    </div>
    <div class="grid g2" style="margin-top:14px;align-items:start">
      <div class="card"><h2>Día de la semana</h2>${barList(d.byWeekday.filter((x) => x.count || k.orders), { max: 7 })}</div>
      <div class="card"><h2>Cupones</h2>${d.coupons.length ? `<div class="tablewrap"><table><thead><tr><th>Código</th><th class="r">Usos</th><th class="r">Descuento</th></tr></thead><tbody>${d.coupons.map((c) => `<tr><td class="n">${esc(c.label)}</td><td class="r n">${c.count}</td><td class="r n">${fmt(c.value)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">No se usaron cupones en este período.</div>'}</div>
    </div>`;
  $$('[data-preset]').forEach((b) => (b.onclick = () => {
    if (b.dataset.preset === 'custom') { STATS_F.preset = 'custom'; $$('[data-preset]').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#stRange [name=from]').focus(); return; }
    STATS_F = { preset: b.dataset.preset }; viewStats();
  }));
  $('#stRange').onsubmit = (e) => { e.preventDefault(); const f = e.target; if (!f.from.value || !f.to.value) return; STATS_F = { preset: 'custom', from: f.from.value, to: f.to.value }; viewStats(); };
  const wrap = $('.chart-wrap');
  if (wrap) {
    const tipEl = wrap.querySelector('.chart-tip');
    const show = (g) => {
      wrap.querySelectorAll('.bar.on').forEach((x) => x.classList.remove('on'));
      if (!g) { tipEl.hidden = true; return; }
      g.classList.add('on');
      const [when, money, rest] = g.dataset.tip.split('|');
      tipEl.innerHTML = `<div class="small muted">${esc(when)}</div><b class="n">${esc(money)}</b><div class="small">${esc(rest)}</div>`;
      tipEl.hidden = false;
      const hb = g.querySelector('.hit').getBoundingClientRect(), wb = wrap.getBoundingClientRect();
      const x = hb.left - wb.left + hb.width / 2;
      tipEl.style.left = Math.min(Math.max(x, 70), wb.width - 70) + 'px';
    };
    wrap.addEventListener('pointermove', (e) => show(e.target.closest?.('.bar')));
    wrap.addEventListener('pointerleave', () => show(null));
  }
}

// ── Probador virtual ─────────────────────────────────────
async function viewTryon() {
  const d = await api('/tryon');
  const st = d.stats, S = d.settings;
  const conv = st.month ? Math.round((st.added / st.month) * 100) : 0;
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Probador IA</h1><div class="sub">Las clientas suben una foto de cuerpo entero y ven la prenda puesta, generada con inteligencia artificial.</div></div></div>
    <div class="card" style="margin-bottom:14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span class="pill ${d.mock ? 's-pending_payment' : 's-delivered'}">${d.mock ? 'Modo prueba' : 'Conectado a FASHN'}</span>
      <span class="small muted" style="flex:1;min-width:240px">${d.mock ? 'Falta la clave del servicio de IA (FASHN_API_KEY en el archivo .env). Mientras tanto el probador muestra la foto y la prenda sin generar la imagen, y en la tienda publicada no aparece.' : 'Cada imagen generada usa 1 crédito de FASHN. Las fotos de las clientas no se guardan en la tienda.'}</span></div>
    <div class="grid g4" style="margin-bottom:14px">
      <div class="card kpi accent"><div class="l">Pruebas hoy</div><div class="v">${num(st.today)}</div><div class="l">límite ${num(S.dailyLimit)} por día</div></div>
      <div class="card kpi"><div class="l">Últimos 30 días</div><div class="v">${num(st.month)}</div><div class="l">imágenes generadas</div></div>
      <div class="card kpi"><div class="l">Sumadas a la bolsa</div><div class="v">${conv}%</div><div class="l">${num(st.added)} después de probarse</div></div>
      <div class="card kpi"><div class="l">Tiempo promedio</div><div class="v">${st.avgSeconds ? st.avgSeconds.toLocaleString('es-AR') + ' s' : '—'}</div><div class="l">${num(st.errors)} fotos no sirvieron</div></div>
    </div>
    <div class="grid g2" style="align-items:start">
      <div class="card"><h2>Lo más probado · 30 días</h2>${st.top.length ? `<div class="tablewrap"><table><thead><tr><th>Prenda</th><th class="r">Pruebas</th><th class="r">A la bolsa</th></tr></thead><tbody>
        ${st.top.map((p) => `<tr><td><div style="display:flex;gap:10px;align-items:center">${p.image ? `<img class="thumb" src="${esc(thumb(p.image))}" alt="">` : ''}<a class="linkish" href="#producto/${p.product_id}">${esc(p.name)}</a></div></td><td class="r n">${num(p.tries)}</td><td class="r n">${num(p.added)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Todavía nadie usó el probador.</div>'}</div>
      ${isAdmin() ? `<form class="card" id="trSet"><h2>Ajustes</h2>
        <label class="fl" style="flex-direction:row;align-items:center;gap:10px;margin-bottom:12px"><label class="switch"><input type="checkbox" name="enabled" ${S.enabled ? 'checked' : ''}><span></span></label><span>Mostrar el probador en la tienda</span></label>
        <div class="row"><label class="fl"><span>Límite por día (toda la tienda)</span><input type="number" min="1" name="dailyLimit" value="${S.dailyLimit}"></label>
          <label class="fl"><span>Por persona, por hora</span><input type="number" min="1" name="perHour" value="${S.perHour}"></label></div>
        <label class="fl"><span>Calidad</span><select name="mode">${[['performance', 'Rápida (5 s)'], ['balanced', 'Equilibrada (8 s)'], ['quality', 'Máxima (15 s)']].map(([k, l]) => `<option value="${k}" ${S.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="fl" style="margin-top:10px"><span>Categorías sin probador</span><div class="chips">${d.categories.map((c) => `<label><input type="checkbox" name="hidden" value="${c.id}" ${d.hidden.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>
          <span class="small muted">Accesorios y calzado no funcionan bien con la IA: vienen marcados.</span></div>
        <button class="btn primary" type="submit" style="margin-top:12px">Guardar</button></form>` : ''}
    </div>`;
  const f = $('#trSet');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/tryon', { method: 'PUT', body: { enabled: f.enabled.checked, dailyLimit: f.dailyLimit.value, perHour: f.perHour.value, mode: f.mode.value, hiddenCategories: $$('#trSet [name=hidden]:checked').map((x) => Number(x.value)) } }); toast('Ajustes guardados'); }
    catch (err) { toast(err.message, true); }
  };
}

// ── Contenido de la tienda ───────────────────────────────
async function viewContent() {
  const d = await api('/content');
  let faq = d.faq.map((x) => ({ ...x }));
  const faqHTML = () => faq.map((x, i) => `<div class="faq-ed" data-i="${i}">
      <div class="faq-ed-n">${i + 1}</div>
      <div class="faq-ed-f"><input data-k="q" value="${esc(x.q)}" placeholder="Pregunta" aria-label="Pregunta ${i + 1}"><textarea data-k="a" rows="3" placeholder="Respuesta" aria-label="Respuesta ${i + 1}">${esc(x.a)}</textarea></div>
      <div class="faq-ed-b"><button type="button" class="btn sm" data-mv="-1" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" class="btn sm" data-mv="1" ${i < faq.length - 1 ? '' : 'disabled'} aria-label="Bajar">↓</button><button type="button" class="btn sm" data-rm aria-label="Quitar">✕</button></div></div>`).join('');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Contenido</h1><div class="sub">Preguntas frecuentes de la home, términos y condiciones, política de cambios y reseñas de Google.</div></div></div>
    <form class="card" id="faqF"><div class="card-head"><h2>Preguntas frecuentes</h2><span class="small muted">Se muestran en la home, en este orden. Podés usar **negrita**.</span></div>
      <div id="faqEd">${faqHTML()}</div>
      <div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn" id="faqAdd">Agregar pregunta</button><button class="btn primary" type="submit">Guardar preguntas</button></div></form>
    <div class="grid g2" style="margin-top:14px;align-items:start">
      <form class="card legal-ed" data-field="terms"><div class="card-head"><h2>Términos y condiciones</h2></div>
        <p class="small muted">Completá razón social, CUIT, domicilio y email (están entre corchetes). Formato: <code>### Subtítulo</code>, <code>- ítem</code>, <code>**negrita**</code>. Conviene que lo revise quien asesora a la tienda.</p>
        <textarea name="terms" rows="18">${esc(d.terms)}</textarea><button class="btn primary" type="submit">Guardar términos</button></form>
      <form class="card legal-ed" data-field="returns"><div class="card-head"><h2>Cambios y devoluciones</h2></div>
        <p class="small muted">Incluye el derecho de arrepentimiento de 10 días que exige la ley. El Botón de arrepentimiento está en el pie de todas las páginas.</p>
        <textarea name="returns" rows="18">${esc(d.returns)}</textarea><button class="btn primary" type="submit">Guardar política</button></form>
    </div>
    <form class="card" id="revF" style="margin-top:14px"><div class="card-head"><h2>Reseñas de Google</h2><span class="pill ${d.google.connected ? 's-delivered' : 's-pending_payment'}">${d.google.connected ? 'Ficha conectada' : 'Falta conectar la ficha'}</span></div>
      <p class="small muted">${d.google.connected ? 'Se muestran las reseñas de tu ficha de Google (Google entrega hasta 5, las más relevantes). Se actualizan cada 12 horas.' : 'Para mostrarlas hacen falta la clave de Google Places API y el Place ID de tu ficha en el archivo .env (GOOGLE_PLACES_API_KEY y GOOGLE_PLACE_ID). Mientras tanto la sección no aparece en la tienda.'}</p>
      <div class="row"><label class="fl" style="flex-direction:row;align-items:center;gap:10px"><label class="switch"><input type="checkbox" name="reviewsEnabled" ${d.reviewsEnabled ? 'checked' : ''}><span></span></label><span>Mostrar la sección en la home</span></label>
      <label class="fl"><span>Mostrar reseñas desde</span><select name="reviewsMinRating">${[[0, 'Todas'], [3, '3 estrellas'], [4, '4 estrellas'], [5, '5 estrellas']].map(([v, l]) => `<option value="${v}" ${Number(d.reviewsMinRating) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <button class="btn" type="submit">Guardar</button></form>`;
  const sync = () => { $$('#faqEd .faq-ed').forEach((row) => { const i = Number(row.dataset.i); faq[i] = { q: row.querySelector('[data-k=q]').value, a: row.querySelector('[data-k=a]').value }; }); };
  const redraw = () => { $('#faqEd').innerHTML = faqHTML(); };
  $('#faqEd').addEventListener('click', (e) => {
    const row = e.target.closest('.faq-ed'); if (!row) return; const i = Number(row.dataset.i);
    if (e.target.closest('[data-rm]')) { sync(); faq.splice(i, 1); redraw(); }
    const mv = e.target.closest('[data-mv]'); if (mv) { sync(); const j = i + Number(mv.dataset.mv); [faq[i], faq[j]] = [faq[j], faq[i]]; redraw(); }
  });
  $('#faqAdd').onclick = () => { sync(); faq.push({ q: '', a: '' }); redraw(); $$('#faqEd [data-k=q]').at(-1).focus(); };
  const save = async (body, msg) => { try { await api('/content', { method: 'PUT', body }); toast(msg); } catch (err) { toast(err.message, true); } };
  $('#faqF').onsubmit = (e) => { e.preventDefault(); sync(); save({ faq: faq.filter((x) => x.q.trim() && x.a.trim()) }, 'Preguntas guardadas'); };
  $$('.legal-ed').forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); save({ [f.dataset.field]: f.querySelector('textarea').value }, 'Texto guardado'); }));
  $('#revF').onsubmit = (e) => { e.preventDefault(); const f = e.target; save({ reviewsEnabled: f.reviewsEnabled.checked, reviewsMinRating: Number(f.reviewsMinRating.value) }, 'Ajustes guardados'); };
}

const WD_ST = { nuevo: ['Nuevo', 's-pending_payment'], 'en curso': ['En curso', 's-preparing'], resuelto: ['Resuelto', 's-delivered'], rechazado: ['Rechazado', 's-cancelled'] };
async function viewWithdrawals() {
  const rows = await api('/withdrawals');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Arrepentimientos</h1><div class="sub">Pedidos hechos con el Botón de arrepentimiento. La clienta ya recibió su código por email; coordiná la devolución y hacé el reintegro desde el pedido.</div></div></div>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Código</th><th>Pedido</th><th>Clienta</th><th>Motivo</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>
      ${rows.map((w) => `<tr><td class="n"><b>${esc(w.code)}</b></td><td>${w.order_id ? `<a class="linkish" href="#pedido/${w.order_id}">${esc(w.order_number)}</a>` : esc(w.order_number)}</td>
        <td>${esc(w.name)}<div class="small muted">${esc(w.email)}</div></td><td class="small">${esc(w.reason || '—')}</td><td class="small">${date(w.created_at)}</td>
        <td><select data-wd="${w.id}" aria-label="Estado de ${esc(w.code)}">${Object.entries(WD_ST).map(([k, [l]]) => `<option value="${k}" ${w.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="card empty">Todavía nadie usó el Botón de arrepentimiento.</div>'}`;
  $$('[data-wd]').forEach((s) => (s.onchange = async () => { await api('/withdrawals/' + s.dataset.wd, { method: 'PUT', body: { status: s.value } }); toast('Estado actualizado'); }));
}

// ── Lince / Dragonfish ───────────────────────────────────
const LINCE_MODE = {
  directo: ['Conectado a Dragonfish', 's-delivered', 'La tienda lee el stock de Dragonfish sola, cada pocos minutos.'],
  agente: ['Agente del local', 's-delivered', 'El programa instalado en la PC del local manda el stock. Si deja de llegar, revisá que la PC esté prendida.'],
  prueba: ['Modo prueba', 's-pending_payment', 'Todavía faltan las claves de Dragonfish. “Sincronizar ahora” simula una lectura con el stock actual para que veas cómo funciona.'],
};
async function viewLince() {
  const d = await api('/lince');
  const [mLabel, mCls, mText] = LINCE_MODE[d.mode];
  const det = d.detail || {};
  const lastRun = d.last[0];
  const cov = d.coverage || { products: 0, withCode: 0 };
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Lince</h1><div class="sub">Stock y precios desde Dragonfish (Zoo Logic). El local manda: la web toma lo que dice Lince.</div></div>
      <div class="actions">${d.mode !== 'agente' ? '<button class="btn primary" id="lnSync">Sincronizar ahora</button>' : ''}</div></div>
    <div class="card" style="margin-bottom:14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span class="pill ${mCls}">${mLabel}</span><span class="small muted" style="flex:1;min-width:240px">${mText}</span></div>
    <div class="grid g4" style="margin-bottom:14px">
      <div class="card kpi accent"><div class="l">Última lectura</div><div class="v" style="font-size:22px">${d.lastOkAt ? date(d.lastOkAt) : '—'}</div><div class="l">${lastRun?.error ? 'la última falló' : 'sin errores'}</div></div>
      <div class="card kpi"><div class="l">Actualizadas</div><div class="v">${num(lastRun && !lastRun.error ? lastRun.updated : 0)}</div><div class="l">variantes en la última</div></div>
      <div class="card kpi"><div class="l">Sin cruzar</div><div class="v">${num(det.notFound?.length || 0)}</div><div class="l">filas de Lince sin producto</div></div>
      <div class="card kpi"><div class="l">Con artículo</div><div class="v">${num(cov.withCode)} / ${num(cov.products)}</div><div class="l">productos visibles</div></div>
    </div>
    <div class="grid g2" style="align-items:start">
      <div class="card"><h2>Pedidos web para cargar en Lince</h2>
        <p class="small muted">Ventas pagadas en la web. Hasta que las marques como cargadas, la tienda las descuenta del stock que manda Lince, así no se vende dos veces la misma prenda.</p>
        ${d.pendingOrders.length ? d.pendingOrders.map((o) => `<div class="mail-row" style="align-items:flex-start"><div style="flex:1"><b><a class="linkish" href="#pedido/${o.id}">${esc(o.number)}</a></b> · ${esc(o.name)} <span class="small muted">· ${date(o.paid_at)}</span>
            <div class="small muted">${o.items.map((i) => `${i.qty} × ${esc(i.ref_code || '¿sin artículo?')} ${esc(i.variant_label || '')}`).join('<br>')}</div></div>
            <button class="btn sm" data-loaded="${o.id}">Ya está en Lince</button></div>`).join('') : '<div class="empty small">No hay ventas web pendientes de cargar.</div>'}
      </div>
      <div class="card"><h2>Sin cruzar en la última lectura</h2>
        <p class="small muted">Artículos de Lince que no encontramos en la tienda. Para cruzarlos, poné el mismo código en el campo <b>Artículo</b> del producto y usá los mismos colores y talles.</p>
        ${det.notFound?.length ? `<div class="tablewrap"><table><thead><tr><th>Artículo</th><th>Color</th><th>Talle</th><th class="r">Stock</th></tr></thead><tbody>${det.notFound.slice(0, 40).map((r) => `<tr><td class="n">${esc(r.articulo)}</td><td>${esc(r.color || '—')}</td><td>${esc(r.talle || '—')}</td><td class="r n">${num(r.qty)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Todo cruzado.</div>'}
        ${det.missing ? `<p class="small muted" style="margin-top:10px">${num(det.missing)} variantes de la tienda no vinieron en la lectura de Lince (quedaron con su stock anterior).</p>` : ''}
      </div>
    </div>
    ${det.changes?.length ? `<div class="card" style="margin-top:14px"><h2>Cambios de la última lectura</h2><div class="tablewrap"><table><thead><tr><th>Producto</th><th>Variante</th><th class="r">Antes</th><th class="r">Ahora</th></tr></thead><tbody>
      ${det.changes.map((c) => `<tr><td>${esc(c.name)}</td><td class="small">${esc(c.variant || '—')}</td><td class="r n">${c.from ?? '∞'}</td><td class="r n"><b>${c.to}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${isAdmin() ? `<form class="card" id="lnSet" style="margin-top:14px"><h2>Ajustes</h2>
      <div class="row"><label class="fl"><span>Leer Dragonfish cada (minutos, conexión directa)</span><input type="number" min="5" name="autoMinutes" value="${d.settings.autoMinutes}"></label>
      <label class="fl" style="flex-direction:row;align-items:center;gap:10px"><label class="switch"><input type="checkbox" name="updatePrices" ${d.settings.updatePrices ? 'checked' : ''}><span></span></label><span>También tomar los precios de Lince</span></label></div>
      <button class="btn" type="submit">Guardar</button></form>` : ''}
    <div class="card" style="margin-top:14px"><h2>Historial</h2>${d.last.length ? `<div class="tablewrap"><table><thead><tr><th>Cuándo</th><th>Origen</th><th class="r">Filas</th><th class="r">Actualizadas</th><th class="r">Sin cruzar</th><th>Resultado</th></tr></thead><tbody>
      ${d.last.map((l) => `<tr><td class="small">${date(l.at)}</td><td class="small">${esc(l.source)}</td><td class="r n">${num(l.rows)}</td><td class="r n">${num(l.updated)}${l.prices ? ` <span class="small muted">· ${l.prices} precios</span>` : ''}</td><td class="r n">${num(l.not_found)}</td><td class="small">${l.error ? `<span style="color:var(--bad,#a33)">${esc(l.error)}</span>` : 'Bien'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Todavía no hubo ninguna lectura.</div>'}</div>`;
  const sync = $('#lnSync');
  if (sync) sync.onclick = async () => {
    sync.disabled = true; sync.textContent = 'Leyendo Lince…';
    try { const r = await api('/lince/sync', { method: 'POST' }); toast(`${r.updated} variantes actualizadas · ${r.notFound} sin cruzar`); viewLince(); }
    catch (err) { toast(err.message, true); viewLince(); }
  };
  $$('[data-loaded]').forEach((b) => (b.onclick = async () => { await api(`/lince/orders/${b.dataset.loaded}/loaded`, { method: 'POST' }); toast('Marcado como cargado en Lince'); viewLince(); }));
  const f = $('#lnSet');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/lince', { method: 'PUT', body: { autoMinutes: f.autoMinutes.value, updatePrices: f.updatePrices.checked } }); toast('Ajustes guardados'); } catch (err) { toast(err.message, true); }
  };
}

// ── Arranque ─────────────────────────────────────────────
async function boot() {
  try { ME = await api('/me'); } catch { return; }
  $('#login').hidden = true; $('#app').hidden = false;
  $('#whoami').innerHTML = `<b>${esc(ME.name || ME.email)}</b><span>${esc(ME.roleLabel || '')}</span>`;
  if (EMBED) embedHash = 'resumen';
  route();
}
window.__adminBoot = boot;
if (!EMBED?.manualBoot) boot();
