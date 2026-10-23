// Envío de emails con Resend (https://resend.com). Sin dependencias: lo usa el servidor y la función de Vercel.
export async function resendSend({ apiKey, from, to, subject, html, replyTo }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.message || d.error || `HTTP ${r.status}`;
    const e = new Error(/domain|verify|testing emails|own email/i.test(msg)
      ? 'Resend todavía no deja mandar a ese email: verificá el dominio de la tienda en Resend (Domains) o mandá a la dirección con la que creaste la cuenta.'
      : r.status === 401 || r.status === 403 ? 'La clave de Resend no es válida.' : 'No se pudo mandar el email.');
    e.detail = `${r.status} ${msg}`.slice(0, 300); e.status = r.status;
    throw e;
  }
  return d.id;
}
