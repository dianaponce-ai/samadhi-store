// Entrada del agente de Lince (programa en la PC del local) y sección del panel.
import { Router } from 'express';
import { HttpError } from '../lib/util.js';
import * as df from '../integrations/dragonfish.js';

/** Lo llama el agente con el encabezado x-sync-secret = LINCE_SYNC_SECRET. */
export const linceAgent = Router();
const agentOnly = (req, res, next) => {
  if (!df.agentAllowed(req.get('x-sync-secret'))) throw new HttpError(401, 'Clave de sincronización incorrecta.');
  next();
};
linceAgent.post('/stock', agentOnly, (req, res) => {
  const rows = req.body?.stock ?? req.body?.Resultados ?? req.body;
  res.json(df.applyStock(rows, 'agente del local'));
});
linceAgent.get('/pedidos', agentOnly, (req, res) => res.json(df.pendingOrders()));
linceAgent.post('/pedidos/:id/cargado', agentOnly, (req, res) => res.json(df.markLoaded(Number(req.params.id), 'agente del local')));
