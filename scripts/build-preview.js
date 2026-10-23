// Arma la vista previa en un solo archivo: tienda + panel + un servidor de prueba en el navegador.
// Uso: node scripts/build-preview.js [salida.html] [--images=carpeta] [--limit=N]
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/lib/config.js';
import { publicCatalog } from '../server/lib/catalog.js';
import { DEMO_USERS } from './demo-users-list.js';
import { seedHeroVideo, seedHeroVideos2 } from '../server/lib/importer.js';
import { seedGarments } from '../server/lib/probador.js';
seedHeroVideo();
seedHeroVideos2();
seedGarments();

const out = process.argv.find((a) => a.endsWith('.html')) || path.join(ROOT, 'dist/vista-previa.html');
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const limit = Number(arg('limit')) || 0;
const imgDir = arg('images');
// --standalone: página completa para publicar como sitio (Vercel u otro hosting estático), con /media al lado.
const standalone = process.argv.includes('--standalone');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

const html = read('public/index.html');
const body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0];
const adminHtml = read('admin/index.html').split('<body>')[1].split('<script')[0];
// El panel vive en un Shadow DOM: sus reglas de :root y body pasan al host y a un contenedor.
const adminCss = read('admin/admin.css')
  .replace(/:root:not\(\[data-theme="light"\]\)/g, ':host')
  .replace(/:root\[data-theme="dark"\]/g, ':host-context([data-theme="dark"])')
  .replace(/:root\s*\{/g, ':host {')
  .replace(/html, body \{ height: 100%; \}/, '.admin-shell { min-height: 100%; }')
  .replace(/\nbody \{/, '\n.admin-shell {');

const cat = structuredClone(publicCatalog());
if (limit) cat.products = cat.products.slice(0, limit);
if (imgDir) {
  const rel = path.basename(imgDir);
  for (const p of cat.products) { const local = [1, 2].map((n) => `${rel}/${p.slug}-${n}.webp`).filter((f) => existsSync(path.join(imgDir, path.basename(f)))); if (local.length) p.images = local; }
  let k = 0;
  cat.banners.forEach((b) => { if (b.video_url) return; k++; const f = `${rel}/banner-${k}.webp`; if (existsSync(path.join(imgDir, path.basename(f)))) b.image_url = f; });
}
// Los archivos de /media (video de portada) se publican al lado de la página.
for (const b of cat.banners) for (const k of ['image_url', 'video_url']) if (String(b[k] || '').startsWith('/media/')) b[k] = b[k].slice(1);
for (const p of cat.products) p.images = p.images.map((u) => (u.startsWith('/media/') ? u.slice(1) : u));
// Prendas del probador: rutas relativas para que funcionen al lado de la página.
const garmentFiles = [];
for (const g of Object.values(cat.tryon?.garments || {})) { if (g.url.startsWith('/')) { g.url = g.url.slice(1); garmentFiles.push(g.url); } }
const j = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const page = `<title>Samadhi Style</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Italiana&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Jost:wght@300;400;500&display=swap">
<style>
${read('public/assets/store.css')}
</style>
${body}
<script>
window.SAMADHI_EMBED = ${j(cat)};
window.__SAMADHI_DEMO_USERS = ${j(DEMO_USERS)};
window.__ADMIN_CSS = ${j(adminCss)};
window.__ADMIN_HTML = ${j(adminHtml)};
window.__PROBADOR_BASE = ${JSON.stringify(standalone ? 'vendor/mediapipe-pose/' : 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/')};
</script>
<script type="module">
${read('public/assets/probador-engine.js').replace(/^export /gm, '')}
window.__PROBADOR = { KINDS, kindFor, isShort, loadPose, detect, prepareGarment, prepareGarmentFromMask, prepareFlatGarment, fitGarment, checkBody, renderLook };
</script>
<script type="module">
${read('server/lib/email-templates.js').replace(/^export /gm, '')}
window.__EMAIL = { TEMPLATES, GROUPS, sampleContext, render, TRYON_MAIL_DEFAULTS };
</script>
<script type="module">
${read('server/lib/stats-core.js').replace(/^export /gm, '')}
window.__STATS = { computeStats, resolveRange };
</script>
<script type="module">
${read('server/lib/content-defaults.js').replace(/^export /gm, '')}
window.__CONTENT = { CONTENT_DEFAULTS };
</script>
<script type="module">
${read('server/lib/track-core.js').replace(/^export /gm, '')}
window.__TRACK = { buildTimeline };
</script>
<script type="module">
${read('preview/demo-api.js')}
</script>
<script type="module">
${read('preview/admin-host.js')}
</script>
<script type="module">
${read('admin/admin.js')}
</script>
<script type="module">
${read('public/assets/store.js')}
</script>
`;
const full = standalone ? `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Samadhi Style · Moda, accesorios y estilo. Lo auténtico también se viste.">
<meta name="theme-color" content="#f4efe6">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%234c5a3d'/%3E%3Ctext x='32' y='46' font-family='Georgia,serif' font-size='40' fill='%23f4efe6' text-anchor='middle'%3ES%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://acdn-us.mitiendanube.com">
${page.replace(/^<title>Samadhi Style<\/title>\n<meta name="claude:viewport-fit-sides" content="cover">\n/, '<title>Samadhi Style</title>\n')}` : page;
mkdirSync(path.dirname(out), { recursive: true });
if (standalone) {
  const j2 = full.indexOf('</style>') + 8;
  writeFileSync(out, full.slice(0, j2) + '\n</head>\n<body>' + full.slice(j2) + '</body>\n</html>\n');
  cpSync(path.join(ROOT, 'public/media'), path.join(path.dirname(out), 'media'), { recursive: true });
  cpSync(path.join(ROOT, 'public/vendor'), path.join(path.dirname(out), 'vendor'), { recursive: true });
  for (const f of garmentFiles) cpSync(path.join(ROOT, 'public', f), path.join(path.dirname(out), f));
} else writeFileSync(out, page);
if (!standalone) writeFileSync(path.join(path.dirname(out), 'probador-archivos.txt'), garmentFiles.join('\n'));
console.log(`${out} · ${(page.length / 1024).toFixed(0)} KB · ${cat.products.length} productos`);
