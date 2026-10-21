import { Router } from 'express';
import { run } from '../lib/db.js';
import { config } from '../lib/config.js';
import * as mp from '../integrations/mercadopago.js';
import { syncPaymentById } from '../lib/orders.js';

export const webhooks = Router();

// Mercado Pago avisa cada cambio de un pago. Respondemos rápido y procesamos.
webhooks.post('/mercadopago', async (req, res) => {
  const body = req.body || {};
  const type = body.type || req.query.type || req.query.topic;
  const dataId = String(req.query['data.id'] || body?.data?.id || req.query.id || '');
  const check = mp.verifySignature({ signature: req.get('x-signature'), requestId: req.get('x-request-id'), dataId });
  const log = (result) => run('INSERT INTO webhook_log(source, payload, result) VALUES(?,?,?)', 'mercadopago', JSON.stringify({ query: req.query, body }).slice(0, 4000), result);

  if (!check.ok) {
    log(`rechazado: ${check.reason}`);
    return res.status(401).json({ error: check.reason });
  }
  res.status(200).json({ received: true });
  if (type !== 'payment' || !dataId || config.mp.mock) return log(`ignorado (${type || 'sin tipo'})`);
  try {
    const r = await syncPaymentById(dataId);
    log(r.ok ? `pedido ${r.order}: ${r.status}` : `sin pedido: ${r.reason}`);
  } catch (err) {
    log(`error: ${err.message}`);
    console.error('[webhook mp]', err.message);
  }
});
