import express from 'express';
import path from 'node:path';
import { config, ROOT } from './lib/config.js';
import './lib/db.js';
import { ensureFirstAdmin } from './lib/auth.js';
import { startJobs } from './lib/jobs.js';
import { HttpError } from './lib/util.js';
import { store } from './routes/store.js';
import { admin } from './routes/admin.js';
import { webhooks } from './routes/webhooks.js';
import { auth, account } from './routes/account.js';
import { linceAgent } from './routes/lince.js';
import { startLince } from './integrations/dragonfish.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use('/api/webhooks', express.json({ limit: '200kb' }), webhooks);
app.use('/api/integrations/lince', express.json({ limit: '25mb' }), linceAgent);
app.post('/api/admin/tryon/garments/:id', express.json({ limit: '4mb' }));
app.use('/api/admin', express.json({ limit: '2mb' }), admin);
app.use('/api/auth', express.json({ limit: '50kb' }), auth);
app.use('/api/account', express.json({ limit: '50kb' }), account);
// La foto del probador virtual pesa más que el resto de los pedidos.
app.post('/api/tryon', express.json({ limit: '8mb' }));
app.use('/api', express.json({ limit: '200kb' }), store);

app.use('/uploads', express.static(path.join(config.dataDir, 'uploads'), { maxAge: '30d', immutable: true }));
app.use('/admin', express.static(path.join(ROOT, 'admin'), { index: 'index.html' }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'No existe esa ruta.' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'No pudimos leer los datos enviados.' });
  console.error(err);
  res.status(500).json({ error: err.message?.startsWith('Andreani') || err.message?.startsWith('Mercado Pago') ? err.message : 'Algo salió mal. Probá de nuevo en un momento.' });
});

// Primer arranque: si la base está vacía, carga el catálogo que viene en data/import.
{
  const { get } = await import('./lib/db.js');
  const { existsSync, readFileSync } = await import('node:fs');
  const csv = path.join(ROOT, 'data/import/tiendanube-productos.csv');
  const fotos = path.join(ROOT, 'data/import/fotos-tiendanube.txt');
  if (get('SELECT COUNT(*) AS n FROM products').n === 0 && existsSync(csv)) {
    const { importTiendanube, seedBannersIfEmpty, seedFeaturedIfEmpty, importExtras } = await import('./lib/importer.js');
    const s = importTiendanube(readFileSync(csv), existsSync(fotos) ? readFileSync(fotos, 'utf8') : '');
    seedFeaturedIfEmpty();
    seedBannersIfEmpty();
    importExtras(path.join(ROOT, 'data/import/productos-extra.json'));
    console.log(`Catálogo inicial cargado: ${s.products} productos, ${s.images} fotos.`);
  }
}
{ const { seedHeroVideo } = await import('./lib/importer.js'); seedHeroVideo(); }
{ const { seedGarments } = await import('./lib/probador.js'); seedGarments(); }
ensureFirstAdmin();
startJobs();
startLince();

app.listen(config.port, () => {
  console.log(`Samadhi Style en ${config.publicUrl} (puerto ${config.port})`);
  if (config.mp.mock) console.log('· Mercado Pago en modo prueba: falta MP_ACCESS_TOKEN.');
  if (config.andreani.mock) console.log('· Andreani en modo prueba: faltan las credenciales.');
  console.log(`· Lince: ${{ directo: 'conectado directo a Dragonfish', agente: 'esperando al agente del local', prueba: 'modo prueba (sin credenciales)' }[config.lince.mode]}.`);
  if (config.ephemeralSecret) console.log('· Falta SESSION_SECRET: las sesiones del panel se cierran al reiniciar.');
});
