// Probador virtual con IA: FASHN (https://docs.fashn.ai), modelo tryon-v1.6.
// La foto de la clienta viaja como base64 sólo para generar la imagen: no se guarda en la tienda,
// FASHN borra las copias base64 al terminar y no usa las fotos para entrenar.
// Sin FASHN_API_KEY queda en modo prueba (muestra la foto y la prenda, sin generar).
import crypto from 'node:crypto';
import { config } from '../lib/config.js';
import { db, all, get, run, getSetting } from '../lib/db.js';
import { HttpError } from '../lib/util.js';
import { publicGarments } from '../lib/probador.js';
import { geminiTryOn } from './gemini.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../lib/config.js';

db.exec(`
CREATE TABLE IF NOT EXISTS tryon_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  product_id INTEGER,
  status TEXT NOT NULL DEFAULT 'en curso',
  ms INTEGER,
  error TEXT,
  added INTEGER NOT NULL DEFAULT 0,
  who TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tryon_log_at ON tryon_log(at);
`);

const API = 'https://api.fashn.ai/v1';
// engine: 'samadhi' (motor propio, en el navegador), 'gemini' (IA de Google) o 'fashn' (IA de FASHN). Los dos últimos se pagan por imagen.
export const TRYON_DEFAULTS = { enabled: true, engine: 'gemini', dailyLimit: 300, perHour: 12, mode: 'balanced', hiddenCategories: null };
const ACCESSORY = /acces|bolso|cartera|cintur|bijou|aros|collar|pa[ñn]uelo|sombrero|gorro|lentes|calzado|zapat|bota|sandal|media/i;

export function tryonSettings() { return { ...TRYON_DEFAULTS, ...getSetting('tryon') }; }
export const tryonMock = (engine = tryonSettings().engine) => (engine === 'gemini' ? !config.gemini.apiKey : !config.fashn.apiKey);
/** Categorías donde no se muestra el probador (por defecto, accesorios y calzado). */
export function hiddenCategories() {
  const s = tryonSettings();
  if (Array.isArray(s.hiddenCategories)) return s.hiddenCategories;
  return all('SELECT id, name FROM categories').filter((c) => ACCESSORY.test(c.name)).map((c) => c.id);
}
export function publicTryon() {
  const s = tryonSettings();
  if (s.engine === 'gemini' && !tryonMock('gemini')) {
    // Las prendas del motor propio viajan igual: si la IA no responde, la tienda vuelve al probador propio.
    return { enabled: !!s.enabled, engine: 'gemini', hidden: hiddenCategories(), garments: publicGarments() };
  }
  if (s.engine !== 'fashn') {
    const garments = publicGarments();
    return { enabled: !!s.enabled && Object.keys(garments).length > 0, engine: 'samadhi', garments, hidden: [] };
  }
  return { enabled: !!s.enabled && (!tryonMock() || !config.production), engine: 'fashn', mock: tryonMock(), hidden: hiddenCategories() };
}
/** Uso del motor propio (no viaja ninguna foto: sólo qué prenda se probó). */
export function logOwnTry(productId, ip) {
  if (!get('SELECT id FROM products WHERE id = ?', Number(productId))) throw new HttpError(404, 'No encontramos esa prenda.');
  const who = whoHash(ip);
  if (get("SELECT COUNT(*) n FROM tryon_log WHERE who = ? AND at > datetime('now','-1 hour')", who).n > 200) return { log: null };
  return { log: Number(run("INSERT INTO tryon_log(product_id, who, status, ms) VALUES(?, ?, 'propio', 0)", Number(productId), who).lastInsertRowid) };
}

const jobs = new Map(); // id → { fashnId, logId, started, productId }
const whoHash = (ip) => crypto.createHmac('sha256', config.sessionSecret).update('tryon:' + ip).digest('base64url').slice(0, 16);
const abs = (u) => (/^https?:/.test(u) ? u : `${config.publicUrl}/${String(u).replace(/^\//, '')}`);

export async function startTryon({ productId, image = 0, photo, photoSize }, ip) {
  const s = tryonSettings();
  if (!s.enabled) throw new HttpError(403, 'El probador virtual no está disponible en este momento.');
  const p = get('SELECT id, name FROM products WHERE id = ? AND visible = 1', Number(productId));
  if (!p) throw new HttpError(404, 'No encontramos esa prenda.');
  const imgs = all('SELECT url FROM images WHERE product_id = ? ORDER BY position', p.id);
  const garment = imgs[Math.min(Math.max(0, Number(image) || 0), imgs.length - 1)]?.url;
  if (!garment) throw new HttpError(422, 'Esta prenda no tiene foto para probar.');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(photo || ''))) throw new HttpError(422, 'Subí una foto tuya de cuerpo entero (JPG o PNG).');
  if (photo.length > 6 * 1024 * 1024) throw new HttpError(413, 'La foto es muy pesada. Probá con otra.');
  const who = whoHash(ip);
  if (get("SELECT COUNT(*) n FROM tryon_log WHERE at > datetime('now','-1 day')").n >= s.dailyLimit) throw new HttpError(429, 'El probador llegó al límite de hoy. Volvé a probar mañana.');
  if (get("SELECT COUNT(*) n FROM tryon_log WHERE who = ? AND at > datetime('now','-1 hour')", who).n >= s.perHour) throw new HttpError(429, 'Probaste muchas prendas seguidas. Esperá un rato y seguí.');

  const logId = Number(run('INSERT INTO tryon_log(product_id, who) VALUES(?, ?)', p.id, who).lastInsertRowid);
  const id = crypto.randomBytes(12).toString('base64url');
  if (s.engine === 'gemini' && tryonMock('gemini')) throw new HttpError(503, 'El probador con IA no está configurado.', { code: 'sin-clave' });
  if (tryonMock()) {
    jobs.set(id, { mock: true, logId, started: Date.now(), productId: p.id });
    return { id, mock: true };
  }
  if (s.engine === 'gemini') {
    const g = get('SELECT kind FROM tryon_garments WHERE product_id = ?', p.id);
    const cats = all('SELECT c.name FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = ?', p.id).map((c) => c.name).join(' ');
    const kind = g?.kind || (/vestid|mono|enterit|tunica/i.test(p.name + ' ' + cats) ? 'full' : /jean|pantal|short|falda|pollera|wide/i.test(p.name + ' ' + cats) ? 'bottom' : 'top');
    const job = { gemini: true, logId, started: Date.now(), productId: p.id, done: null, error: null };
    jobs.set(id, job);
    (async () => {
      try {
        const garmentImg = await loadGarment(garment);
        const r = await geminiTryOn({ apiKey: config.gemini.apiKey, model: config.gemini.model, person: photo, personSize: Array.isArray(photoSize) ? photoSize : null, garment: garmentImg, kind, name: p.name, flat: /\.png$/i.test(garment) });
        job.done = r.image;
      } catch (e) { job.error = e; console.error('[probador gemini]', e.code, e.detail || e.message); }
    })();
    return { id };
  }
  const r = await fetch(`${API}/run`, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.fashn.apiKey}` },
    body: JSON.stringify({ model_name: 'tryon-v1.6', inputs: {
      model_image: photo, garment_image: abs(garment.replace(/-\d+-\d+\.(webp|jpg|png)$/, '-1024-1024.$1')),
      category: 'auto', garment_photo_type: 'model', mode: ['performance', 'balanced', 'quality'].includes(s.mode) ? s.mode : 'balanced',
      output_format: 'jpeg', return_base64: true, moderation_level: 'permissive', num_samples: 1,
    } }),
  }).catch((e) => { throw new HttpError(502, 'No pudimos conectar con el probador. Probá de nuevo en un momento.'); });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) {
    const msg = d.error?.message || d.message || r.status;
    run("UPDATE tryon_log SET status = 'error', error = ? WHERE id = ?", String(msg).slice(0, 200), logId);
    console.error('[probador]', msg);
    throw new HttpError(r.status === 429 ? 429 : 502, r.status === 429 ? 'El probador está con mucha demanda. Probá en unos segundos.' : 'El probador no está disponible ahora. Probá más tarde.');
  }
  jobs.set(id, { fashnId: d.id, logId, started: Date.now(), productId: p.id });
  return { id };
}

const FRIENDLY = {
  PoseError: 'No pudimos reconocer el cuerpo en la foto. Usá una foto de cuerpo entero, de frente y con buena luz.',
  ImageLoadError: 'No pudimos leer la foto. Probá con otra.',
  ContentModerationError: 'La foto no pasó el control de contenido. Probá con otra foto.',
  InputValidationError: 'La foto no sirve para el probador. Probá con otra de cuerpo entero.',
};
export async function pollTryon(id) {
  const j = jobs.get(String(id));
  if (!j) throw new HttpError(404, 'Esta prueba ya venció. Volvé a generarla.');
  const finish = (status, error = null) => { run('UPDATE tryon_log SET status = ?, ms = ?, error = ? WHERE id = ?', status, Date.now() - j.started, error, j.logId); };
  if (j.gemini) {
    if (j.done) { finish('lista'); jobs.delete(id); return { status: 'completed', image: j.done, log: j.logId }; }
    if (j.error) { finish('error', `${j.error.code}: ${j.error.detail || j.error.message}`.slice(0, 200)); jobs.delete(id); throw new HttpError(j.error.code === 'sin-clave' ? 503 : 422, j.error.message, { code: j.error.code }); }
    if (Date.now() - j.started > 120e3) { finish('error', 'tiempo agotado'); jobs.delete(id); throw new HttpError(504, 'Tardó demasiado. Probá de nuevo.'); }
    return { status: 'processing' };
  }
  if (j.mock) {
    if (Date.now() - j.started < 2500) return { status: 'processing' };
    finish('prueba'); jobs.delete(id);
    return { status: 'completed', mock: true, log: j.logId };
  }
  const r = await fetch(`${API}/status/${encodeURIComponent(j.fashnId)}`, { headers: { Authorization: `Bearer ${config.fashn.apiKey}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r) return { status: 'processing' };
  const d = await r.json().catch(() => ({}));
  if (d.status === 'completed' && d.output?.[0]) {
    finish('lista'); jobs.delete(id);
    const out = d.output[0];
    return { status: 'completed', image: out.startsWith('data:') ? out : `data:image/jpeg;base64,${out}`, log: j.logId };
  }
  if (d.status === 'failed') {
    finish('error', `${d.error?.name || ''}: ${d.error?.message || ''}`.slice(0, 200)); jobs.delete(id);
    throw new HttpError(422, FRIENDLY[d.error?.name] || 'No pudimos generar la imagen. Probá con otra foto de cuerpo entero.');
  }
  if (Date.now() - j.started > 120e3) { finish('error', 'tiempo agotado'); jobs.delete(id); throw new HttpError(504, 'Tardó demasiado. Probá de nuevo.'); }
  return { status: d.status || 'processing' };
}
export function markAdded(logId) { run('UPDATE tryon_log SET added = 1 WHERE id = ?', Number(logId)); }

export function tryonStats() {
  const day = (n) => get(`SELECT COUNT(*) n, SUM(added) a FROM tryon_log WHERE at > datetime('now', ?) AND status IN ('lista','prueba','propio')`, `-${n} days`);
  const top = all(`SELECT t.product_id, p.name, COUNT(*) tries, SUM(t.added) added, (SELECT url FROM images WHERE product_id = p.id ORDER BY position LIMIT 1) image
    FROM tryon_log t JOIN products p ON p.id = t.product_id WHERE t.at > datetime('now','-30 days') AND t.status IN ('lista','prueba','propio') GROUP BY t.product_id ORDER BY tries DESC LIMIT 10`);
  const errors = get(`SELECT COUNT(*) n FROM tryon_log WHERE at > datetime('now','-30 days') AND status = 'error'`).n;
  const avg = get(`SELECT AVG(ms) ms FROM tryon_log WHERE at > datetime('now','-30 days') AND status = 'lista'`).ms;
  const today = day(1), month = day(30);
  return { today: today.n, month: month.n, added: month.a || 0, errors, avgSeconds: avg ? Math.round(avg / 100) / 10 : null, top };
}

/** Foto de la prenda en base64 (del CDN de Tiendanube o de los archivos de la tienda). */
async function loadGarment(url) {
  if (/^https?:/.test(url)) {
    const r = await fetch(url.replace(/-\d+-\d+\.(webp|jpg|png)$/, '-1024-1024.$1'), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw Object.assign(new Error('No pudimos cargar la foto de la prenda.'), { code: 'servicio' });
    return { mimeType: r.headers.get('content-type') || 'image/webp', data: Buffer.from(await r.arrayBuffer()).toString('base64') };
  }
  const f = url.startsWith('/uploads/') ? path.join(config.dataDir, url) : path.join(ROOT, 'public', url);
  const ext = path.extname(f).slice(1).toLowerCase();
  return { mimeType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', data: (await readFile(f)).toString('base64') };
}
