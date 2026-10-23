// Función de Vercel para la demo: probador con IA de Google Gemini.
// La demo de Vercel es estática (la tienda y el panel corren en el navegador); esta es la única parte que corre en el servidor.
// Necesita la variable GEMINI_API_KEY en Vercel (Settings → Environment Variables). Opcional: GEMINI_IMAGE_MODEL.
import { geminiTryOn, GEMINI_DEFAULT_MODEL } from '../server/integrations/gemini.js';

const hits = new Map(); // límite simple por persona (por instancia): 15 pruebas por hora
const ALLOWED = /^https:\/\/acdn(-us)?\.mitiendanube\.com\//;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !origin.includes(host)) return res.status(403).json({ error: 'Pedido rechazado.' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'El probador con IA no está configurado.', code: 'sin-clave' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (list.length >= 15) return res.status(429).json({ error: 'Probaste muchas prendas seguidas. Esperá un rato y seguí.' });
  list.push(now); hits.set(ip, list);

  const { photo, photoSize, garmentUrl, kind, name } = req.body || {};
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(photo || '')) || photo.length > 4_000_000) return res.status(422).json({ error: 'Subí una foto tuya de cuerpo entero (JPG o PNG).' });
  let url = String(garmentUrl || '');
  if (!ALLOWED.test(url)) {
    if (!/^\/?(media|probador|img)\/[\w./-]+\.(png|webp|jpe?g)$/.test(url)) return res.status(422).json({ error: 'Foto de prenda inválida.' });
    url = `https://${host}/${url.replace(/^\//, '')}`;
  } else url = url.replace(/-\d+-\d+\.(webp|jpg|png)$/, '-1024-1024.$1');
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return res.status(502).json({ error: 'No pudimos cargar la foto de la prenda.' });
    const garment = { mimeType: r.headers.get('content-type') || 'image/webp', data: Buffer.from(await r.arrayBuffer()).toString('base64') };
    const out = await geminiTryOn({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_IMAGE_MODEL || GEMINI_DEFAULT_MODEL, person: photo, personSize: Array.isArray(photoSize) ? photoSize : null,
      garment, kind: ['top', 'bottom', 'full'].includes(kind) ? kind : 'top', name: String(name || '').slice(0, 80), flat: /\.png$/i.test(url), timeoutMs: 55000 });
    return res.status(200).json(out);
  } catch (e) {
    console.error('[probador]', e.code, e.detail || e.message);
    return res.status(e.code === 'sin-clave' ? 503 : e.code === 'bloqueada' || e.code === 'sin-imagen' ? 422 : 502).json({ error: e.message, code: e.code });
  }
}
