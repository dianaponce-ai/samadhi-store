// Función de Vercel para la demo: manda de verdad algunos emails (Resend).
// La demo corre en el navegador; esta función solo envía, y solo a los emails autorizados en DEMO_EMAIL_TO,
// para que nadie pueda usarla para mandar correos a terceros.
// Variables en Vercel: RESEND_API_KEY, DEMO_EMAIL_TO (emails separados por coma), opcional MAIL_FROM.
import { resendSend } from '../server/integrations/resend.js';

const hits = new Map();
const TEMPLATES = new Set(['tryon_followup', 'test']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !origin.includes(host)) return res.status(403).json({ error: 'Pedido rechazado.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Falta configurar el envío de emails (RESEND_API_KEY en Vercel).', code: 'sin-clave' });
  const { to, subject, html, template } = req.body || {};
  const allowed = String(process.env.DEMO_EMAIL_TO || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
  const dest = String(to || '').trim().toLowerCase();
  if (!allowed.includes(dest)) return res.status(403).json({ error: `En la demo solo se mandan emails a las direcciones autorizadas (DEMO_EMAIL_TO). ${dest} no está en la lista.`, code: 'no-permitido' });
  if (!TEMPLATES.has(template) || typeof subject !== 'string' || typeof html !== 'string' || html.length > 400000) return res.status(422).json({ error: 'Email inválido.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (list.length >= 20) return res.status(429).json({ error: 'Demasiados envíos seguidos. Esperá un rato.' });
  list.push(now); hits.set(ip, list);
  try {
    const id = await resendSend({ apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM || 'Samadhi Style <onboarding@resend.dev>', to: dest, subject: subject.slice(0, 200), html });
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('[email]', e.detail || e.message);
    return res.status(502).json({ error: e.message, detail: e.detail || '' });
  }
}
