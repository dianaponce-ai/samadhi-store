// Línea de tiempo de "Seguir mi pedido". Sin dependencias: la usa el servidor y la vista previa.
const LABEL = { paid: 'Pagado', preparing: 'En preparación', ready_pickup: 'Listo para retirar', shipped: 'Despachado', delivered: 'Entregado' };

/** order: { status, shipping_method, created_at, paid_at, shipped_at, ready_at }  events: [{ kind, message, at }] */
export function buildTimeline(order, events = []) {
  const pickup = order.shipping_method === 'retiro';
  const when = (st) => events.filter((e) => e.kind === 'status' && e.message.startsWith(`Estado: ${LABEL[st]}`)).map((e) => e.at).sort()[0] || null;
  const steps = [
    { key: 'received', label: 'Pedido recibido', note: 'Recibimos tu pedido.', at: order.created_at },
    { key: 'paid', label: 'Pago acreditado', note: order.payment_method === 'transferencia' ? 'Recibimos tu transferencia.' : 'Mercado Pago aprobó el pago.', at: order.paid_at || when('paid') },
    { key: 'preparing', label: 'En preparación', note: 'Estamos preparando tus prendas.', at: when('preparing') },
    pickup
      ? { key: 'ready_pickup', label: 'Listo para retirar', note: 'Ya podés pasar a buscarlo por el local.', at: order.ready_at || when('ready_pickup') }
      : { key: 'shipped', label: 'Despachado', note: 'Salió con Andreani.', at: order.shipped_at || when('shipped') },
    { key: 'delivered', label: pickup ? 'Retirado' : 'Entregado', note: pickup ? '¡Gracias por pasar!' : 'Llegó a destino.', at: when('delivered') },
  ];
  const rank = { pending_payment: 0, paid: 1, preparing: 2, ready_pickup: 3, shipped: 3, delivered: 4 };
  const ended = order.status === 'cancelled' || order.status === 'refunded';
  let reached = rank[order.status] ?? 0;
  if (ended) reached = order.paid_at ? 1 : 0;
  steps.forEach((s, i) => { s.done = i <= reached; s.current = i === reached && !ended; });
  return { steps, ended: ended ? order.status : null };
}
