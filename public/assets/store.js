// Samadhi Style · vidriera
// Habla con el servidor por /api. En la vista previa sin servidor, window.__SAMADHI_API responde en su lugar.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-AR');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Fotos ────────────────────────────────────────────────
const sized = (u, w) => (u && u.includes('mitiendanube.com') ? u.replace(/-1024-1024\.(webp|jpg|png)$/, w >= 1024 ? '-1024-1024.$1' : `-${w}-0.$1`) : u);
const srcset = (u) => (u && u.includes('mitiendanube.com') ? `${sized(u, 480)} 480w, ${sized(u, 640)} 640w, ${sized(u, 1024)} 1024w` : '');

const COLORS = { negro: '#1c1b19', blanco: '#f7f5ef', 'off white': '#eee7d8', beige: '#d8c5a6', 'marrón': '#6b4a34', chocolate: '#4a3326', camel: '#b58556', suela: '#8b5a35', manteca: '#efe2b8', azul: '#2f3d58', celeste: '#a9c3d6', verde: '#5f7a4a', 'verde militar': '#585d3a', 'verde oliva': '#66704a', rosa: '#e2b8b2', rojo: '#a8312b', platino: '#d9d6cf', nude: '#dcbea4', gris: '#8b8983', lima: '#c8d46a', terracota: '#b4573a', mostaza: '#c99a2e', crudo: '#ece4d2', 'bordó': '#6c1f2a' };
const colorHex = (c) => COLORS[(c || '').toLowerCase()] || '#cfc3b0';
const SHAPES = {
  remera: 'M62 42 L86 30 Q100 44 114 30 L138 42 L172 78 L150 98 L138 84 L139 206 L61 206 L62 84 L50 98 L28 78 Z',
  blusa: 'M66 40 L88 30 Q100 42 112 30 L134 40 L162 132 L146 137 L131 88 L136 222 L64 222 L69 88 L54 137 L38 132 Z',
  camisa: 'M64 40 L88 28 L100 46 L112 28 L136 40 L164 140 L148 145 L132 92 L136 228 L64 228 L68 92 L52 145 L36 140 Z',
  tank: 'M76 30 L90 30 Q100 54 110 30 L124 30 L128 86 L136 222 L64 222 L72 86 Z',
  pant: 'M64 28 L136 28 L148 236 L110 236 L100 98 L90 236 L52 236 Z',
  short: 'M60 72 L140 72 L152 176 L108 180 L100 124 L92 180 L48 176 Z',
  falda: 'M72 46 L128 46 L162 214 Q100 228 38 214 Z',
  vestido: 'M80 26 L90 26 Q100 44 110 26 L120 26 L124 88 L117 104 L162 230 Q100 242 38 230 L83 104 L76 88 Z',
  abrigo: 'M64 32 L88 26 L100 104 L112 26 L136 32 L166 72 L170 230 L150 230 L144 118 L142 232 L58 232 L56 118 L50 230 L30 230 L34 72 Z',
  chaleco: 'M68 34 L88 28 L100 112 L112 28 L132 34 L140 84 L138 216 L62 216 L60 84 Z',
  calzado: 'M40 150 Q44 120 70 118 L96 116 Q120 130 150 140 Q172 148 168 166 L44 166 Q38 160 40 150 Z',
};
function shapeFor(name) {
  const n = name.toLowerCase();
  if (/short|bermuda/.test(n)) return 'short';
  if (/jean|wide leg|baggy|pantal|pant\./.test(n)) return 'pant';
  if (/falda|pollera/.test(n)) return 'falda';
  if (/vestido|tunica|mono|pijama/.test(n)) return 'vestido';
  if (/chaleco/.test(n)) return 'chaleco';
  if (/blazer|campera|saco|tapado|cardigan|sweater|buzo/.test(n)) return 'abrigo';
  if (/camisa/.test(n)) return 'camisa';
  if (/musculosa|top|bikini/.test(n)) return 'tank';
  if (/mocasin|bucanera|oxford|sueco|sandalia|mules|birk/.test(n)) return 'calzado';
  if (/blusa/.test(n)) return 'blusa';
  return 'remera';
}
function placeholder(p, color) {
  const hex = colorHex(color || p.variants.find((v) => v.color)?.color);
  return `<div class="ph"><svg viewBox="0 0 200 260" aria-hidden="true"><path d="${SHAPES[shapeFor(p.name)]}" fill="${hex}" stroke="rgba(25,24,22,.5)" stroke-width=".9" stroke-linejoin="round"/></svg></div>`;
}
// Si una foto no carga, se reemplaza por la ilustración de la prenda.
window.__phFail = (img) => {
  const p = byId.get(Number(img.dataset.pid));
  if (!p) { img.remove(); return; }
  img.outerHTML = placeholder(p, img.dataset.color);
};
function imgTag(p, url, { cls = '', sizes = '(max-width: 800px) 50vw, 25vw', eager = false, color = '' } = {}) {
  if (!url) return placeholder(p, color);
  return `<img class="${cls}" src="${esc(sized(url, 640))}" srcset="${esc(srcset(url))}" sizes="${sizes}" alt="${esc(p.name)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" data-pid="${p.id}" data-color="${esc(color)}" onerror="__phFail(this)">`;
}

// ── Datos ────────────────────────────────────────────────
let CAT = { products: [], categories: [], banners: [], store: {}, shipping: {} };
let byId = new Map();
const variantById = new Map();
const SIZE_ORDER = ['XS', 'S', 'S/M', 'M', 'M/L', 'L', 'XL', 'XXL'];
const sizeSort = (a, b) => {
  const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  return Number(a) - Number(b);
};
const avail = (v) => v.stock === null || v.stock > 0;
const nowPrice = (p) => p.promo ?? p.price;
const cuotas = () => (CAT.payments?.installments > 1 ? CAT.payments.installments : 0);
const transferPct = () => CAT.payments?.transfer?.discount || 0;
const instLine = (price) => (cuotas() ? `${cuotas()} cuotas sin interés de ${fmt(price / cuotas())}` : '');
const offPct = (p) => (p.promo ? Math.round((1 - p.promo / p.price) * 100) : 0);

function prepare(cat) {
  CAT = cat;
  byId = new Map(cat.products.map((p) => [p.id, p]));
  for (const p of cat.products) {
    p.colors = [...new Set(p.variants.map((v) => v.color).filter(Boolean))];
    p.sizes = [...new Set(p.variants.map((v) => v.size).filter(Boolean))].sort(sizeSort);
    p.others = [...new Set(p.variants.map((v) => v.other).filter(Boolean))];
    for (const v of p.variants) variantById.set(v.id, { ...v, product: p });
  }
}

// ── Estado ───────────────────────────────────────────────
const st = { cat: 'all', coll: 'all', q: '', sort: 'feat', shown: 24 };
let cart = [];
try { cart = JSON.parse(localStorage.getItem('samadhi-bag-v2') || '[]'); } catch { cart = []; }
const saveCart = () => { try { localStorage.setItem('samadhi-bag-v2', JSON.stringify(cart)); } catch {} syncCart(); };
// Guarda la bolsa en el servidor cuando sabemos el email (cuenta o checkout), para el recordatorio por email.
let syncT;
function syncCart() {
  clearTimeout(syncT);
  syncT = setTimeout(() => {
    const email = (typeof session !== 'undefined' && session.customer?.email) || (typeof co !== 'undefined' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(co.form?.email || '') ? co.form.email : '');
    if (!email) return;
    api('/api/cart', { email, name: (typeof co !== 'undefined' && co.form?.name) || session.customer?.name || '', items: cart.map((c) => ({ variant_id: c.variant_id, qty: c.qty })) }).catch(() => {});
  }, 1200);
}

// ── Banners verticales ───────────────────────────────────
const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const hero = { i: 0, n: 0, timer: null, dur: 7000, busy: false };
function renderHero() {
  const banners = CAT.banners.length ? CAT.banners : [];
  hero.n = banners.length;
  if (!hero.n) { $('#hero').hidden = true; return; }
  const fakeP = (b) => ({ id: -1, name: b.title, variants: [] });
  $('#slides').innerHTML = banners.map((b, i) => `
    <article class="slide ${b.tone === 'light' ? 'light' : ''}" role="group" aria-roledescription="banner" aria-label="${i + 1} de ${banners.length}" ${i ? 'aria-hidden="true"' : ''}>
      <div class="bg">${b.video_url ? `<video poster="${esc(b.image_url)}" muted loop playsinline preload="${i === 0 ? 'auto' : 'metadata'}" ${reduceMotion || i ? '' : 'autoplay'} aria-hidden="true"><source src="${esc(b.video_url)}" type="video/mp4">${/\.mp4$/i.test(b.video_url) ? `<source src="${esc(b.video_url.replace(/\.mp4$/i, '.webm'))}" type="video/webm">` : ''}</video>` : `<img src="${esc(sized(b.image_url, 1024))}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.outerHTML='<div class=&quot;ph&quot;></div>'">`}</div>
      <div class="copy">
        ${b.eyebrow ? `<div class="eyebrow">${esc(b.eyebrow)}</div>` : '<div></div>'}
        <h2>${esc(b.title)}</h2>
        ${b.subtitle ? `<p class="sub">${esc(b.subtitle)}</p>` : '<div></div>'}
        ${b.cta_label ? `<div class="cta"><a class="btn" href="${esc(b.cta_link || '#tienda')}">${esc(b.cta_label)}</a></div>` : ''}
      </div>
    </article>`).join('');
  void fakeP;
  $('#heroDots').innerHTML = banners.map((b, i) => `<li><button data-slide="${i}" aria-label="Ir al banner ${i + 1}: ${esc(b.title)}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="bar"><i></i></span></button></li>`).join('');
  $('#heroDots').style.setProperty('--dur', hero.dur + 'ms');
  layoutSlides(0, 0, false);
  updateDots();
  startAuto();
}
function layoutSlides(active, dir, animate) {
  const slides = $$('.slide');
  const H = $('#hero');
  if (animate && !reduced) {
    // Ubica la diapositiva entrante arriba o abajo, sin animación, antes de moverla.
    const incoming = slides[active];
    H.classList.remove('animating');
    incoming.style.transform = `translate3d(0, ${dir > 0 ? 100 : -100}%, 0)`;
    incoming.querySelector('.bg').style.transform = `translate3d(0, ${dir > 0 ? -40 : 40}%, 0) scale(1.08)`;
    void incoming.offsetHeight;
    H.classList.add('animating');
  }
  slides.forEach((s, i) => {
    const bg = s.querySelector('.bg');
    s.classList.toggle('is-active', i === active);
    s.classList.toggle('leaving', animate && i === hero.prev);
    s.setAttribute('aria-hidden', i === active ? 'false' : 'true');
    if (i === active) {
      s.style.transform = 'translate3d(0,0,0)';
      bg.style.transform = `translate3d(0, ${hero.py || 0}px, 0) scale(1.08)`;
    } else if (animate && i === hero.prev) {
      // La que se va sale hacia el lado contrario; su foto se queda atrás (parallax).
      s.style.transform = `translate3d(0, ${dir > 0 ? -100 : 100}%, 0)`;
      bg.style.transform = `translate3d(0, ${dir > 0 ? 45 : -45}%, 0) scale(1.08)`;
    } else if (!animate || i !== active) {
      s.style.transform = 'translate3d(0, 100%, 0)';
    }
  });
  if (animate) setTimeout(() => { H.classList.remove('animating'); hero.busy = false; }, 1200);
}
function go(to, dir) {
  if (hero.busy || hero.n < 2) return;
  to = (to + hero.n) % hero.n;
  if (to === hero.i) return;
  hero.busy = true;
  hero.prev = hero.i;
  hero.i = to;
  layoutSlides(to, dir ?? (to > hero.prev ? 1 : -1), true);
  updateDots();
  startAuto();
}
function updateDots() {
  $$('#heroDots button').forEach((b, i) => {
    b.setAttribute('aria-current', i === hero.i ? 'true' : 'false');
    const bar = b.querySelector('.bar i');
    bar.style.animation = 'none'; void bar.offsetHeight; bar.style.animation = '';
  });
  $('#heroCount').textContent = `${String(hero.i + 1).padStart(2, '0')} / ${String(hero.n).padStart(2, '0')}`;
  // Sólo se reproduce el video del banner visible (los demás quedan en pausa para no gastar batería).
  $$('.slide').forEach((s, i) => { const v = s.querySelector('video'); if (!v) return; if (i === hero.i && !reduceMotion) { v.play?.().catch(() => {}); } else v.pause?.(); });
}
function startAuto() {
  clearTimeout(hero.timer);
  if (reduced || hero.n < 2 || $('#hero').classList.contains('paused')) return;
  hero.timer = setTimeout(() => go(hero.i + 1, 1), hero.dur);
}
function bindHero() {
  $('#heroUp').addEventListener('click', () => go(hero.i - 1, -1));
  $('#heroDown').addEventListener('click', () => go(hero.i + 1, 1));
  $('#heroDots').addEventListener('click', (e) => { const b = e.target.closest('[data-slide]'); if (b) go(Number(b.dataset.slide)); });
  const H = $('#hero');
  H.addEventListener('mouseenter', () => { H.classList.add('paused'); clearTimeout(hero.timer); });
  H.addEventListener('mouseleave', () => { H.classList.remove('paused'); startAuto(); });
  H.addEventListener('focusin', () => { H.classList.add('paused'); clearTimeout(hero.timer); });
  H.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); go(hero.i + 1, 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); go(hero.i - 1, -1); }
  });
  // Gesto vertical en el celu: solo si el dedo se mueve claramente en vertical y rápido.
  let t0 = null;
  H.addEventListener('touchstart', (e) => { t0 = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: Date.now() }; }, { passive: true });
  H.addEventListener('touchend', (e) => {
    if (!t0) return;
    const dy = e.changedTouches[0].clientY - t0.y, dx = e.changedTouches[0].clientX - t0.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - t0.t < 600) go(hero.i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    t0 = null;
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(hero.timer) : startAuto()));
}

// Parallax al hacer scroll: la foto del banner baja más lento que la página y el texto se desvanece.
let ticking = false;
function onScroll() {
  if (ticking || reduced) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY;
    const H = $('#hero');
    const h = H.offsetHeight;
    if (y < h * 1.2 && !H.classList.contains('animating')) {
      hero.py = y * 0.38;
      const s = $$('.slide')[hero.i];
      if (s) {
        s.querySelector('.bg').style.transform = `translate3d(0, ${hero.py}px, 0) scale(1.08)`;
        const c = s.querySelector('.copy');
        c.style.setProperty('--ty', `${y * 0.16}px`);
        c.style.setProperty('--to', Math.max(0, 1 - y / (h * 0.75)).toFixed(3));
      }
    }
    const band = $('#nosotras');
    const r = band.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) {
      $('#bandBg').style.setProperty('--py', `${((r.top + r.height / 2) - innerHeight / 2) * -0.22}px`);
    }
  });
}

// ── Categorías y filtros ─────────────────────────────────
const SPECIAL = {
  all: { label: 'Todo', match: () => true },
  new: { label: "SS'27", match: (p) => p.isNew },
  sale: { label: 'Sale', match: (p) => !!p.promo },
};
function catMatch(p) {
  if (SPECIAL[st.cat]) return SPECIAL[st.cat].match(p);
  const c = CAT.categories.find((c) => c.slug === st.cat);
  return c ? p.categories.includes(c.id) : true;
}
function collMatch(p) { return st.coll === 'all' || p.collection.includes(st.coll); }
function catLabel(k) { return SPECIAL[k]?.label || CAT.categories.find((c) => c.slug === k)?.name || 'Tienda'; }
function catCover(c) {
  const p = CAT.products.find((p) => p.categories.includes(c.id) && p.images.length && p.inStock) || CAT.products.find((p) => p.categories.includes(c.id) && p.images.length);
  return p ? { p, url: p.images[0] } : null;
}
function renderCats() {
  const top = CAT.categories.filter((c) => c.count >= 2).sort((a, b) => b.count - a.count);
  const items = [{ k: 'all', name: 'Todo' }, ...(CAT.products.some((p) => p.promo) ? [{ k: 'sale', name: 'Sale' }] : []), ...top.map((c) => ({ k: c.slug, name: c.name, c }))];
  $('#cats').innerHTML = items.map((it) => {
    const cover = it.c && catCover(it.c);
    const inner = cover ? `<img src="${esc(sized(cover.url, 320))}" alt="" loading="lazy" data-pid="${cover.p.id}" onerror="__phFail(this)">` : `<span class="mono">${it.k === 'sale' ? '%' : 'S'}</span>`;
    return `<button class="cat ${st.cat === it.k ? 'on' : ''}" data-cat="${esc(it.k)}"><span class="c">${inner}</span><span class="l">${esc(it.name)}</span></button>`;
  }).join('');
  const chipItems = [{ k: 'all', name: 'Todo', n: CAT.products.length }, { k: 'new', name: "SS'27", n: CAT.products.filter(SPECIAL.new.match).length }, { k: 'sale', name: 'Sale', n: CAT.products.filter(SPECIAL.sale.match).length }, ...top.map((c) => ({ k: c.slug, name: c.name, n: c.count }))].filter((c) => c.n);
  $('#chips').innerHTML = chipItems.map((c) => `<button class="chip ${st.cat === c.k ? 'on' : ''}" data-cat="${esc(c.k)}">${esc(c.name)}<small>${c.n}</small></button>`).join('');
  const colls = [...new Set(CAT.products.flatMap((p) => p.collection.split(', ').filter(Boolean)))].sort().reverse();
  $('#coll').innerHTML = colls.length > 1 ? ['all', ...colls].map((c) => `<button class="${st.coll === c ? 'on' : ''}" data-coll="${esc(c)}">${c === 'all' ? 'Todas' : esc(c)}</button>`).join('') : '';
  $('#coll').hidden = colls.length < 2;
  $('#footCats').innerHTML = top.slice(0, 7).map((c) => `<li><button data-cat="${esc(c.slug)}">${esc(c.name)}</button></li>`).join('');
  $('#mnav').innerHTML = `<div class="caps" style="color:var(--suave)">Menú</div>` +
    [['all', 'Tienda'], ['new', "Colección SS'27"], ['sale', 'Sale']].map(([k, l]) => `<button data-cat="${k}">${l}</button>`).join('') +
    (CAT.tryon?.enabled ? '<button data-tryon-open>Probador</button>' : '') + '<a class="mnav-link" href="#nosotras">Nosotras</a>' +
    `<div class="caps" style="color:var(--suave);margin-top:14px">Categorías</div>` + top.map((c) => `<button class="sm" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`).join('');
}
function setCat(k, scroll = true) {
  st.cat = k; st.shown = 24;
  renderCats(); renderGrid();
  if (scroll) $('#shop').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

function filtered() {
  const q = st.q.trim().toLowerCase();
  let list = CAT.products.filter(catMatch).filter(collMatch).filter((p) => !q || `${p.name} ${p.desc} ${p.colors.join(' ')} ${p.ref}`.toLowerCase().includes(q));
  const s = st.sort;
  const stock = (a, b) => b.inStock - a.inStock;
  if (s === 'feat') list.sort((a, b) => stock(a, b) || (b.featured - a.featured) || (b.isNew - a.isNew));
  if (s === 'new') list.sort((a, b) => stock(a, b) || b.id - a.id);
  if (s === 'asc') list.sort((a, b) => stock(a, b) || nowPrice(a) - nowPrice(b));
  if (s === 'desc') list.sort((a, b) => stock(a, b) || nowPrice(b) - nowPrice(a));
  if (s === 'off') list.sort((a, b) => stock(a, b) || offPct(b) - offPct(a));
  return list;
}
const SUBS = { all: 'Lo auténtico también se viste.', new: 'La colección de esta temporada.', sale: 'Precios especiales, mientras haya talle.' };
function cardHTML(p) {
  const badges = [!p.inStock ? '<span class="badge outb">Agotado</span>' : '', p.promo ? `<span class="badge off">−${offPct(p)}%</span>` : '', p.isNew && !p.promo && p.inStock ? '<span class="badge">Nuevo</span>' : ''].join('');
  const firstColor = p.variants.find(avail)?.color || p.colors[0] || '';
  return `<button class="card ${p.inStock ? '' : 'out'}" data-p="${esc(p.slug)}">
    <div class="img">${imgTag(p, p.images[0], { color: firstColor })}${p.images[1] ? imgTag(p, p.images[1], { cls: 'alt', color: firstColor }) : ''}<div class="badges">${badges}</div><div class="quick">Ver prenda</div></div>
    <div class="nm">${esc(p.name)}</div>
    <div class="meta-row"><div class="price money">${p.promo ? `<b>${fmt(p.promo)}</b><s>${fmt(p.price)}</s>` : `<b>${fmt(p.price)}</b>`}</div>
    ${p.colors.length > 1 ? `<div class="dots" aria-label="${p.colors.length} colores">${p.colors.slice(0, 5).map((c) => `<span class="dot" title="${esc(c)}" style="background:${colorHex(c)}"></span>`).join('')}</div>` : ''}</div>
    ${cuotas() && p.inStock ? `<div class="inst">${esc(instLine(nowPrice(p)))}</div>` : ''}
  </button>`;
}
function renderGrid() {
  const list = filtered();
  $('#shopTitle').textContent = st.cat === 'all' ? 'La tienda' : catLabel(st.cat);
  $('#shopSub').textContent = st.q ? `${list.length} resultado${list.length === 1 ? '' : 's'} para “${st.q}”` : (SUBS[st.cat] || `${list.length} prendas`);
  if (!list.length) {
    $('#grid').innerHTML = '<div class="empty"><div class="it">No encontramos esa prenda.</div><p class="note">Probá con otra palabra o mirá toda la tienda.</p><button class="btn" data-cat="all" data-clear="1" style="margin-top:18px">Ver todo</button></div>';
    $('#moreBtn').hidden = true;
    return;
  }
  $('#grid').innerHTML = list.slice(0, st.shown).map(cardHTML).join('');
  $('#moreBtn').hidden = list.length <= st.shown;
  $('#moreBtn').textContent = `Ver más prendas (${list.length - st.shown})`;
}

// ── Ficha de producto ────────────────────────────────────
let cur = null;
function variantFor(p, color, size, other) {
  return p.variants.find((v) => (!p.colors.length || v.color === color) && (!p.sizes.length || v.size === size) && (!p.others.length || v.other === other));
}
function openProduct(slug, push = true) {
  const p = CAT.products.find((x) => x.slug === slug);
  if (!p) return;
  const first = p.variants.find(avail) || p.variants[0];
  cur = { p, color: first.color || '', size: p.sizes.length === 1 ? p.sizes[0] : '', other: p.others.length === 1 ? p.others[0] : (first.other || ''), qty: 1, img: 0 };
  if (p.sizes.length === 1 && !avail(variantFor(p, cur.color, cur.size, cur.other) || {})) cur.size = '';
  pdp.quote = null; pdp.quoteErr = '';
  renderModal();
  closeLayers();
  if (!document.body.classList.contains('pdp-mode')) { pdpReturnY = window.scrollY; lastFocus = document.activeElement; }
  document.body.classList.add('pdp-mode');
  $('#modal').classList.add('on');
  window.scrollTo({ top: 0, behavior: 'instant' });
  setTimeout(() => $('#pName')?.focus({ preventScroll: true }), 80); // el foco va al nombre, no a la miga de pan
  if (push) safeHash(`#p/${slug}`);
  document.title = `${p.name} · Samadhi Style`;
}
// Ficha de producto (página completa): galería grande a la izquierda y datos fijos a la derecha.
const FAV_KEY = 'samadhi-favoritos';
const favs = (() => { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); } })();
const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch {} };
const pdp = { cp: '', quoting: false, quote: null, quoteErr: '' };
function splitDesc(d) {
  const t = String(d || '').replace(/\r/g, '');
  const m = t.search(/\n?\s*MEDIDAS\b/i);
  return m < 0 ? { details: t.trim(), measures: '' } : { details: t.slice(0, m).trim(), measures: t.slice(m).replace(/^\s*MEDIDAS\s*/i, '').trim() };
}
function renderModal() {
  const { p, color, size, other, qty, img } = cur;
  const v = variantFor(p, color, size, other);
  const needsSize = p.sizes.length > 1 && !size;
  const ready = v && avail(v) && !needsSize;
  const sizeOk = (s) => { const x = variantFor(p, color, s, other); return x && avail(x); };
  const colorOk = (c) => p.variants.some((x) => x.color === c && avail(x));
  let note = '';
  if (v && v.stock !== null && v.stock > 0 && v.stock <= 2 && !needsSize) note = v.stock === 1 ? 'Última unidad en este talle' : 'Quedan 2 en este talle';
  if (v && !avail(v) && !needsSize) note = 'Este color y talle se agotó';
  const price = v ? (v.promo ?? v.price) : nowPrice(p);
  const list = v ? v.price : p.price;
  const images = p.images.length ? p.images : [null];
  const cat = p.categories.map((id) => CAT.categories.find((c) => c.id === id)).find(Boolean);
  const { details, measures } = splitDesc(p.desc);
  const fav = favs.has(p.id);
  const related = CAT.products.filter((x) => x.id !== p.id && x.inStock && x.categories.some((c) => p.categories.includes(c))).slice(0, 8);
  const q = pdp.quote;
  $('#modal').innerHTML = `
    <div class="pdp-top">
      <nav class="crumbs caps" aria-label="Estás en"><button type="button" data-close>Inicio</button>${cat ? `<span>/</span><button type="button" data-cat="${cat.id}">${esc(cat.name)}</button>` : ''}<span>/</span><span aria-current="page">${esc(p.name)}</span></nav>
    </div>
    <div class="pdp">
      <div class="pdp-gallery ${images.length === 1 ? 'one' : ''}" aria-label="Fotos de ${esc(p.name)}">
        ${images.map((u, i) => `<figure class="${i === 0 && images.length % 2 ? 'wide' : ''}">${imgTag(p, u, { sizes: '(max-width: 800px) 100vw, 34vw', eager: i === 0, color })}</figure>`).join('')}
      </div>
      ${images.length > 1 ? `<div class="pdp-dots" aria-hidden="true">${images.map((_, i) => `<span class="${i === 0 ? 'on' : ''}"></span>`).join('')}</div>` : ''}
      <div class="pdp-info"><div class="pdp-sticky">
        <div class="pdp-tags">${p.isNew ? '<span class="tag">New in</span>' : ''}${price < list ? `<span class="tag off">−${Math.round((1 - price / list) * 100)}%</span>` : ''}</div>
        <div class="pdp-head">
          <h3 id="pName" tabindex="-1">${esc(p.name)}</h3>
          <button class="fav ${fav ? 'on' : ''}" type="button" data-fav aria-pressed="${fav}" aria-label="${fav ? 'Sacar de' : 'Agregar a'} tus favoritos"><svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0112 7.6a4.4 4.4 0 017.5 2.8c0 5.5-7.5 10.1-7.5 10.1z"/></svg></button>
        </div>
        <div class="pdp-price money">${price < list ? `<s>${fmt(list)}</s>` : ''}<b>${fmt(price)}</b></div>
        <div class="pdp-tax">Precio sin impuestos nacionales: <span class="money">${fmt(price / 1.21)}</span></div>
        <div class="payline">${cuotas() ? `<span>${esc(instLine(price))}</span>` : ''}${transferPct() ? `<span><b class="money">${fmt(price * (1 - transferPct() / 100))}</b> con transferencia (${transferPct()}% OFF)</span>` : ''}</div>
        ${p.colors.length ? `<div class="pdp-opt"><div class="opt-label caps">Color: <b>${esc(color || '—')}</b></div><div class="swatches">${p.colors.map((c) => `<button class="sw ${c === color ? 'on' : ''} ${colorOk(c) ? '' : 'no'}" data-c="${esc(c)}" aria-label="${esc(c)}${colorOk(c) ? '' : ' (agotado)'}" title="${esc(c)}" style="background:${colorHex(c)}"></button>`).join('')}</div></div>` : ''}
        ${p.others.length > 1 ? `<div class="pdp-opt"><div class="opt-label caps">Opción: <b>${esc(other)}</b></div><div class="sizes">${p.others.map((o) => `<button class="sz ${o === other ? 'on' : ''}" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>` : ''}
        ${p.sizes.length ? `<div class="pdp-opt"><div class="opt-label caps"><span>Talle${size ? `: <b>${esc(size)}</b>` : ''}</span>${measures ? '<button class="link-btn" type="button" data-guide>Guía de talles</button>' : ''}</div>
          <div class="sizes">${p.sizes.map((s) => `<button class="sz ${s === size ? 'on' : ''} ${sizeOk(s) ? '' : 'no'}" data-s="${esc(s)}" ${sizeOk(s) ? '' : 'aria-disabled="true"'}>${esc(s)}</button>`).join('')}</div></div>` : ''}
        <div class="stocknote">${note}</div>
        <button class="btn solid wide pdp-add" id="addBtn" ${ready ? '' : 'disabled'}>${!p.inStock ? 'Agotado' : needsSize ? 'Seleccioná tu talle' : ready ? 'Agregar a la bolsa' : 'Sin stock'}</button>
        ${tryonOk(p) ? `<button class="tryon-cta" type="button" data-tryon><span class="tryon-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg></span><span><b>Probátelo</b><small>Subí una foto tuya y mirá cómo te queda</small></span></button>` : ''}
        <form class="pdp-ship" id="pdpShip" novalidate>
          <label for="pdpCp" class="caps">Calculá el envío</label>
          <div><input id="pdpCp" inputmode="numeric" placeholder="Código postal" value="${esc(pdp.cp)}" maxlength="8" autocomplete="postal-code"><button class="btn sm" type="submit" ${pdp.quoting ? 'disabled' : ''}>${pdp.quoting ? '…' : 'Calcular'}</button></div>
          ${pdp.quoteErr ? `<p class="note err">${esc(pdp.quoteErr)}</p>` : ''}
          ${q ? `<ul>${q.map((o) => `<li><span>${esc(o.label)}<small>${esc(o.error || o.days || o.detail || '')}</small></span><span class="money">${o.error ? '' : o.cost ? fmt(o.cost) : 'Sin cargo'}</span></li>`).join('')}</ul>` : ''}
        </form>
        <div class="pdp-acc">
          ${details ? `<details open><summary>Detalles de la prenda</summary><div>${esc(details).replace(/\n/g, '<br>')}</div></details>` : ''}
          ${measures ? `<details id="pdpMeasures"><summary>Medidas</summary><div>${esc(measures).replace(/\n/g, '<br>')}</div></details>` : ''}
          <details><summary>Envíos y retiro</summary><div>Envíos a todo el país con Andreani, a domicilio o a sucursal${CAT.shipping.freeShippingFrom ? `. Sin cargo desde ${fmt(CAT.shipping.freeShippingFrom)}` : ''}.${CAT.shipping.pickup ? ` Retiro sin cargo en ${esc(CAT.shipping.pickup.address)}.` : ''}</div></details>
          <details><summary>Medios de pago</summary><div>${cuotas() ? `${esc(instLine(price))} con Mercado Pago.` : 'Mercado Pago.'}${transferPct() ? ` ${transferPct()}% OFF pagando por transferencia.` : ''}</div></details>
          <details><summary>Cambios y devoluciones</summary><div>Tenés 30 días para cambiar la prenda, sin uso y con etiquetas, y 10 días para arrepentirte de la compra. <button class="link-btn" type="button" data-legal="returns">Ver la política completa</button></div></details>
        </div>
        ${p.ref ? `<div class="pdp-ref caps">Art. ${esc(p.ref)}</div>` : ''}
      </div></div>
    </div>
    ${related.length ? `<section class="pdp-related"><h4 class="caps">También te puede gustar</h4><div class="pdp-rel-row">${related.map(cardHTML).join('')}</div></section>` : ''}
    <div class="pdp-bar"><div><b>${esc(p.name)}</b><span class="money">${fmt(price)}</span></div><button class="btn solid" type="button" data-add-bar ${p.inStock ? '' : 'disabled'}>${ready ? 'Agregar a la bolsa' : p.inStock ? 'Elegí talle' : 'Agotado'}</button></div>`;
  // Celular: los puntitos siguen a la foto visible.
  const g = $('#modal .pdp-gallery');
  if (g && images.length > 1) g.onscroll = () => { const i = Math.round(g.scrollLeft / g.clientWidth); $$('#modal .pdp-dots span').forEach((d, k) => d.classList.toggle('on', k === i)); };
}
function bindModal() {
  $('#modal').addEventListener('submit', async (e) => {
    if (e.target.id !== 'pdpShip') return;
    e.preventDefault();
    pdp.cp = $('#pdpCp').value.replace(/\D/g, '').slice(0, 4);
    if (pdp.cp.length !== 4) { pdp.quoteErr = 'El código postal tiene 4 números.'; pdp.quote = null; return renderModal(); }
    const v = variantFor(cur.p, cur.color, cur.size, cur.other) || cur.p.variants.find(avail) || cur.p.variants[0];
    pdp.quoting = true; pdp.quoteErr = ''; renderModal();
    try { pdp.quote = (await api('/api/shipping/quote', { cp: pdp.cp, items: [{ variant_id: v.id, qty: 1 }] })).options; }
    catch (err) { pdp.quoteErr = err.message; pdp.quote = null; }
    pdp.quoting = false; renderModal();
  });
  $('#modal').addEventListener('click', (e) => {
    if (!cur) return;
    const t = e.target;
    const im = t.closest('[data-img]'); if (im) { cur.img = Number(im.dataset.img); renderModal(); return; }
    const sw = t.closest('[data-c]');
    if (sw) {
      cur.color = sw.dataset.c; cur.qty = 1;
      if (cur.size) { const v = variantFor(cur.p, cur.color, cur.size, cur.other); if (!v || !avail(v)) cur.size = ''; }
      renderModal(); return;
    }
    const o = t.closest('[data-o]'); if (o) { cur.other = o.dataset.o; renderModal(); return; }
    const sz = t.closest('[data-s]'); if (sz && !sz.classList.contains('no')) { cur.size = sz.dataset.s; cur.qty = 1; renderModal(); return; }
    const q = t.closest('[data-q]'); if (q && !q.disabled) { cur.qty = Math.max(1, cur.qty + Number(q.dataset.q)); renderModal(); return; }
    if (t.closest('#addBtn') && !t.closest('#addBtn').disabled) {
      const v = variantFor(cur.p, cur.color, cur.size, cur.other);
      addToCart(v.id, cur.qty);
      closeLayers(); openCart(); return;
    }
    if (t.closest('[data-tryon]')) { const p = cur.p, img = cur.img; closeLayers(); openTryon(p, img); return; }
    if (t.closest('[data-fav]')) { const id = cur.p.id; if (favs.has(id)) favs.delete(id); else favs.add(id); saveFavs(); toast(favs.has(id) ? 'Agregado a tus favoritos' : 'Sacado de tus favoritos'); renderModal(); return; }
    if (t.closest('[data-guide]')) { const d = $('#pdpMeasures'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
    if (t.closest('[data-add-bar]')) { const b = $('#addBtn'); if (b && !b.disabled) b.click(); else $('#modal .pdp-info .sizes, #modal .pdp-info .swatches')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (t.closest('[data-close]')) closeAll();
  });
}

// ── Bolsa y checkout ─────────────────────────────────────
function cartLines() {
  return cart.map((c) => {
    const v = variantById.get(c.variant_id);
    return v ? { ...c, v, p: v.product, price: v.promo ?? v.price, list: v.price, max: v.stock ?? 20 } : null;
  }).filter(Boolean);
}
function addToCart(variantId, qty) {
  const v = variantById.get(variantId);
  const ex = cart.find((c) => c.variant_id === variantId);
  const max = v.stock ?? 20;
  if (ex) ex.qty = Math.min(max, ex.qty + qty); else cart.push({ variant_id: variantId, qty: Math.min(max, qty) });
  saveCart(); updateCount(); toast('Sumado a tu bolsa');
}
function updateCount() { $('#bagCount').textContent = cartLines().reduce((a, l) => a + l.qty, 0); }
const subtotal = () => cartLines().reduce((a, l) => a + l.price * l.qty, 0);
const savings = () => cartLines().reduce((a, l) => a + (l.list - l.price) * l.qty, 0);
const vLabel = (v) => [v.color, v.size && `Talle ${v.size}`, v.other].filter(Boolean).join(' · ');

const co = { step: 'bag', ship: null, options: [], branches: [], coupon: null, errors: {}, form: {}, busy: false, alert: '' };
function head(t) { return `<div class="dhead"><h3>${t}</h3><button class="close" data-close aria-label="Cerrar"><svg viewBox="0 0 16 16"><path d="M2 2l12 12M14 2L2 14"/></svg></button></div>`; }
function renderDrawer() {
  const lines = cartLines();
  if (!lines.length && co.step !== 'done') {
    $('#drawer').innerHTML = head('Tu bolsa') + `<div class="dbody"><div class="dempty"><div class="it">Tu bolsa está vacía.</div><p class="note" style="margin:10px 0 24px">Lo auténtico también se viste.</p><button class="btn" data-cat="new">Ver la colección</button></div></div>`;
    return;
  }
  if (co.step === 'bag') {
    $('#drawer').innerHTML = head('Tu bolsa') + `<div class="dbody">${lines.map((l, ix) => `
      <div class="line-item">
        <div class="th">${imgTag(l.p, l.p.images[0], { sizes: '76px', color: l.v.color })}</div>
        <div><div class="nm">${esc(l.p.name)}</div><div class="vr">${esc(vLabel(l.v))}</div>
          <div style="display:flex;align-items:center;gap:14px;margin-top:10px"><div class="qty"><button data-iq="${ix}|-1" aria-label="Menos" ${l.qty <= 1 ? 'disabled' : ''}>−</button><span>${l.qty}</span><button data-iq="${ix}|1" aria-label="Más" ${l.qty >= l.max ? 'disabled' : ''}>+</button></div>
          <button class="link-btn" data-rm="${ix}">Quitar</button></div></div>
        <div class="money" style="text-align:right">${fmt(l.price * l.qty)}${l.list > l.price ? `<div><s style="font-size:11px;color:var(--suave)">${fmt(l.list * l.qty)}</s></div>` : ''}</div>
      </div>`).join('')}</div>
      <div class="dfoot">
        ${savings() ? `<div class="tot save"><span>Ahorrás</span><span class="money">${fmt(savings())}</span></div>` : ''}
        <div class="tot big"><span>Subtotal</span><span class="money">${fmt(subtotal())}</span></div>
        ${freeShipNote()}
        <button class="btn solid wide" id="toCheckout">Iniciar compra</button>
      </div>`;
    return;
  }
  if (co.step === 'done') { $('#drawer').innerHTML = head(co.order?.status === 'pending_payment' ? 'Tu pedido' : 'Gracias') + doneHTML(); return; }
  // Checkout
  const f = co.form, E = co.errors;
  const err = (k) => (E[k] ? `<span class="err">${esc(E[k])}</span>` : '');
  const inp = (k, label, attrs = '') => `<div class="fl"><label for="f-${k}">${label}</label><input id="f-${k}" name="${k}" value="${esc(f[k] || '')}" ${E[k] ? 'aria-invalid="true"' : ''} ${attrs}>${err(k)}</div>`;
  const method = f.method || '';
  const opt = co.options.find((o) => o.method === method);
  const shipCost = opt && !opt.error ? opt.cost : 0;
  const discount = co.coupon?.discount || 0;
  const payWith = f.payment || 'mercadopago';
  const tDisc = payWith === 'transferencia' ? Math.round((subtotal() - discount) * transferPct() / 100) : 0;
  const total = subtotal() - discount - tDisc + shipCost;
  $('#drawer').innerHTML = head('Finalizar compra') + `<div class="dbody"><form class="co" id="coForm" novalidate>
      ${co.alert ? `<div class="alert" role="alert">${esc(co.alert)}</div>` : ''}
      <h4 class="caps">Tus datos</h4>
      ${inp('name', 'Nombre y apellido', 'autocomplete="name" required')}
      ${inp('email', 'Email', 'type="email" autocomplete="email" inputmode="email" required')}
      <div class="row2">${inp('phone', 'Teléfono', 'type="tel" autocomplete="tel" inputmode="tel" required')}${inp('dni', 'DNI', 'inputmode="numeric" required')}</div>
      <h4 class="caps">Entrega</h4>
      <div class="cp-row">${inp('cp', 'Código postal', 'inputmode="numeric" maxlength="4" autocomplete="postal-code"')}<button type="button" class="btn sm" id="quoteBtn">Calcular</button></div>
      <div class="ship-opts" id="shipOpts">${shipOptionsHTML(method)}</div>
      ${err('method')}
      ${method === 'andreani_domicilio' ? `
        <div class="row3">${inp('calle', 'Calle', 'autocomplete="address-line1"')}${inp('numero', 'Altura', 'inputmode="numeric"')}${inp('piso', 'Piso / Depto')}</div>
        <div class="row2">${inp('localidad', 'Localidad', 'autocomplete="address-level2"')}${inp('provincia', 'Provincia', 'autocomplete="address-level1"')}</div>
        ${inp('referencia', 'Entre calles (opcional)')}` : ''}
      ${method === 'andreani_sucursal' ? `<div class="fl"><label for="f-branch">Sucursal Andreani</label><select id="f-branch" name="branch">${co.branches.length ? '<option value="">Elegí la sucursal</option>' + co.branches.map((b) => `<option value="${esc(b.id)}" ${f.branch === b.id ? 'selected' : ''}>${esc(b.nombre)} · ${esc(b.direccion)}</option>`).join('') : '<option value="">Buscando sucursales…</option>'}</select>${err('branch')}</div>` : ''}
      <h4 class="caps">Pago</h4>
      <div class="ship-opts">
        <label class="ship-opt"><input type="radio" name="payment" value="mercadopago" ${payWith === 'mercadopago' ? 'checked' : ''}><span>Mercado Pago<small>${cuotas() ? `Hasta ${cuotas()} cuotas sin interés · ` : ''}tarjetas, débito y dinero en cuenta</small></span><span></span></label>
        ${transferPct() || CAT.payments?.transfer ? `<label class="ship-opt"><input type="radio" name="payment" value="transferencia" ${payWith === 'transferencia' ? 'checked' : ''}><span>Transferencia bancaria<small>Te mostramos el CBU al confirmar</small></span><span class="tag-off">${transferPct()}% OFF</span></label>` : ''}
      </div>
      <h4 class="caps">Cupón</h4>
      <div class="coupon"><div class="fl"><label for="f-coupon">Código</label><input id="f-coupon" name="coupon" value="${esc(f.coupon || '')}" autocomplete="off" style="text-transform:uppercase">${err('coupon')}</div><button type="button" class="btn sm" id="couponBtn">Aplicar</button></div>
      ${co.coupon ? `<p class="note" style="color:var(--oliva)">Cupón ${esc(co.coupon.code)} aplicado.</p>` : ''}
      <div class="fl"><label for="f-note">Mensaje (opcional)</label><textarea id="f-note" name="note" rows="2" placeholder="Si es para regalo, contanos.">${esc(f.note || '')}</textarea></div>
    </form></div>
    <div class="dfoot">
      <div class="tot"><span>Productos</span><span class="money">${fmt(subtotal())}</span></div>
      ${discount ? `<div class="tot save"><span>Cupón</span><span class="money">− ${fmt(discount)}</span></div>` : ''}
      ${tDisc ? `<div class="tot save"><span>${transferPct()}% OFF transferencia</span><span class="money">− ${fmt(tDisc)}</span></div>` : ''}
      <div class="tot"><span>Envío</span><span class="money">${method ? (shipCost ? fmt(shipCost) : 'Sin cargo') : 'Elegí la entrega'}</span></div>
      <div class="tot big"><span>Total</span><span class="money">${fmt(total)}</span></div>
      <button class="btn solid wide" id="payBtn" ${co.busy ? 'disabled' : ''}>${co.busy ? 'Preparando tu pedido…' : payWith === 'transferencia' ? 'Confirmar pedido' : 'Pagar con Mercado Pago'}</button>
      <div class="mp-note">${payWith === 'transferencia' ? 'Reservamos tus prendas mientras transferís' : `Pago seguro en Mercado Pago${cuotas() ? ` · hasta ${cuotas()} cuotas sin interés` : ''}`}</div>
      <button class="link-btn" id="backBag" style="justify-self:center">Volver a la bolsa</button>
    </div>`;
}
function freeShipNote() {
  const from = CAT.shipping.freeShippingFrom;
  if (!from) return '<p class="note">El envío se calcula con tu código postal.</p>';
  const left = from - subtotal();
  return `<p class="note">${left > 0 ? `Te faltan ${fmt(left)} para el envío sin cargo.` : 'Tu envío es sin cargo.'}</p>`;
}
function shipOptionsHTML(method) {
  if (co.quoting) return '<p class="note">Cotizando con Andreani…</p>';
  const opts = co.options.length ? co.options : (CAT.shipping.pickup ? [{ method: 'retiro', label: 'Retiro en el local', cost: 0, detail: [CAT.shipping.pickup.address, CAT.shipping.pickup.hours].filter(Boolean).join(' · ') }] : []);
  if (!opts.length) return '<p class="note">Escribí tu código postal para ver las opciones de envío.</p>';
  return opts.map((o) => o.error
    ? `<div class="ship-opt err"><span></span><span>${esc(o.label)}<small>${esc(o.error)}</small></span><span></span></div>`
    : `<label class="ship-opt"><input type="radio" name="method" value="${o.method}" ${method === o.method ? 'checked' : ''}><span>${esc(o.label)}<small>${esc(o.days || o.detail || '')}</small></span><span class="money">${o.cost ? fmt(o.cost) : 'Sin cargo'}</span></label>`).join('')
    + (co.options.length ? '' : '<p class="note">Escribí tu código postal para cotizar el envío con Andreani.</p>');
}
function readForm() {
  const form = $('#coForm');
  if (!form) return;
  for (const el of form.elements) if (el.name && el.type !== 'radio') co.form[el.name] = el.value;
  const m = form.querySelector('input[name="method"]:checked');
  if (m) co.form.method = m.value;
  const pw = form.querySelector('input[name="payment"]:checked');
  if (pw) co.form.payment = pw.value;
}
async function api(path, body, method) {
  method = method || (body ? 'POST' : 'GET');
  if (window.__SAMADHI_API) return window.__SAMADHI_API(path, { method, body });
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'No pudimos completar el pedido. Probá de nuevo.'); e.data = data; throw e; }
  return data;
}
const cartPayload = () => cartLines().map((l) => ({ variant_id: l.variant_id, qty: l.qty }));
async function quote() {
  readForm();
  const cp = (co.form.cp || '').replace(/\D/g, '');
  if (cp.length !== 4) { co.errors = { ...co.errors, cp: 'El código postal tiene 4 números.' }; renderDrawer(); return; }
  co.errors = { ...co.errors, cp: '' }; co.quoting = true; renderDrawer();
  try {
    co.options = (await api('/api/shipping/quote', { cp, items: cartPayload(), coupon: co.coupon?.code })).options;
    if (!co.form.method || !co.options.some((o) => o.method === co.form.method && !o.error)) co.form.method = co.options.find((o) => !o.error)?.method || '';
  } catch (e) { co.alert = e.message; }
  co.quoting = false; renderDrawer();
  if (co.form.method === 'andreani_sucursal') loadBranches();
}
async function loadBranches() {
  const cp = (co.form.cp || '').replace(/\D/g, '');
  try { co.branches = (await api(`/api/shipping/branches?cp=${cp}`)).branches; } catch (e) { co.alert = e.message; }
  renderDrawer();
}
async function applyCoupon() {
  readForm();
  const code = (co.form.coupon || '').trim();
  if (!code) return;
  try { co.coupon = await api('/api/coupons/check', { code, items: cartPayload() }); co.errors = { ...co.errors, coupon: '' }; if (co.form.cp) await quote(); }
  catch (e) { co.coupon = null; co.errors = { ...co.errors, coupon: e.message }; }
  renderDrawer();
}
async function pay() {
  readForm();
  const f = co.form;
  const errors = {};
  if ((f.name || '').trim().length < 3) errors.name = 'Escribí tu nombre y apellido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email || '')) errors.email = 'Revisá el email.';
  if ((f.phone || '').replace(/\D/g, '').length < 8) errors.phone = 'Dejanos un teléfono con código de área.';
  if ((f.dni || '').replace(/\D/g, '').length < 7) errors.dni = 'Andreani pide el DNI de quien recibe.';
  if (!f.method) errors.method = 'Calculá el envío con tu código postal y elegí una opción.';
  if (f.method === 'andreani_domicilio') { if (!f.calle) errors.calle = 'Falta la calle.'; if (!f.numero) errors.numero = 'Falta la altura.'; if (!f.localidad) errors.localidad = 'Falta la localidad.'; }
  if (f.method === 'andreani_sucursal' && !f.branch) errors.branch = 'Elegí la sucursal.';
  co.errors = errors; co.alert = '';
  if (Object.keys(errors).length) { renderDrawer(); $('#drawer [aria-invalid="true"]')?.focus(); return; }
  co.busy = true; renderDrawer();
  const [piso, ...dep] = (f.piso || '').split('/').map((s) => s.trim());
  try {
    const r = await api('/api/checkout', {
      items: cartPayload(), coupon: co.coupon?.code || '', note: f.note, payment: f.payment || 'mercadopago',
      customer: { name: f.name, email: f.email, phone: f.phone, dni: f.dni },
      shipping: { method: f.method, cp: f.cp, calle: f.calle, numero: f.numero, piso, depto: dep.join(' '), localidad: f.localidad, provincia: f.provincia, referencia: f.referencia, branch: f.branch },
    });
    try { localStorage.setItem('samadhi-last-order', r.token); } catch {}
    cart = []; saveCart(); updateCount();
    if (r.demo) { co.busy = false; co.placed = r; co.step = 'done'; await refreshPlaced(); return; }
    location.href = r.payUrl;
  } catch (e) {
    co.busy = false;
    co.errors = e.data?.errors || {};
    co.alert = e.message;
    renderDrawer();
  }
}
// Después de confirmar (vista previa): pago simulado o datos para transferir, y el estado del pedido.
async function refreshPlaced() {
  try { co.order = await api(`/api/orders/${co.placed.token}`); } catch { co.order = null; }
  renderDrawer();
}
function doneHTML() {
  const o = co.order;
  if (!o) return '<div class="dbody"><p class="note">Cargando tu pedido…</p></div>';
  const items = o.items.map((i) => `<div class="tot"><span>${esc(i.name)} <small class="note">· ${esc(i.variant_label)} × ${i.qty}</small></span><span class="money">${fmt(i.unit_price * i.qty)}</span></div>`).join('');
  let main;
  if (o.status === 'pending_payment' && o.transfer) {
    const t = o.transfer;
    main = `<div class="caps">Pedido ${esc(o.number)} · reservado</div><div class="it" style="font-size:24px;line-height:1.2">Solo falta la transferencia.</div>
      <div class="money" style="font-family:var(--serif);font-size:30px">${fmt(o.total)}</div><p class="note">Ya tiene el ${t.discount}% OFF. Guardamos tus prendas ${t.hours} horas.</p>
      ${[['Titular', t.holder], ['Banco', t.bank], ['CBU', t.cbu], ['Alias', t.alias]].filter((x) => x[1]).map(([k, v]) => `<div class="tot"><span>${k}</span><b class="money" style="font-weight:500">${esc(v)}</b></div>`).join('') || '<p class="note">Los datos bancarios se cargan en el panel, en Configuración → Pagos.</p>'}
      ${t.whatsapp ? `<p class="note">Mandanos el comprobante por WhatsApp al ${esc(t.whatsapp)}.</p>` : ''}`;
  } else if (o.status === 'pending_payment') {
    const failed = o.paymentStatus === 'rejected';
    main = `<div class="caps">Pedido ${esc(o.number)}</div><div class="it" style="font-size:24px;line-height:1.2">${failed ? 'El pago fue rechazado.' : 'Pago con Mercado Pago'}</div>
      <p class="note">Vista previa: este paso reemplaza la pantalla de Mercado Pago. No se cobra nada.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn solid" data-sim="1">Aprobar pago</button><button class="btn" data-sim="0">Rechazar pago</button></div>`;
  } else {
    main = `<div class="monogram" style="margin:0 auto;border-color:var(--linea);width:96px;height:96px"><span style="font-size:54px">S</span></div>
      <div class="it" style="font-size:26px;line-height:1.2;text-align:center">Gracias por ser parte<br>de esta historia.</div>
      <p class="note" style="text-align:center">Pedido ${esc(o.number)} · ${esc(o.statusLabel)}. ${session.customer ? 'Lo ves en Mi cuenta.' : 'Te escribimos a ' + esc(o.email) + '.'}</p>`;
  }
  return `<div class="dbody"><div style="display:grid;gap:14px;padding-top:18px">${main}<div style="border-top:1px solid var(--linea);padding-top:12px;display:grid;gap:6px">${items}<div class="tot big"><span>Total</span><span class="money">${fmt(o.total)}</span></div></div></div></div>
    <div class="dfoot">${session.customer ? '<button class="btn wide" data-acct="1">Ver Mi cuenta</button>' : ''}<button class="btn solid wide" data-close>Seguir mirando</button></div>`;
}

function bindDrawer() {
  $('#drawer').addEventListener('click', (e) => {
    const t = e.target;
    const iq = t.closest('[data-iq]');
    if (iq && !iq.disabled) { const [ix, d] = iq.dataset.iq.split('|').map(Number); const l = cartLines()[ix]; const c = cart.find((x) => x.variant_id === l.variant_id); c.qty = Math.min(l.max, Math.max(1, c.qty + d)); saveCart(); updateCount(); renderDrawer(); return; }
    const rm = t.closest('[data-rm]'); if (rm) { const l = cartLines()[Number(rm.dataset.rm)]; cart = cart.filter((x) => x.variant_id !== l.variant_id); saveCart(); updateCount(); renderDrawer(); return; }
    if (t.closest('#toCheckout')) { co.step = 'co'; co.alert = ''; prefillCheckout(); renderDrawer(); $('#f-name')?.focus(); return; }
    if (t.closest('#backBag')) { readForm(); co.step = 'bag'; renderDrawer(); return; }
    if (t.closest('#quoteBtn')) { quote(); return; }
    if (t.closest('#couponBtn')) { applyCoupon(); return; }
    if (t.closest('#payBtn')) { pay(); return; }
    const sim = t.closest('[data-sim]');
    if (sim) { sim.disabled = true; api('/api/dev/mock-payment', { token: co.placed.token, approve: sim.dataset.sim === '1' }).then(refreshPlaced); return; }
    if (t.closest('[data-acct]')) { closeAll(); openAccount(); return; }
    if (t.closest('[data-close]')) closeAll();
  });
  $('#drawer').addEventListener('change', (e) => {
    if (e.target.name === 'method') { readForm(); co.errors.method = ''; renderDrawer(); if (co.form.method === 'andreani_sucursal' && !co.branches.length) loadBranches(); }
    if (e.target.name === 'branch') co.form.branch = e.target.value;
    if (e.target.name === 'payment') { readForm(); renderDrawer(); }
  });
  $('#drawer').addEventListener('focusout', (e) => { if (e.target.name === 'email' || e.target.name === 'name') { readForm(); syncCart(); } });
  $('#drawer').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.name === 'cp') { e.preventDefault(); quote(); } });
  $('#drawer').addEventListener('submit', (e) => e.preventDefault());
}
function openCart() { if (co.step === 'done') { co.step = 'bag'; co.order = null; } renderDrawer(); openLayer('#drawer'); }

// ── Ingreso y Mi cuenta ──────────────────────────────────
let session = { staff: null, customer: null };
const acct = { view: 'login', tab: 'pedidos', orders: null, error: '', errors: {}, busy: false, open: null };
const DEMO_USERS = window.__SAMADHI_DEMO_USERS || null;
function prefillCheckout() {
  const c = session.customer;
  if (!c) return;
  for (const k of ['name', 'email', 'phone', 'dni']) if (!co.form[k] && c[k]) co.form[k] = c[k];
}
function renderUserBtn() {
  const who = session.staff || session.customer;
  $('#userBtn .lbl').textContent = who ? (who.name || '').split(' ')[0] || 'Mi cuenta' : 'Ingresar';
  $('#userBtn').setAttribute('aria-label', session.staff ? 'Ir al panel' : session.customer ? 'Abrir Mi cuenta' : 'Ingresar');
}
async function loadSession() {
  try { session = await api('/api/auth/session'); } catch { session = { staff: null, customer: null }; }
  renderUserBtn();
  if (session.customer && cart.length) syncCart();
}
function openAccount() {
  if (session.staff) return goPanel();
  acct.view = session.customer ? 'account' : 'login';
  acct.error = ''; acct.errors = {};
  renderAccount();
  openLayer('#acct');
  if (session.customer) loadOrders();
}
function goPanel() {
  if (window.__SAMADHI_OPEN_ADMIN) { closeAll(); window.__SAMADHI_OPEN_ADMIN(); } else location.href = '/admin/';
}
async function loadOrders() {
  try { acct.orders = (await api('/api/account/orders')).orders; } catch (e) { acct.error = e.message; acct.orders = []; }
  renderAccount();
}
function renderAccount() {
  const h = (t) => `<div class="dhead"><h3>${t}</h3><button class="close" data-close aria-label="Cerrar"><svg viewBox="0 0 16 16"><path d="M2 2l12 12M14 2L2 14"/></svg></button></div>`;
  const E = acct.errors;
  const fl = (id, label, attrs = '', val = '') => `<div class="fl"><label for="a-${id}">${label}</label><input id="a-${id}" name="${id}" value="${esc(val)}" ${E[id] ? 'aria-invalid="true"' : ''} ${attrs}>${E[id] ? `<span class="err">${esc(E[id])}</span>` : ''}</div>`;
  const alert = acct.error ? `<div class="alert" role="alert">${esc(acct.error)}</div>` : '';
  if (acct.view === 'forgot' || acct.view === 'reset') {
    const forgot = acct.view === 'forgot';
    $('#acct').innerHTML = h(forgot ? 'Olvidé mi contraseña' : 'Nueva contraseña') + `<div class="dbody"><form class="co" id="${forgot ? 'forgotForm' : 'resetForm'}" novalidate>
      ${acct.sent ? `<div class="notice-ok">${esc(acct.sent)}</div>` : `<p class="note">${forgot ? 'Escribí tu email y te mandamos un link para elegir una contraseña nueva.' : 'Elegí tu nueva contraseña. Al menos 10 caracteres.'}</p>`}
      ${alert}
      ${forgot ? fl('email', 'Email', 'type="email" autocomplete="username" inputmode="email"') : fl('password', 'Nueva contraseña', 'type="password" autocomplete="new-password"')}
      <button class="btn solid wide" type="submit" ${acct.busy ? 'disabled' : ''}>${acct.busy ? 'Un momento…' : forgot ? 'Mandarme el link' : 'Guardar contraseña'}</button>
      <button class="link-btn" type="button" data-av="login" style="justify-self:center">Volver a ingresar</button>
    </form></div>`;
    return;
  }
  if (acct.view === 'login' || acct.view === 'register') {
    const reg = acct.view === 'register';
    $('#acct').innerHTML = h(reg ? 'Crear cuenta' : 'Ingresar') + `<div class="dbody"><form class="co" id="authForm" novalidate>
      <p class="note">${reg ? 'Guardá tus datos para comprar más rápido y seguí tus pedidos.' : 'Con tu cuenta ves tus pedidos y comprás más rápido. Si sos del equipo, entrás al panel.'}</p>
      ${alert}
      ${reg ? fl('name', 'Nombre y apellido', 'autocomplete="name"') : ''}
      ${fl('email', 'Email', 'type="email" autocomplete="username" inputmode="email"')}
      ${fl('password', 'Contraseña', `type="password" autocomplete="${reg ? 'new-password' : 'current-password'}"`)}
      ${reg ? '<p class="note">Al menos 10 caracteres.</p>' : ''}
      <button class="btn solid wide" type="submit" ${acct.busy ? 'disabled' : ''}>${acct.busy ? 'Un momento…' : reg ? 'Crear mi cuenta' : 'Ingresar'}</button>
      <button class="link-btn" type="button" data-av="${reg ? 'login' : 'register'}" style="justify-self:center">${reg ? 'Ya tengo cuenta' : 'Crear una cuenta'}</button>
      ${reg ? '' : '<button class="link-btn" type="button" data-av="forgot" style="justify-self:center">¿Olvidaste tu contraseña?</button>'}
      ${DEMO_USERS && !reg ? `<div class="demo-users"><div class="caps">Usuarios de prueba</div>${DEMO_USERS.map((u, i) => `<button type="button" class="demo-user" data-demo="${i}"><b>${esc(u.label)}</b><span>${esc(u.email)}</span><span class="money">${esc(u.password)}</span></button>`).join('')}<p class="note">Tocá uno para completar los datos y después “Ingresar”.</p></div>` : ''}
    </form></div>`;
    return;
  }
  const c = session.customer || {};
  const tabs = `<div class="acct-tabs">${[['pedidos', 'Mis pedidos'], ['datos', 'Mis datos']].map(([k, l]) => `<button class="${acct.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (acct.tab === 'pedidos') {
    if (!acct.orders) body = '<p class="note">Cargando tus pedidos…</p>';
    else if (!acct.orders.length) body = '<div class="dempty" style="padding:40px 0"><div class="it">Todavía no hiciste pedidos.</div><button class="btn" data-cat="new" style="margin-top:18px">Ver la colección</button></div>';
    else body = acct.orders.map((o) => `<div class="order-card">
        <button class="order-head" data-open="${esc(o.number)}" aria-expanded="${acct.open === o.number}">
          <span><b>${esc(o.number)}</b><small class="note">${esc(String(o.createdAt).slice(0, 10).split('-').reverse().join('/'))} · ${((n) => `${n} ${n === 1 ? 'prenda' : 'prendas'}`)(o.items.reduce((a, i) => a + i.qty, 0))}</small></span>
          <span class="st st-${esc(o.status)}">${esc(o.statusLabel)}</span><span class="money">${fmt(o.total)}</span></button>
        ${acct.open === o.number ? `<div class="order-body">
          ${o.items.map((i) => `<div class="tot"><span>${esc(i.name)} <small class="note">· ${esc(i.variant_label)} × ${i.qty}</small></span><span class="money">${fmt(i.unit_price * i.qty)}</span></div>`).join('')}
          <div class="tot"><span>${esc(o.shippingLabel)}</span><span class="money">${o.shippingCost ? fmt(o.shippingCost) : 'Sin cargo'}</span></div>
          ${o.discount ? `<div class="tot save"><span>Descuentos</span><span class="money">− ${fmt(o.discount)}</span></div>` : ''}
          ${o.andreaniNumber ? `<p class="note">Envío Andreani ${esc(o.andreaniNumber)}${o.trackingStatus ? ' · ' + esc(o.trackingStatus) : ''}</p>` : ''}<button class="btn sm" type="button" data-track-order="${esc(o.number)}">Seguir mi pedido</button>
          ${o.transfer ? `<p class="note">Falta la transferencia de ${fmt(o.total)}${o.transfer.alias ? ` al alias ${esc(o.transfer.alias)}` : ''}.</p>` : ''}
        </div>` : ''}
      </div>`).join('');
  } else {
    body = `<form class="co" id="meForm" novalidate>${alert}
      ${fl('name', 'Nombre y apellido', 'autocomplete="name"', c.name)}
      <div class="fl"><label>Email</label><input value="${esc(c.email)}" disabled></div>
      <div class="row2">${fl('phone', 'Teléfono', 'type="tel" inputmode="tel"', c.phone)}${fl('dni', 'DNI', 'inputmode="numeric"', c.dni)}</div>
      <button class="btn solid wide" type="submit">Guardar mis datos</button></form>`;
  }
  $('#acct').innerHTML = h(`Hola, ${esc((c.name || '').split(' ')[0] || 'bienvenida')}`) + `<div class="dbody">${tabs}${body}</div>
    <div class="dfoot"><button class="link-btn" id="logoutBtn" style="justify-self:center">Cerrar sesión</button></div>`;
}
function bindAccount() {
  $('#userBtn').addEventListener('click', openAccount);
  $('#acct').addEventListener('click', async (e) => {
    const t = e.target;
    const av = t.closest('[data-av]'); if (av) { acct.view = av.dataset.av; acct.error = ''; acct.errors = {}; acct.sent = ''; renderAccount(); return; }
    const d = t.closest('[data-demo]');
    if (d) { const u = DEMO_USERS[Number(d.dataset.demo)]; $('#a-email').value = u.email; $('#a-password').value = u.password; $('#a-password').focus(); return; }
    const tab = t.closest('[data-tab]'); if (tab) { acct.tab = tab.dataset.tab; acct.error = ''; renderAccount(); return; }
    const op = t.closest('[data-open]'); if (op) { acct.open = acct.open === op.dataset.open ? null : op.dataset.open; renderAccount(); return; }
    if (t.closest('#logoutBtn')) { await api('/api/auth/logout', {}); await loadSession(); closeAll(); toast('Cerraste sesión'); return; }
    if (t.closest('[data-close]')) closeAll();
  });
  $('#acct').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    acct.error = ''; acct.errors = {};
    if (e.target.id === 'forgotForm') {
      acct.busy = true; renderAccount();
      try { const r = await api('/api/auth/forgot', f); acct.sent = r.message; } catch (err) { acct.error = err.message; }
      acct.busy = false; renderAccount(); return;
    }
    if (e.target.id === 'resetForm') {
      acct.busy = true; renderAccount();
      try { await api('/api/auth/reset', { token: acct.resetToken, password: f.password }); acct.busy = false; acct.view = 'login'; acct.sent = ''; toast('Listo, ya podés ingresar con tu nueva contraseña'); renderAccount(); }
      catch (err) { acct.busy = false; acct.error = err.message; renderAccount(); }
      return;
    }
    if (e.target.id === 'authForm') {
      acct.busy = true; renderAccount();
      try {
        const r = await api(acct.view === 'register' ? '/api/auth/register' : '/api/auth/login', f);
        acct.busy = false;
        await loadSession();
        if (r.type === 'staff') { toast(`Hola, ${(r.name || '').split(' ')[0]} · ${r.roleLabel}`); goPanel(); return; }
        toast(`Hola, ${(r.name || '').split(' ')[0]}`);
        acct.view = 'account'; acct.tab = 'pedidos'; acct.orders = null; renderAccount(); loadOrders();
      } catch (err) { acct.busy = false; acct.error = err.message; acct.errors = err.data?.errors || {}; renderAccount(); }
    }
    if (e.target.id === 'meForm') {
      try { await api('/api/account/me', f, 'PUT'); await loadSession(); toast('Datos guardados'); renderAccount(); }
      catch (err) { acct.error = err.message; renderAccount(); }
    }
  });
}

// ── Capas, navegación y arranque ─────────────────────────
// Cambia la dirección sin recargar; en vistas previas sin URL propia simplemente no hace nada.
function safeHash(h) { try { history.replaceState(null, '', h || location.pathname + location.search); } catch {} }
let lastFocus = null;
function openLayer(sel) { lastFocus = document.activeElement; $('#scrim').classList.add('on'); $(sel).classList.add('on'); document.body.style.overflow = 'hidden'; setTimeout(() => $(sel).querySelector('button, input')?.focus({ preventScroll: true }), 50); }
let pdpReturnY = 0;
const LAYERS = ['#drawer', '#mnav', '#scrim', '#acct', '#track', '#legal', '#tryon'];
const layerOpen = () => LAYERS.some((s) => $(s).classList.contains('on'));
// Cierra bolsa, menú y paneles, pero deja abierta la ficha de producto si estaba.
function closeLayers() {
  const was = layerOpen();
  LAYERS.forEach((s) => $(s).classList.remove('on'));
  if (typeof stopLive === 'function') stopLive();
  document.body.style.overflow = '';
  if (was && document.body.classList.contains('pdp-mode')) $('#pName')?.focus({ preventScroll: true });
}
// Sale de la ficha de producto y vuelve a donde estaba la clienta.
function closeProduct() {
  if (!document.body.classList.contains('pdp-mode')) return false;
  document.body.classList.remove('pdp-mode');
  $('#modal').classList.remove('on');
  if (location.hash.startsWith('#p/')) safeHash('');
  document.title = 'Samadhi Style';
  window.scrollTo({ top: pdpReturnY, behavior: 'instant' });
  return true;
}
function closeAll() {
  closeLayers();
  closeProduct();
  lastFocus?.focus?.({ preventScroll: true });
}
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 1800); }

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('p/')) openProduct(h.slice(2), false);
  else if (h.startsWith('c/')) setCat(h.slice(2));
  else if (h === 'tienda') setCat('all');
  else if (h === 'seguimiento') openTrack('track');
  else if (h === 'probador') openTryon(null);
  else if (h === 'arrepentimiento') openTrack('withdraw');
  else if (h === 'terminos') openLegal('terms');
  else if (h === 'cambios') openLegal('returns');
}

function bindGlobal() {
  document.addEventListener('click', (e) => {
    // Enlaces a secciones de la home (Nosotras, Preguntas frecuentes): si está abierta una ficha, primero vuelve a la home.
    const anchor = e.target.closest('a[href^="#"]');
    if (anchor && anchor.getAttribute('href').length > 1 && !anchor.getAttribute('href').startsWith('#p/')) {
      const target = document.getElementById(anchor.getAttribute('href').slice(1));
      if (target) { e.preventDefault(); closeAll(); requestAnimationFrame(() => target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })); return; }
    }
    const c = e.target.closest('[data-cat]');
    if (c) { closeAll(); if (c.dataset.clear) { st.q = ''; $('#q').value = ''; } setCat(c.dataset.cat); return; }
    const go = e.target.closest('[data-go]');
    if (go) { closeAll(); setCat(go.dataset.go); return; }
    const col = e.target.closest('[data-coll]');
    if (col) { st.coll = col.dataset.coll; st.shown = 24; renderCats(); renderGrid(); return; }
    const card = e.target.closest('.card[data-p]');
    if (card) { openProduct(card.dataset.p); return; }
    const tr = e.target.closest('[data-track]');
    if (tr) { closeAll(); openTrack('track'); return; }
    const to = e.target.closest('[data-track-order]');
    if (to) { closeAll(); openTrack('track', { number: to.dataset.trackOrder, email: session.customer?.email }); return; }
    const lg = e.target.closest('[data-legal]');
    if (lg) { openLegal(lg.dataset.legal); return; }
    if (e.target.closest('[data-withdraw]')) { closeAll(); openTrack('withdraw'); return; }
  });
  window.addEventListener('hashchange', route);
  $('#q').addEventListener('input', (e) => { st.q = e.target.value; st.shown = 24; renderGrid(); });
  $('#sort').addEventListener('change', (e) => { st.sort = e.target.value; renderGrid(); });
  $('#moreBtn').addEventListener('click', () => { st.shown += 24; renderGrid(); });
  $('#searchBtn').addEventListener('click', () => { $('#shop').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => $('#q').focus({ preventScroll: true }), 450); });
  $('#bagBtn').addEventListener('click', () => { co.step = 'bag'; openCart(); });
  $('#menuBtn').addEventListener('click', () => openLayer('#mnav'));
  $('#logoBtn').addEventListener('click', (e) => { e.preventDefault(); closeAll(); st.cat = 'all'; renderCats(); renderGrid(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#scrim').addEventListener('click', closeLayers);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (layerOpen()) closeLayers(); else closeAll(); } });
  window.addEventListener('scroll', onScroll, { passive: true });
}

function renderStatic() {
  const s = CAT.store || {};
  $('#announce').textContent = s.announcement || 'Moda · Accesorios · Estilo';
  $('#year').textContent = new Date().getFullYear();
  const social = [];
  if (s.instagram) social.push(`<li><a href="https://instagram.com/${esc(s.instagram.replace('@', ''))}" target="_blank" rel="noopener">Instagram · @${esc(s.instagram.replace('@', ''))}</a></li>`);
  if (s.whatsapp) { const d = s.whatsapp.replace(/\D/g, '').replace(/^0/, ''); social.push(`<li><a href="https://wa.me/549${esc(d)}" target="_blank" rel="noopener">WhatsApp · ${esc(s.whatsapp)}</a></li>`); }
  if (s.email) social.push(`<li>${esc(s.email)}</li>`);
  $('#footSocial').innerHTML = social.join('') || '<li>@samadhistyle</li>';
  if (CAT.shipping.pickup?.address) { $('#footPickup').hidden = false; $('#footPickup').textContent = `Retiro: ${CAT.shipping.pickup.address}`; }
  const bandImg = CAT.products.find((p) => p.featured && p.images[1])?.images[1] || CAT.banners[1]?.image_url;
  renderFaq();
  loadReviews();
  if (CAT.tryon?.enabled) $$('[data-tryon-open]').forEach((b) => (b.hidden = false));
  if (bandImg) $('#bandBg').innerHTML = `<img src="${esc(sized(bandImg, 1024))}" alt="" loading="lazy" onerror="this.remove()">`;
}

function skeleton() {
  $('#grid').innerHTML = Array.from({ length: 8 }, () => '<div class="card"><div class="img skel"></div><div class="skel" style="height:18px;width:70%"></div><div class="skel" style="height:14px;width:40%"></div></div>').join('');
}

async function start() {
  bindGlobal(); bindHero(); bindModal(); bindDrawer(); bindAccount(); bindTrack(); bindTryon();
  skeleton();
  try {
    prepare(await api('/api/catalog'));
  } catch (e) {
    $('#grid').innerHTML = `<div class="empty"><div class="it">No pudimos cargar la tienda.</div><p class="note">${esc(e.message)} Recargá la página en un momento.</p></div>`;
    return;
  }
  renderStatic(); renderHero(); renderCats(); renderGrid(); updateCount();
  loadSession();
  // La vista previa avisa cuando cambia la sesión desde el panel o pide abrir una prenda.
  window.addEventListener('samadhi-session', loadSession);
  window.addEventListener('samadhi-open', (e) => { if (e.detail?.slug) openProduct(e.detail.slug); });
  route();
  handleLinks();
  setTimeout(cartNudge, 2500);
}

// Links que llegan por email: ?carrito= (recuperar la bolsa) y ?reset= (nueva contraseña).
// Link "Volver a mi bolsa" del email: arma la bolsa tal como la dejó.
async function recoverCart(token) {
  try {
    const r = await api('/api/cart/' + encodeURIComponent(token));
    const valid = r.items.filter((i) => variantById.has(i.variant_id));
    if (valid.length) { cart = valid; saveCart(); updateCount(); co.step = 'bag'; openCart(); toast('Recuperamos tu bolsa'); }
    else toast('Esas prendas ya no están disponibles');
  } catch { toast('No encontramos esa bolsa'); }
}
window.__SAMADHI_RECOVER_CART = recoverCart;
async function handleLinks() {
  const q = new URLSearchParams(location.search);
  const clearQ = () => { try { history.replaceState(null, '', location.pathname + location.hash); } catch {} };
  if (q.get('carrito')) { await recoverCart(q.get('carrito')); clearQ(); }
  if (q.get('reset')) { acct.resetToken = q.get('reset'); acct.view = 'reset'; renderAccount(); openLayer('#acct'); clearQ(); }
}

// "Tenés un carrito esperándote": aviso discreto al volver con prendas en la bolsa.
function cartNudge() {
  const lines = cartLines();
  let seen = null;
  try { seen = sessionStorage.getItem('samadhi-nudge'); } catch {}
  if (!lines.length || seen || $('.drawer.on, .modal.on')) return;
  const n = lines.reduce((a, l) => a + l.qty, 0);
  const el = document.createElement('aside');
  el.className = 'nudge';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="nudge-imgs">${lines.slice(0, 3).map((l) => imgTag(l.p, l.p.images[0], { sizes: '56px', color: l.v.color })).join('')}</div>
    <div class="nudge-txt"><div class="it">Tenés un carrito esperándote.</div><div class="note">${n} ${n === 1 ? 'prenda' : 'prendas'} · ${fmt(subtotal())}${lines.some((l) => l.v.stock !== null && l.v.stock <= 2) ? ' · quedan pocas unidades' : ''}</div>
    <div class="nudge-btns"><button class="btn solid sm" data-nudge="open">Ver mi bolsa</button><button class="link-btn" data-nudge="close">Ahora no</button></div></div>
    <button class="nudge-x" data-nudge="close" aria-label="Cerrar aviso"><svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13"/></svg></button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); try { sessionStorage.setItem('samadhi-nudge', '1'); } catch {} };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nudge]');
    if (!b) return;
    close();
    if (b.dataset.nudge === 'open') { co.step = 'bag'; openCart(); }
  });
}
start();

// ── Textos con formato simple (## título, - lista, **negrita**) ───────────
function miniMd(src) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; } };
  for (const block of String(src || '').replace(/\r/g, '').split(/\n{2,}/)) {
    for (const line of block.split('\n')) {
      const l = line.trim(); if (!l) continue;
      if (l.startsWith('- ')) { (list ||= []).push(`<li>${inline(l.slice(2))}</li>`); continue; }
      flush();
      if (l.startsWith('### ')) out.push(`<h4>${inline(l.slice(4))}</h4>`);
      else if (l.startsWith('## ')) out.push(`<h3 class="doc-title">${inline(l.slice(3))}</h3>`);
      else out.push(`<p>${inline(l)}</p>`);
    }
    flush();
  }
  return out.join('');
}
const dhead = (t) => `<div class="dhead"><h3>${t}</h3><button class="close" data-close aria-label="Cerrar"><svg viewBox="0 0 16 16"><path d="M2 2l12 12M14 2L2 14"/></svg></button></div>`;
const waLink = () => { const d = (CAT.store?.whatsapp || '').replace(/\D/g, '').replace(/^0/, ''); return d ? `https://wa.me/549${d}` : '#'; };

// ── Preguntas frecuentes (home) ──────────────────────────
function renderFaq() {
  const faq = CAT.content?.faq || [];
  $('#faq').hidden = !faq.length;
  $('#faqWa').href = waLink();
  $('#faqList').innerHTML = faq.map((x, i) => `<details class="qa" ${i === 0 ? 'open' : ''}><summary><span>${esc(x.q)}</span><i aria-hidden="true"></i></summary><div class="qa-a">${miniMd(x.a)}</div></details>`).join('');
  // Datos estructurados para que Google muestre las preguntas.
  try {
    let ld = document.getElementById('faqLd');
    if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'faqLd'; document.head.appendChild(ld); }
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a.replace(/\*\*/g, '') } })) });
  } catch {}
}

// ── Reseñas de Google ────────────────────────────────────
const stars = (n) => `<span class="stars" aria-label="${n} de 5 estrellas">${[1, 2, 3, 4, 5].map((i) => `<svg viewBox="0 0 20 20" class="${n >= i - 0.25 ? 'on' : n >= i - 0.75 ? 'half' : ''}"><path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"/></svg>`).join('')}</span>`;
async function loadReviews() {
  if (CAT.content && CAT.content.reviews === false) return;
  let d;
  try { d = await api('/api/reviews'); } catch { return; }
  if (!d.enabled) return;
  const box = $('#reviewsBox');
  const write = d.writeUrl ? `<a class="btn" href="${esc(d.writeUrl)}" target="_blank" rel="noopener">Dejanos tu reseña</a>` : '';
  const gLogo = '<svg class="g" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 01-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0012 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 010-4.6V6.6H1.3a12 12 0 000 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 001.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>';
  if (!d.connected) {
    // Sin ficha conectada: en la vista previa mostramos cómo se verá, con tarjetas marcadas como ejemplo.
    if (!d.examples) return;
    box.innerHTML = `<div class="rev-head"><div><div class="caps">Reseñas de Google</div><h2 id="revTitle">Lo que dicen de nosotras</h2></div>
      <div class="rev-score">${gLogo}<div><div class="rev-note">Vista previa: acá se van a mostrar, en vivo, las reseñas reales de la ficha de Google de Samadhi Style.</div></div></div></div>
      <div class="rev-row">${d.examples.map((x) => `<article class="rev demo"><span class="badge">Ejemplo</span>${stars(x.rating)}<p>${esc(x.text)}</p><div class="rev-who"><span class="av">${esc(x.author[0])}</span><span>${esc(x.author)}</span></div></article>`).join('')}</div>`;
    $('#resenas').hidden = false;
    return;
  }
  if (!d.reviews.length && !d.count) return;
  box.innerHTML = `<div class="rev-head"><div><div class="caps">Reseñas de Google</div><h2 id="revTitle">Lo que dicen de nosotras</h2></div>
    <div class="rev-score">${gLogo}<div><div class="rev-num money">${d.rating.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>${stars(d.rating)}<div class="note">${num(d.count)} reseñas en Google</div></div>${write}</div></div>
    <div class="rev-row">${d.reviews.map((x) => `<article class="rev">${stars(x.rating)}<p>${esc(x.text.length > 320 ? x.text.slice(0, 300).replace(/\s+\S*$/, '') + '…' : x.text)}</p>
      <div class="rev-who">${x.photo ? `<img class="av" src="${esc(x.photo)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.outerHTML='<span class=av>${esc(x.author[0] || '·')}</span>'">` : `<span class="av">${esc(x.author[0] || '·')}</span>`}
      <span>${x.authorUrl ? `<a href="${esc(x.authorUrl)}" target="_blank" rel="noopener">${esc(x.author)}</a>` : esc(x.author)}<small class="note">${esc(x.when)}</small></span></div></article>`).join('')}</div>
    ${d.mapsUrl ? `<div class="rev-more"><a href="${esc(d.mapsUrl)}" target="_blank" rel="noopener">Ver todas las reseñas en Google</a></div>` : ''}`;
  $('#resenas').hidden = false;
}
const num = (n) => Number(n || 0).toLocaleString('es-AR');

// ── Seguir mi pedido y Botón de arrepentimiento ──────────
const trk = { view: 'track', form: {}, error: '', busy: false, order: null, done: null };
function openTrack(view = 'track', prefill = {}) {
  trk.view = view; trk.error = ''; trk.busy = false; trk.done = null;
  if (view === 'track') trk.order = null;
  trk.form = { number: prefill.number || trk.form.number || '', email: prefill.email || trk.form.email || session.customer?.email || '', reason: '' };
  renderTrack(); openLayer('#track');
  if (prefill.number && prefill.email && view === 'track') submitTrack();
}
const dDate = (s) => (s ? new Date(String(s).replace(' ', 'T') + (/[zZ+]/.test(s) ? '' : 'Z')).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
function renderTrack() {
  const F = trk.form;
  const fl = (id, label, attrs = '') => `<div class="fl"><label for="t-${id}">${label}</label><input id="t-${id}" name="${id}" value="${esc(F[id] || '')}" ${attrs}></div>`;
  const alert = trk.error ? `<div class="alert" role="alert">${esc(trk.error)}</div>` : '';
  let body = '';
  if (trk.view === 'track' && !trk.order) {
    body = `<form class="co" id="trackForm" novalidate>
      <p class="note">Escribí el número de pedido que te llegó por email y el email con el que compraste.</p>${alert}
      ${fl('number', 'Número de pedido', 'placeholder="S-1042" autocomplete="off" autocapitalize="characters"')}
      ${fl('email', 'Email', 'type="email" inputmode="email" autocomplete="email"')}
      <button class="btn solid wide" type="submit" ${trk.busy ? 'disabled' : ''}>${trk.busy ? 'Buscando…' : 'Ver mi pedido'}</button>
      <button class="link-btn" type="button" data-tview="withdraw" style="justify-self:center">Quiero arrepentirme de una compra</button></form>`;
  } else if (trk.view === 'track') {
    const o = trk.order;
    const tl = o.ended
      ? `<div class="alert">${o.ended === 'refunded' ? 'Este pedido fue devuelto: el reintegro se hizo por el mismo medio de pago.' : 'Este pedido está cancelado.'}</div>`
      : `<ol class="timeline">${o.steps.map((s) => `<li class="${s.done ? 'done' : ''} ${s.current ? 'current' : ''}"><span class="dot"></span><div><b>${esc(s.label)}</b>${s.at && s.done ? `<small class="note">${esc(dDate(s.at))}</small>` : ''}${s.current ? `<div class="note">${esc(s.note)}</div>` : ''}</div></li>`).join('')}</ol>`;
    const addr = o.shippingMethod === 'retiro' ? (CAT.shipping.pickup ? `${CAT.shipping.pickup.address}${CAT.shipping.pickup.hours ? ' · ' + CAT.shipping.pickup.hours : ''}` : 'Retiro en el local')
      : o.shippingMethod === 'andreani_sucursal' ? (o.branch || 'Sucursal Andreani') : [o.address.calle, o.address.numero, o.address.localidad].filter(Boolean).join(' ');
    body = `<div class="track-res">
      <div class="track-top"><div><div class="caps">Pedido</div><div class="track-num">${esc(o.number)}</div></div><span class="st st-${esc(o.status)}">${esc(o.statusLabel)}</span></div>
      ${o.transfer ? `<div class="alert">Falta la transferencia de <b>${fmt(o.total)}</b>${o.transfer.alias ? ` al alias <b>${esc(o.transfer.alias)}</b>` : ''}. Te mandamos los datos por email.</div>` : ''}
      ${tl}
      <div class="track-box"><div class="caps">${esc(o.shippingLabel)}</div><div>${esc(addr)}</div>
        ${o.andreaniNumber ? `<div class="note">Envío Andreani ${esc(o.andreaniNumber)}</div>` : ''}
        ${o.trackingEvents?.length ? `<ul class="trazas">${o.trackingEvents.slice().reverse().slice(0, 6).map((e) => `<li><b>${esc(e.estado || '')}</b><small class="note">${esc(dDate(e.fecha))}${e.sucursal ? ' · ' + esc(e.sucursal) : ''}</small></li>`).join('')}</ul>` : ''}
        ${o.trackingUrl ? `<a class="btn sm" href="${esc(o.trackingUrl)}" target="_blank" rel="noopener">Ver en Andreani</a>` : ''}</div>
      <div class="track-items">${o.items.map((i) => `<div class="ti">${i.image ? `<img src="${esc(sized(i.image, 320))}" alt="" loading="lazy">` : '<span></span>'}<div><div class="nm">${esc(i.name)}</div><small class="note">${esc(i.variant_label || '')}${i.qty > 1 ? ` · ${i.qty} u.` : ''}</small></div><span class="money">${fmt(i.unit_price * i.qty)}</span></div>`).join('')}
        <div class="tot"><span>${esc(o.shippingLabel)}</span><span class="money">${o.shippingCost ? fmt(o.shippingCost) : 'Sin cargo'}</span></div>
        ${o.discount ? `<div class="tot save"><span>Descuentos</span><span class="money">− ${fmt(o.discount)}</span></div>` : ''}
        <div class="tot grand"><span>Total</span><span class="money">${fmt(o.total)}</span></div></div>
      <div class="track-help"><a class="btn wide" href="${esc(waLink())}?text=${encodeURIComponent('Hola! Tengo una consulta sobre mi pedido ' + o.number)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>
        <button class="link-btn" type="button" data-tview="track-new">Buscar otro pedido</button></div></div>`;
  } else if (trk.view === 'withdraw' && !trk.done) {
    body = `<form class="co" id="withdrawForm" novalidate>
      <p class="note">Tenés <b>10 días corridos</b> desde que recibiste tu compra para arrepentirte, sin dar explicaciones. Te devolvemos el total, incluido el envío. Al enviar este formulario te damos un código de trámite y te lo mandamos por email.</p>${alert}
      ${fl('number', 'Número de pedido', 'placeholder="S-1042" autocomplete="off"')}
      ${fl('email', 'Email con el que compraste', 'type="email" inputmode="email" autocomplete="email"')}
      <div class="fl"><label for="t-reason">Motivo <span class="note">(opcional)</span></label><textarea id="t-reason" name="reason" rows="3" maxlength="1000">${esc(F.reason || '')}</textarea></div>
      <button class="btn solid wide" type="submit" ${trk.busy ? 'disabled' : ''}>${trk.busy ? 'Enviando…' : 'Arrepentirme de la compra'}</button>
      <button class="link-btn" type="button" data-legal="returns" style="justify-self:center">Ver la política de cambios y devoluciones</button></form>`;
  } else {
    body = `<div class="dempty" style="padding:30px 0;text-align:center"><div class="it" style="font-size:24px">${trk.done.existing ? 'Ya tenías un trámite iniciado.' : 'Recibimos tu pedido de arrepentimiento.'}</div>
      <p class="note" style="margin-top:12px">Pedido ${esc(trk.done.number)} · Código de trámite</p><div class="track-num" style="margin:6px 0 14px">${esc(trk.done.code)}</div>
      <p class="note">Te lo mandamos por email. En las próximas horas te escribimos para coordinar la devolución.</p></div>`;
  }
  $('#track').innerHTML = dhead(trk.view === 'withdraw' ? 'Botón de arrepentimiento' : 'Seguir mi pedido') + `<div class="dbody">${body}</div>`;
}
async function submitTrack() {
  trk.busy = true; trk.error = ''; renderTrack();
  try { trk.order = await api('/api/track', { number: trk.form.number, email: trk.form.email }); } catch (e) { trk.error = e.message; }
  trk.busy = false; renderTrack();
}
function bindTrack() {
  $('#track').addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-close]')) return closeAll();
    const v = t.closest('[data-tview]');
    if (v) { trk.error = ''; trk.done = null; if (v.dataset.tview === 'track-new') { trk.order = null; trk.view = 'track'; } else trk.view = v.dataset.tview; renderTrack(); }
  });
  $('#track').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    Object.assign(trk.form, f);
    if (e.target.id === 'trackForm') return submitTrack();
    trk.busy = true; trk.error = ''; renderTrack();
    try { trk.done = await api('/api/arrepentimiento', { number: f.number, email: f.email, reason: f.reason }); } catch (err) { trk.error = err.message; }
    trk.busy = false; renderTrack();
  });
  $('#legal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeAll(); });
}

// ── Términos y condiciones / Política de cambios ─────────
function openLegal(which) {
  const c = CAT.content || {};
  const txt = which === 'terms' ? c.terms : c.returns;
  const other = which === 'terms' ? ['returns', 'Política de cambios y devoluciones'] : ['terms', 'Términos y condiciones'];
  closeAll();
  $('#legal').innerHTML = dhead(which === 'terms' ? 'Términos y condiciones' : 'Cambios y devoluciones') + `<div class="dbody"><article class="doc-body">${miniMd(txt)}</article>
    <div class="doc-foot"><button class="btn" type="button" data-legal="${other[0]}">${other[1]}</button>${which === 'returns' ? '<button class="btn solid" type="button" data-withdraw>Botón de arrepentimiento</button>' : ''}</div></div>`;
  openLayer('#legal');
  $('#legal .dbody').scrollTop = 0;
}


// ── Probador virtual ─────────────────────────────────────
// Motor propio (por defecto): todo corre en el navegador de la clienta y la foto nunca sale de su dispositivo.
// Detecta el cuerpo, calza las prendas preparadas del catálogo y deja ajustar tamaño, largo y posición.
// Motor FASHN (opcional, de pago): la foto viaja al servicio de IA sólo para generar la imagen.
const TRY_KEY = 'samadhi-probador-foto';
const own = () => (CAT.tryon?.engine || 'samadhi') === 'samadhi' || tr.fallback;
const iaName = () => (CAT.tryon?.engine === 'gemini' ? 'Google (Gemini)' : 'el servicio de IA');
const tryonOk = (p) => !!(CAT.tryon?.enabled && p && p.images.length && (own() ? CAT.tryon.garments?.[p.id] : !p.categories.some((id) => (CAT.tryon.hidden || []).includes(id))));
const tr = { fallback: false, p: null, img: 0, photo: null, base: null, result: null, look: [], status: 'photo', error: '', note: '', remember: false, consent: false, picking: false, q: '', log: null, mock: false, cmp: 50, body: null, bodyImg: null, size: '', live: null };
try { const saved = localStorage.getItem(TRY_KEY); if (saved) { tr.photo = saved; tr.remember = true; tr.consent = true; } } catch {}
let ENGINE = null;
async function engine() {
  if (ENGINE) return ENGINE;
  ENGINE = window.__PROBADOR || (await import('/assets/probador-engine.js'));
  return ENGINE;
}
const loadImg = (src) => new Promise((ok, bad) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => bad(new Error('No pudimos cargar la imagen.')); i.src = src; });

function openTryon(p, img = 0) {
  if (!CAT.tryon?.enabled) return;
  tr.p = p && tryonOk(p) ? p : null; tr.img = img; tr.error = ''; tr.note = ''; tr.result = null; tr.mock = false; tr.base = tr.photo; tr.picking = !tr.p; tr.size = '';
  if (!own()) tr.look = [];
  tr.status = tr.photo ? 'ready' : 'photo';
  renderTryon();
  lastFocus = document.activeElement;
  $('#scrim').classList.add('on'); $('#tryon').classList.add('on'); document.body.style.overflow = 'hidden';
  if (own() && tr.photo && !tr.body) analyzePhoto();
  else if (own() && tr.p && tr.body && !tr.look.some((x) => x.p.id === tr.p.id)) addToLook(tr.p);
  else if (own() && tr.look.length) drawLook();
}
async function shrinkPhoto(file) {
  if (!/^image\//.test(file.type)) throw new Error('Elegí una foto (JPG o PNG).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('No pudimos abrir esa foto. Probá con otra.')); i.src = url; });
    const k = Math.min(1, 1296 / img.naturalHeight, 1024 / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    if (c.height < 500) throw new Error('La foto es muy chica. Usá una de mejor calidad, de cuerpo entero.');
    return c.toDataURL('image/jpeg', 0.88);
  } finally { URL.revokeObjectURL(url); }
}

// Motor propio: analizar la foto una vez y redibujar el look cada vez que cambia algo.
async function analyzePhoto() {
  tr.status = 'analyzing'; tr.error = ''; tr.note = ''; tr.body = null; renderTryon();
  try {
    const E = await engine();
    tr.bodyImg = await loadImg(tr.photo);
    tr.body = await E.detect(tr.bodyImg, { complexity: 1 });
    const warn = E.checkBody(tr.body, 'top');
    if (!tr.body.lm) { tr.error = warn; tr.status = 'ready'; tr.body = null; renderTryon(); return; }
    tr.note = warn || '';
    tr.status = 'ready';
    if (tr.p) await addToLook(tr.p); else renderTryon();
  } catch (e) { tr.error = e.message || 'No pudimos analizar la foto.'; tr.status = 'ready'; renderTryon(); }
}
async function addToLook(p) {
  const E = await engine();
  const g = CAT.tryon.garments[p.id];
  if (!g || !tr.body) return;
  tr.status = 'working'; renderTryon();
  try {
    const image = await loadImg(g.url);
    const item = { p, kind: g.kind, pts: g.pts, image, adj: { dx: 0, dy: 0, scale: 0, length: 0 } };
    // Una prenda entera reemplaza a las de arriba y abajo; una de arriba o de abajo reemplaza a la del mismo tipo y a la entera.
    tr.look = tr.look.filter((x) => x.p.id !== p.id && !(g.kind === 'full' || x.kind === 'full' || x.kind === g.kind));
    tr.look.push(item);
    tr.note = E.checkBody(tr.body, g.kind) || '';
    api('/api/tryon/log', { productId: p.id }).then((r) => { item.log = r.log; }).catch(() => {});
    drawLook();
  } catch (e) { tr.error = e.message; }
  tr.status = 'ready'; tr.picking = false; renderTryon();
}
let drawTimer = 0;
function drawLook(soon = false) {
  if (!tr.body || !ENGINE) return;
  const go = () => {
    const c = document.createElement('canvas');
    ENGINE.renderLook(c, tr.bodyImg, tr.body, tr.look);
    tr.result = tr.look.length ? c.toDataURL('image/jpeg', 0.9) : null;
    if (!soon) tr.cmp = 0;
    const a = $('#tryon .tr-cmp img.a'); if (a && tr.result) a.src = tr.result; else renderTryon();
  };
  clearTimeout(drawTimer);
  if (soon) drawTimer = setTimeout(go, 60); else go();
}

// Espejo en vivo con la cámara (motor propio).
async function startLive() {
  if (!navigator.mediaDevices?.getUserMedia) { tr.error = 'Tu navegador no permite usar la cámara acá.'; return renderTryon(); }
  try {
    const E = await engine();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false });
    const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.srcObject = stream; await video.play();
    tr.live = { stream, video, on: true };
    renderTryon();
    const canvas = $('#trLive'); const ctx = canvas.getContext('2d');
    const loop = async () => {
      if (!tr.live?.on) return;
      const body = await E.detect(video, { complexity: 0, video: true, mask: false }).catch(() => null);
      if (!tr.live?.on) return;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      if (body?.lm) { const order = { full: 0, bottom: 1, top: 2 }; for (const g of [...tr.look].sort((a, b) => order[a.kind] - order[b.kind])) E.fitGarment(ctx, body, g, { ...g.adj, fast: true }); }
      requestAnimationFrame(loop);
    };
    loop();
  } catch (e) { tr.error = e.name === 'NotAllowedError' ? 'Necesitamos permiso para usar la cámara.' : 'No pudimos abrir la cámara.'; renderTryon(); }
}
function stopLive() { if (tr.live) { tr.live.on = false; tr.live.stream.getTracks().forEach((t) => t.stop()); tr.live = null; } }

const tryCats = () => CAT.products.filter(tryonOk);
function renderTryon() {
  const p = tr.p;
  const cur = tr.look.at(-1);
  const busy = tr.status === 'analyzing' || tr.status === 'working';
  const busyTxt = tr.status === 'analyzing' ? (ENGINE ? 'Mirando tu foto…' : 'Preparando el probador…') : own() ? 'Calzando la prenda…' : 'Probándote la prenda…';
  let stage;
  if (tr.live) stage = `<div class="tr-photo"><canvas id="trLive" class="tr-live" aria-label="Espejo en vivo"></canvas><button class="btn sm tr-live-stop" type="button" data-live-stop>Volver a mi foto</button></div>`;
  else if (tr.mock) stage = `<div class="tr-mock"><img src="${esc(tr.base)}" alt="Tu foto"><div class="tr-mock-g">${imgTag(p, p.images[tr.img], { sizes: '200px' })}</div>
        <div class="tr-mock-note"><b>Modo prueba</b> Con el servicio conectado, acá ves tu foto con ${esc(p.name)} puesta, generada con IA.</div></div>`;
  else if (tr.result) stage = `<div class="tr-cmp" style="--x:${tr.cmp}%"><img class="a" src="${esc(tr.result)}" alt="Vos con ${esc((own() ? tr.look.map((x) => x.p.name).join(' y ') : p.name))}"><img class="b" src="${esc(tr.base)}" alt="Tu foto original"><span class="tr-cmp-line" aria-hidden="true"></span>
        <input type="range" min="0" max="100" value="${tr.cmp}" data-cmp aria-label="Comparar con tu foto original"><span class="tr-tag l">Tu foto</span><span class="tr-tag r">${own() ? 'Probador' : 'Con ' + esc(p.name)}</span></div>`;
  else if (tr.base) stage = `<div class="tr-photo ${busy ? 'busy' : ''}"><img src="${esc(tr.base)}" alt="Tu foto">${busy ? `<div class="tr-scan" aria-hidden="true"></div><div class="tr-wait" role="status">${busyTxt}<small>${tr.status === 'analyzing' && !ENGINE ? 'Sólo la primera vez tarda un poco más' : 'Unos segundos'}</small></div>` : ''}</div>`;
  else stage = `<label class="tr-drop" for="trFile"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="11" r="5"/><path d="M24 16v14M16 22l8-4 8 4M19 46l5-16 5 16"/></svg>
          <b>Subí una foto tuya</b><span>De cuerpo entero, de frente y con buena luz</span><span class="btn sm">Elegir foto</span></label>`;
  const tips = `<ul class="tr-tips"><li>Cuerpo entero, de frente, brazos al costado</li><li>Buena luz y fondo liso</li><li>Ropa ajustada y de un color</li><li>Sólo vos en la foto</li></ul>`;
  const picker = `<div class="tr-pick"><div class="fl"><label for="trQ">${tr.look.length ? 'Sumá otra prenda al look' : 'Elegí una prenda'}</label><input id="trQ" value="${esc(tr.q)}" placeholder="Buscar: vestido, jean, blusa…" autocomplete="off"></div>
      <div class="tr-grid">${tryCats().filter((x) => !tr.q || norm(x.name).includes(norm(tr.q))).slice(0, 48).map((x) => `<button type="button" data-pick="${x.id}" class="${p?.id === x.id ? 'on' : ''}">${imgTag(x, x.images[0], { sizes: '120px' })}<span>${esc(x.name)}</span></button>`).join('')}</div>
      ${tr.look.length ? '<button class="link-btn" type="button" data-unpick>Volver al look</button>' : ''}</div>`;
  const garment = p ? `<div class="tr-garment">
      <div class="tr-g-imgs">${p.images.slice(0, own() ? 1 : 5).map((u, i) => `<button type="button" data-gimg="${i}" class="${i === tr.img ? 'on' : ''}" aria-label="Usar la foto ${i + 1}">${imgTag(p, u, { sizes: '72px' })}</button>`).join('')}</div>
      <div><div class="caps" style="color:var(--suave)">Prenda</div><div class="tr-g-name">${esc(p.name)}</div><div class="money">${fmt(nowPrice(p))}</div>
      <button class="link-btn" type="button" data-repick>Cambiar de prenda</button></div></div>` : '';
  const privacy = own() ? 'Tu foto no sale de tu celular: el probador funciona en tu navegador y no la guardamos.' : `Tu foto se envía a ${iaName()} sólo para generar la imagen; la tienda no la guarda.`;
  const sizes = () => {
    const v = p.variants.filter(avail);
    return `${p.sizes.length ? `<div class="opt-label caps">Talle</div><div class="sizes">${p.sizes.map((sz) => { const ok = v.some((x) => x.size === sz); return `<button class="sz ${tr.size === sz ? 'on' : ''} ${ok ? '' : 'no'}" data-tsize="${esc(sz)}" ${ok ? '' : 'aria-disabled="true"'}>${esc(sz)}</button>`; }).join('')}</div>` : ''}
      <button class="btn solid wide" type="button" data-tadd>${p.sizes.length > 1 && !tr.size ? 'Elegí un talle' : 'Sumar a la bolsa'}</button>`;
  };
  let side = '';
  if (tr.picking || !p) side = picker;
  else if (!tr.base) {
    side = `${garment}<div class="tr-step"><div class="caps">1 · Tu foto</div>${tips}
      <label class="tr-check"><input type="checkbox" data-consent ${tr.consent ? 'checked' : ''}> <span>Es una foto mía (o tengo permiso de la persona) y soy mayor de 18 años.</span></label>
      <label class="btn solid wide ${tr.consent ? '' : 'off'}" for="trFile">Subir foto</label>
      ${own() ? `<button class="btn wide ${tr.consent ? '' : 'off'}" type="button" data-live>Usar la cámara (espejo en vivo)</button>` : ''}
      <p class="note">${privacy}</p></div>`;
  } else if (own()) {
    const a = cur?.adj;
    side = `${garment}<div class="tr-step">
      ${tr.fallback && CAT.tryon?.engine !== 'samadhi' ? '<p class="note tr-warn">El probador con IA no está disponible en este momento: te mostramos la versión simple.</p>' : ''}
      ${tr.note ? `<p class="note tr-warn">${esc(tr.note)}</p>` : ''}
      ${tr.look.length ? `<div class="tr-look"><span class="caps">Tu look</span>${tr.look.map((x) => `<span class="tr-chip">${esc(x.p.name)}<button type="button" data-unlook="${x.p.id}" aria-label="Sacar ${esc(x.p.name)}">×</button></span>`).join('')}</div>` : ''}
      ${!tr.look.some((x) => x.p.id === p.id) ? `<button class="btn solid wide" type="button" data-go-try ${busy || !tr.body ? 'disabled' : ''}>${busy ? busyTxt : 'Probármelo'}</button>` : ''}
      ${cur && !tr.live ? `<details class="tr-adj" ${tr.adjOpen ? 'open' : ''}><summary>Ajustar ${esc(cur.p.name)}</summary>
        <label class="tr-range"><span>Tamaño</span><input type="range" min="-20" max="20" value="${Math.round(a.scale * 100)}" data-adj="scale"></label>
        <label class="tr-range"><span>Largo</span><input type="range" min="-25" max="30" value="${Math.round(a.length * 100)}" data-adj="length"></label>
        <div class="tr-nudge" role="group" aria-label="Mover la prenda"><button type="button" data-nudge="0,-1" aria-label="Subir">↑</button><button type="button" data-nudge="-1,0" aria-label="Izquierda">←</button><button type="button" data-nudge="1,0" aria-label="Derecha">→</button><button type="button" data-nudge="0,1" aria-label="Bajar">↓</button><button type="button" data-reset class="link-btn">Volver a como estaba</button></div>
      </details>` : ''}
      ${tr.look.some((x) => x.p.id === p.id) ? sizes() : ''}
      <div class="tr-row">${tr.look.length ? '<button class="btn sm" type="button" data-more>Sumar otra prenda</button>' : ''}${tr.live ? '' : `<button class="btn sm" type="button" data-live ${tr.look.length ? '' : 'disabled'}>Espejo con la cámara</button>`}</div>
      <p class="note">Es una simulación: muestra cómo combina y el largo aproximado. El calce real depende del talle; si dudás, escribinos.</p>
      <label class="tr-check"><input type="checkbox" data-remember ${tr.remember ? 'checked' : ''}> <span>Guardar mi foto en este dispositivo</span></label>
      <div class="tr-row"><label class="link-btn" for="trFile">Usar otra foto</label>${tr.photo ? '<button class="link-btn" type="button" data-forget>Borrar mi foto</button>' : ''}${tr.result ? `<a class="link-btn" href="${esc(tr.result)}" download="samadhi-probador.jpg">Descargar</a>` : ''}</div></div>`;
  } else if (!tr.result && !tr.mock) {
    side = `${garment}<div class="tr-step">${tr.look.length ? `<div class="tr-look">Tu look: ${tr.look.map((x) => esc(x.name)).join(' + ')}</div>` : ''}
      <button class="btn solid wide" type="button" data-go-try ${busy ? 'disabled' : ''}>${busy ? 'Generando…' : 'Probármelo'}</button>
      <label class="tr-check"><input type="checkbox" data-remember ${tr.remember ? 'checked' : ''}> <span>Guardar mi foto en este dispositivo para probar otras prendas</span></label>
      <div class="tr-row"><label class="link-btn" for="trFile">Usar otra foto</label>${tr.photo ? '<button class="link-btn" type="button" data-forget>Borrar mi foto</button>' : ''}</div></div>`;
  } else {
    side = `${garment}<div class="tr-step">
      <p class="note">${tr.mock ? '' : 'Imagen generada con IA: es una aproximación. El calce real depende del talle; si dudás, escribinos.'}</p>
      ${sizes()}
      <div class="tr-row"><button class="btn sm" type="button" data-more>Sumar otra prenda al look</button><button class="btn sm" type="button" data-again>Probar otra prenda</button></div>
      ${tr.result ? `<a class="link-btn" href="${esc(tr.result)}" download="samadhi-probador.jpg">Descargar la imagen</a>` : ''}</div>`;
  }
  $('#tryon').innerHTML = `<div class="tr-head"><div><div class="caps">Probador virtual</div><h3>Probátelo</h3></div>
      <button class="close" data-tclose aria-label="Cerrar"><svg viewBox="0 0 16 16"><path d="M2 2l12 12M14 2L2 14"/></svg></button></div>
    <div class="tr-body"><div class="tr-stage">${stage}</div><div class="tr-side">${tr.error ? `<div class="alert" role="alert">${esc(tr.error)}${tr.errorDetail ? `<small class="tr-detail">Detalle técnico: ${esc(tr.errorDetail)}</small>` : ''}</div>` : ''}${side}</div></div>
    <input type="file" id="trFile" accept="image/*" hidden>`;
}
const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Las imágenes generadas vienen en PNG (pesadas): se pasan a JPEG para mostrarlas y para seguir armando el look.
const toJpeg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); const k = Math.min(1, 1296 / i.naturalHeight); c.width = Math.round(i.naturalWidth * k); c.height = Math.round(i.naturalHeight * k); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.9)); }; i.onerror = () => ok(src); i.src = src; });
async function runTryon() {
  if (own()) return addToLook(tr.p);
  tr.status = 'working'; tr.error = ''; tr.errorDetail = ''; renderTryon();
  try {
    const size = await new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok(null); i.src = tr.base; });
    const st = await api('/api/tryon', { productId: tr.p.id, image: tr.img, photo: tr.base, photoSize: size, garmentUrl: tr.p.images[tr.img], kind: CAT.tryon.garments?.[tr.p.id]?.kind || null, name: tr.p.name });
    for (let i = 0; i < 80; i++) {
      await new Promise((ok) => setTimeout(ok, i < 3 ? 2500 : 1500));
      const r = await api('/api/tryon/' + encodeURIComponent(st.id));
      if (r.status === 'completed') { tr.log = r.log; tr.mock = !!r.mock; tr.result = r.image ? await toJpeg(r.image) : null; tr.cmp = 0; tr.look.push(tr.p); break; }
    }
    if (!tr.result && !tr.mock) throw new Error('Tardó demasiado. Probá de nuevo.');
  } catch (e) {
    // Sin IA configurada (o sin conexión con el servicio): seguimos con el probador propio.
    if (['sin-clave', 'sin-ia'].includes(e.data?.code) && CAT.tryon.garments) {
      tr.fallback = true; tr.status = 'ready';
      if (!tryonOk(tr.p)) { tr.picking = true; return renderTryon(); }
      return analyzePhoto();
    }
    tr.error = e.message;
    tr.errorDetail = e.data?.detail || '';
  }
  tr.status = 'ready'; renderTryon();
}
function bindTryon() {
  const el = $('#tryon');
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-tclose]')) return closeAll();
    const pk = t.closest('[data-pick]');
    if (pk) {
      tr.p = CAT.products.find((x) => x.id === Number(pk.dataset.pick)); tr.img = 0; tr.picking = false; tr.size = ''; tr.error = '';
      if (own()) { if (tr.body) return addToLook(tr.p); return renderTryon(); }
      tr.result = null; tr.mock = false; return renderTryon();
    }
    if (t.closest('[data-unpick]')) { tr.picking = false; tr.p = tr.look.at(-1)?.p || tr.p; return renderTryon(); }
    if (t.closest('[data-repick]')) { tr.picking = true; if (!own()) { tr.result = null; tr.mock = false; } return renderTryon(); }
    const ul = t.closest('[data-unlook]'); if (ul) { tr.look = tr.look.filter((x) => x.p.id !== Number(ul.dataset.unlook)); if (!tr.look.length) tr.result = null; drawLook(); return renderTryon(); }
    const gi = t.closest('[data-gimg]'); if (gi) { tr.img = Number(gi.dataset.gimg); if (!own()) { tr.result = null; tr.mock = false; } return renderTryon(); }
    if (t.closest('[data-go-try]')) return runTryon();
    if (t.closest('[data-live-stop]')) { stopLive(); return renderTryon(); }
    if (t.closest('[data-live]') && !t.closest('[data-live]').disabled) { if (t.closest('.off')) { tr.error = 'Confirmá que sos mayor de 18 para seguir.'; return renderTryon(); } tr.error = ''; if (!tr.look.length && tr.p) { engine().then(() => loadImg(CAT.tryon.garments[tr.p.id].url)).then((image) => { const g = CAT.tryon.garments[tr.p.id]; tr.look = [{ p: tr.p, kind: g.kind, pts: g.pts, image, adj: { dx: 0, dy: 0, scale: 0, length: 0 } }]; startLive(); }); return; } return startLive(); }
    const nd = t.closest('[data-nudge]');
    if (nd) { const cur = tr.look.at(-1); const [x, y] = nd.dataset.nudge.split(',').map(Number); const step = (tr.body?.W || 600) * 0.012; cur.adj.dx += x * step; cur.adj.dy += y * step; tr.adjOpen = true; return drawLook(true); }
    if (t.closest('[data-reset]')) { const cur = tr.look.at(-1); cur.adj = { dx: 0, dy: 0, scale: 0, length: 0 }; tr.adjOpen = true; drawLook(); return renderTryon(); }
    if (t.closest('[data-forget]')) { try { localStorage.removeItem(TRY_KEY); } catch {} tr.photo = null; tr.base = null; tr.remember = false; tr.result = null; tr.mock = false; tr.look = []; tr.body = null; toast('Borramos tu foto'); return renderTryon(); }
    const ts = t.closest('[data-tsize]'); if (ts && !ts.classList.contains('no')) { tr.size = ts.dataset.tsize; return renderTryon(); }
    if (t.closest('[data-tadd]')) {
      const p = tr.p; const size = p.sizes.length === 1 ? p.sizes[0] : tr.size;
      if (p.sizes.length > 1 && !size) { toast('Elegí un talle'); return; }
      const v = p.variants.find((x) => avail(x) && (!p.sizes.length || x.size === size));
      if (!v) { toast('Ese talle está agotado'); return; }
      addToCart(v.id, 1);
      const log = own() ? tr.look.find((x) => x.p.id === p.id)?.log : tr.log;
      if (log) api('/api/tryon/added', { log }).catch(() => {});
      toast('Sumado a tu bolsa'); return;
    }
    if (t.closest('[data-more]')) { if (!own()) { if (tr.result) tr.base = tr.result; tr.result = null; tr.mock = false; } tr.picking = true; tr.size = ''; return renderTryon(); }
    if (t.closest('[data-again]')) { tr.base = tr.photo; tr.look = []; tr.result = null; tr.mock = false; tr.picking = true; tr.size = ''; return renderTryon(); }
    if (t.closest('label.off')) { e.preventDefault(); tr.error = 'Confirmá que la foto es tuya para seguir.'; renderTryon(); }
  });
  el.addEventListener('toggle', (e) => { if (e.target.matches?.('.tr-adj')) tr.adjOpen = e.target.open; }, true);
  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-consent]')) { tr.consent = t.checked; tr.error = ''; return renderTryon(); }
    if (t.matches('[data-remember]')) { tr.remember = t.checked; try { if (t.checked && tr.photo) localStorage.setItem(TRY_KEY, tr.photo); else localStorage.removeItem(TRY_KEY); } catch {} return; }
    if (t.id === 'trFile' && t.files[0]) {
      try {
        tr.photo = await shrinkPhoto(t.files[0]); tr.base = tr.photo; tr.result = null; tr.mock = false; tr.error = ''; tr.consent = true; tr.status = 'ready'; tr.body = null;
        if (tr.remember) try { localStorage.setItem(TRY_KEY, tr.photo); } catch {}
        stopLive();
        if (own()) { const keep = tr.look.map((x) => x.p); tr.look = []; renderTryon(); await analyzePhoto(); for (const p of keep) if (p.id !== tr.p?.id) await addToLook(p); return; }
      } catch (err) { tr.error = err.message; }
      renderTryon();
    }
  });
  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-cmp]')) { tr.cmp = Number(e.target.value); el.querySelector('.tr-cmp').style.setProperty('--x', tr.cmp + '%'); }
    if (e.target.matches('[data-adj]')) { const cur = tr.look.at(-1); cur.adj[e.target.dataset.adj] = Number(e.target.value) / 100; tr.adjOpen = true; drawLook(true); }
    if (e.target.id === 'trQ') { tr.q = e.target.value; const pos = e.target.selectionStart; renderTryon(); const q = $('#trQ'); q.focus(); q.setSelectionRange(pos, pos); }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-tryon-open]')) { closeAll(); openTryon(null); } });
}
