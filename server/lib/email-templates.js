// Plantillas de los emails automáticos de Samadhi Style.
// Sin dependencias: las usa el servidor y también la vista previa en el navegador.
//
// Cada plantilla recibe un contexto `c`:
//   c.store  { name, url, whatsapp, instagram }
//   c.name   nombre de la clienta (o del equipo en los avisos internos)
//   c.order  { number, total, subtotal, discount, shippingCost, shippingLabel, items[{name, variant_label, qty, unit_price, image}], paymentMethod }
//   c.links  { order, shop, cart, reset, unsubscribe, panel }
//   c.transfer { holder, bank, cbu, alias, hours, discount }   c.tracking { number, url }   c.pickup { address, hours }
//   c.cart   { items[...], total }   c.lowStock [{ name, variant, stock }]

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const first = (n) => e(String(n || '').trim().split(/\s+/)[0] || '');
const abs = (c, u) => (!u ? '' : /^https?:/.test(u) ? u : `${c.store.url}/${String(u).replace(/^\//, '')}`);

const INK = '#191816', IVORY = '#f4efe6', PAPER = '#faf7f1', SAND = '#e3d6c3', MUTED = '#6d675d', OLIVE = '#4c5a3d';
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Helvetica,Arial,sans-serif";

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 6px"><tr><td style="background:${INK}">
    <a href="${e(href)}" style="display:inline-block;padding:14px 30px;font-family:${SANS};font-size:11px;letter-spacing:3px;color:${IVORY};text-decoration:none;text-transform:uppercase">${e(label)}</a></td></tr></table>`;
}
function items(c, list, { prices = true } = {}) {
  const rows = (list || []).map((i) => `<tr>
    <td width="64" style="padding:10px 12px 10px 0;vertical-align:top">${i.image ? `<img src="${e(abs(c, i.image))}" width="56" height="74" alt="" style="display:block;width:56px;height:74px;object-fit:cover;background:${SAND}">` : `<div style="width:56px;height:74px;background:${SAND}"></div>`}</td>
    <td style="padding:10px 0;font-family:${SERIF};font-size:16px;color:${INK};vertical-align:top">${e(i.name)}<div style="font-family:${SANS};font-size:12px;color:${MUTED};margin-top:4px">${e(i.variant_label || '')}${i.qty > 1 ? ` · ${i.qty} u.` : ''}</div></td>
    ${prices ? `<td align="right" style="padding:10px 0;font-family:${SANS};font-size:14px;color:${INK};vertical-align:top;white-space:nowrap">${money(i.unit_price * (i.qty || 1))}</td>` : ''}</tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${SAND};border-bottom:1px solid ${SAND};margin:22px 0">${rows}</table>`;
}
function totals(o) {
  const row = (k, v, strong) => `<tr><td style="padding:3px 0;font-family:${SANS};font-size:${strong ? 15 : 13}px;color:${strong ? INK : MUTED}">${k}</td><td align="right" style="padding:3px 0;font-family:${strong ? SERIF : SANS};font-size:${strong ? 20 : 13}px;color:${INK}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row('Productos', money(o.subtotal))}${o.discount ? row('Descuentos', '− ' + money(o.discount)) : ''}${row(e(o.shippingLabel || 'Envío'), o.shippingCost ? money(o.shippingCost) : 'Sin cargo')}${row('Total', money(o.total), true)}</table>`;
}
function box(inner) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:${IVORY};padding:18px 20px;font-family:${SANS};font-size:14px;line-height:1.7;color:${INK}">${inner}</td></tr></table>`;
}
const p = (t) => `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK}">${t}</p>`;
// Enlace visible debajo del botón (por si el correo no muestra botones): abre la bolsa armada.
const cartLink = (c) => { const u = abs(c, c.links.cart); return `<p style="margin:4px 0 0;text-align:center;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED}">¿No ves el botón? Recuperá tu bolsa acá:<br><a href="${e(u)}" style="color:${OLIVE};word-break:break-all">${e(u.replace(/^\.\//, c.store.name.toLowerCase().replace(/\s+/g, '') + '.com.ar/'))}</a></p>`; };
const small = (t) => `<p style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED}">${t}</p>`;

/** Marco común: marfil, logotipo, título en itálica y pie con la frase de la marca. */
export function layout(c, { preheader = '', title, body, marketing = false }) {
  const contact = [c.store.whatsapp && `WhatsApp ${e(c.store.whatsapp)}`, c.store.instagram && `@${e(String(c.store.instagram).replace('@', ''))}`].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title></head>
<body style="margin:0;padding:0;background:${IVORY}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY}"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${PAPER}">
  <tr><td align="center" style="padding:40px 28px 6px">
    <a href="${e(c.store.url)}" style="text-decoration:none;color:${INK}"><div style="font-family:${SERIF};font-size:32px;letter-spacing:2px;line-height:1">SAMADHI</div>
    <div style="font-family:${SANS};font-size:10px;letter-spacing:9px;padding-left:9px;margin-top:6px">STYLE</div></a>
    <div style="width:1px;height:30px;background:${INK};margin:20px auto 0"></div></td></tr>
  <tr><td align="center" style="padding:18px 32px 4px"><div style="font-family:${SERIF};font-style:italic;font-size:26px;line-height:1.25;color:${INK}">${title}</div></td></tr>
  <tr><td style="padding:18px 36px 34px">${body}</td></tr>
  <tr><td align="center" style="padding:22px 28px 30px;border-top:1px solid ${SAND}">
    <div style="font-family:${SERIF};font-style:italic;font-size:16px;color:${INK}">Lo auténtico también se viste.</div>
    ${contact ? `<div style="font-family:${SANS};font-size:12px;color:${MUTED};margin-top:10px">${contact}</div>` : ''}
    ${marketing && c.links?.unsubscribe ? `<div style="font-family:${SANS};font-size:11px;color:${MUTED};margin-top:12px">¿No querés recibir estos recordatorios? <a href="${e(c.links.unsubscribe)}" style="color:${MUTED}">Darte de baja</a></div>` : ''}
  </td></tr>
</table></td></tr></table></body></html>`;
}

const transferBox = (c) => box(`<b>Transferí ${money(c.order.total)}</b> (ya tiene el ${c.transfer.discount}% OFF)<br>
  ${[['Titular', c.transfer.holder], ['Banco', c.transfer.bank], ['CBU / CVU', c.transfer.cbu], ['Alias', c.transfer.alias]].filter((r) => r[1]).map(([k, v]) => `${k}: <b>${e(v)}</b>`).join('<br>')}`);

// ── Catálogo de emails ───────────────────────────────────
// group: cuenta | pedido | pago | envio | recordatorio | equipo
export const TEMPLATES = {
  account_welcome: {
    label: 'Bienvenida', group: 'cuenta', to: 'Clienta', when: 'Al crear su cuenta.',
    subject: (c) => `Bienvenida a Samadhi, ${first(c.name)}`,
    html: (c) => layout(c, { preheader: 'Tu cuenta ya está lista.', title: 'Qué lindo que estés acá.', body:
      p(`Hola ${first(c.name)}, ya tenés tu cuenta en Samadhi Style. Desde ahí ves tus pedidos, seguís tus envíos y comprás más rápido.`) +
      button(c.links.shop, 'Ver la colección') }),
  },
  password_reset: {
    label: 'Restablecer contraseña', group: 'cuenta', to: 'Clienta o equipo', when: 'Cuando alguien toca "Olvidé mi contraseña".',
    subject: () => 'Restablecé tu contraseña',
    html: (c) => layout(c, { preheader: 'El link vence en una hora.', title: 'Elegí una nueva contraseña.', body:
      p(`Hola ${first(c.name)}, recibimos un pedido para cambiar tu contraseña. Tocá el botón para elegir una nueva.`) +
      button(c.links.reset, 'Elegir contraseña') + small('El link sirve una sola vez y vence en una hora. Si no lo pediste vos, ignorá este email: tu contraseña no cambia.') }),
  },
  order_received: {
    label: 'Pedido recibido', group: 'pedido', to: 'Clienta', when: 'Al confirmar la compra, antes de que se acredite el pago con Mercado Pago.',
    subject: (c) => `Recibimos tu pedido ${c.order.number}`,
    html: (c) => layout(c, { preheader: 'Te avisamos apenas Mercado Pago confirme el pago.', title: 'Recibimos tu pedido.', body:
      p(`Hola ${first(c.name)}, tu pedido <b>${e(c.order.number)}</b> está registrado. Apenas Mercado Pago confirme el pago te escribimos y empezamos a prepararlo.`) +
      items(c, c.order.items) + totals(c.order) + button(c.links.order, 'Ver mi pedido') }),
  },
  transfer_instructions: {
    label: 'Datos para transferir', group: 'pago', to: 'Clienta', when: 'Al elegir transferencia en el checkout.',
    subject: (c) => `Datos para transferir · Pedido ${c.order.number}`,
    html: (c) => layout(c, { preheader: `Guardamos tus prendas ${c.transfer.hours} horas.`, title: 'Ya casi es tuyo.', body:
      p(`Hola ${first(c.name)}, reservamos tu pedido <b>${e(c.order.number)}</b>. Solo falta la transferencia.`) + transferBox(c) +
      p(`Mandanos el comprobante por WhatsApp${c.store.whatsapp ? ` al ${e(c.store.whatsapp)}` : ''} o respondiendo este email. Guardamos tus prendas ${c.transfer.hours} horas.`) +
      items(c, c.order.items) + button(c.links.order, 'Ver mi pedido') }),
  },
  payment_reminder: {
    label: 'Recordatorio de pago', group: 'recordatorio', to: 'Clienta', when: 'Si el pago con Mercado Pago sigue pendiente después del tiempo configurado.',
    subject: (c) => `Tu pedido ${c.order.number} te está esperando`,
    html: (c) => layout(c, { preheader: 'Todavía no se acreditó el pago.', title: 'Tus prendas te esperan.', body:
      p(`Hola ${first(c.name)}, vimos que el pago de tu pedido <b>${e(c.order.number)}</b> todavía no se acreditó. Si tuviste algún problema, podés intentarlo de nuevo desde acá.`) +
      items(c, c.order.items) + button(c.links.order, 'Completar el pago') + small('Si ya pagaste, ignorá este mensaje: a veces Mercado Pago tarda unos minutos en avisarnos.') }),
  },
  transfer_reminder: {
    label: 'Reserva por vencer', group: 'recordatorio', to: 'Clienta', when: 'Unas horas antes de que venza la reserva por transferencia.',
    subject: (c) => `Tu reserva vence pronto · Pedido ${c.order.number}`,
    html: (c) => layout(c, { preheader: 'Todavía no recibimos la transferencia.', title: 'Tu reserva vence pronto.', body:
      p(`Hola ${first(c.name)}, todavía no recibimos la transferencia de tu pedido <b>${e(c.order.number)}</b>. Si no llega, liberamos las prendas para que otra persona pueda llevarlas.`) +
      transferBox(c) + p('¿Ya transferiste? Mandanos el comprobante y lo damos por pagado.') + button(c.links.order, 'Ver mi pedido') }),
  },
  payment_approved: {
    label: 'Pago acreditado', group: 'pago', to: 'Clienta', when: 'Cuando Mercado Pago aprueba el pago o el equipo marca la transferencia como recibida.',
    subject: (c) => `Recibimos tu pago · Pedido ${c.order.number}`,
    html: (c) => layout(c, { preheader: 'Ya estamos preparando tu pedido.', title: 'Gracias por ser parte de esta historia.', body:
      p(`Hola ${first(c.name)}, tu pago se acreditó y ya estamos preparando tu pedido <b>${e(c.order.number)}</b> con mucho cuidado.`) +
      items(c, c.order.items) + totals(c.order) +
      p(c.order.shippingMethod === 'retiro' ? 'Te avisamos cuando esté listo para retirar.' : 'Te avisamos cuando lo despachemos con Andreani, con el número de seguimiento.') +
      button(c.links.order, 'Ver mi pedido') }),
  },
  payment_rejected: {
    label: 'Pago rechazado', group: 'pago', to: 'Clienta', when: 'Cuando Mercado Pago rechaza el pago.',
    subject: (c) => `No pudimos procesar el pago · Pedido ${c.order.number}`,
    html: (c) => layout(c, { preheader: 'Podés intentarlo de nuevo con otro medio.', title: 'El pago no se pudo completar.', body:
      p(`Hola ${first(c.name)}, Mercado Pago no aprobó el pago de tu pedido <b>${e(c.order.number)}</b>. Suele pasar por un dato de la tarjeta o por un límite del banco.`) +
      p('Tus prendas siguen reservadas un rato más: podés intentarlo con otra tarjeta o medio de pago.') + button(c.links.order, 'Intentar de nuevo') }),
  },
  order_preparing: {
    label: 'En preparación', group: 'envio', to: 'Clienta', when: 'Cuando el equipo pasa el pedido a preparación.',
    subject: (c) => `Estamos preparando tu pedido ${c.order.number}`,
    html: (c) => layout(c, { preheader: 'Lo estamos armando con mucho cuidado.', title: 'Tu pedido está en preparación.', body:
      p(`Hola ${first(c.name)}, estamos armando tu pedido <b>${e(c.order.number)}</b>. ${c.order.shippingMethod === 'retiro' ? 'Te avisamos cuando puedas pasar a buscarlo.' : 'En cuanto salga te mandamos el seguimiento.'}`) +
      items(c, c.order.items, { prices: false }) }),
  },
  order_shipped: {
    label: 'Pedido despachado', group: 'envio', to: 'Clienta', when: 'Cuando el pedido sale con Andreani.',
    subject: (c) => `Tu pedido ${c.order.number} está en camino`,
    html: (c) => layout(c, { preheader: `Seguimiento Andreani ${c.tracking.number}.`, title: 'Tu pedido ya salió.', body:
      p(`Hola ${first(c.name)}, despachamos tu pedido <b>${e(c.order.number)}</b> con Andreani.`) +
      box(`Número de envío: <b>${e(c.tracking.number)}</b><br>${e(c.order.shippingLabel)}`) +
      button(c.tracking.url, 'Seguir mi envío') + items(c, c.order.items, { prices: false }) }),
  },
  order_ready_pickup: {
    label: 'Listo para retirar', group: 'envio', to: 'Clienta', when: 'Cuando el pedido está listo en el local.',
    subject: (c) => `Tu pedido ${c.order.number} está listo para retirar`,
    html: (c) => layout(c, { preheader: 'Te esperamos.', title: 'Te esperamos.', body:
      p(`Hola ${first(c.name)}, tu pedido <b>${e(c.order.number)}</b> ya está listo.`) +
      box(`Retiralo en <b>${e(c.pickup.address || 'nuestro local')}</b>${c.pickup.hours ? `<br>${e(c.pickup.hours)}` : ''}<br>Traé tu DNI o el número de pedido.`) +
      items(c, c.order.items, { prices: false }) }),
  },
  pickup_reminder: {
    label: 'Recordatorio de retiro', group: 'recordatorio', to: 'Clienta', when: 'Si el pedido sigue sin retirar después de los días configurados.',
    subject: (c) => `Tu pedido ${c.order.number} te sigue esperando`,
    html: (c) => layout(c, { preheader: 'Pasá cuando quieras.', title: 'Tu pedido te sigue esperando.', body:
      p(`Hola ${first(c.name)}, tu pedido <b>${e(c.order.number)}</b> está listo desde hace unos días.`) +
      box(`Retiralo en <b>${e(c.pickup.address || 'nuestro local')}</b>${c.pickup.hours ? `<br>${e(c.pickup.hours)}` : ''}`) +
      p(`Si no podés venir, escribinos${c.store.whatsapp ? ` al ${e(c.store.whatsapp)}` : ''} y buscamos otra forma.`) }),
  },
  order_delivered: {
    label: 'Pedido entregado', group: 'envio', to: 'Clienta', when: 'Cuando el pedido figura entregado.',
    subject: () => '¿Llegó todo bien?',
    html: (c) => layout(c, { preheader: 'Nos encantaría saber cómo te quedó.', title: 'La moda también crea momentos.', body:
      p(`Hola ${first(c.name)}, tu pedido <b>${e(c.order.number)}</b> ya está con vos. Esperamos que lo disfrutes tanto como nosotras disfrutamos elegirlo.`) +
      p(`Si algo no te quedó como esperabas, escribinos${c.store.whatsapp ? ` al ${e(c.store.whatsapp)}` : ''} y lo resolvemos. Y si te sacás una foto, etiquetanos${c.store.instagram ? ` en @${e(String(c.store.instagram).replace('@', ''))}` : ''}.`) +
      button(c.links.shop, 'Ver novedades') }),
  },
  order_cancelled: {
    label: 'Pedido cancelado', group: 'pedido', to: 'Clienta', when: 'Cuando un pedido se cancela, por falta de pago o desde el panel.',
    subject: (c) => `Cancelamos tu pedido ${c.order.number}`,
    html: (c) => layout(c, { preheader: 'Las prendas volvieron a la tienda.', title: 'Tu pedido fue cancelado.', body:
      p(`Hola ${first(c.name)}, cancelamos tu pedido <b>${e(c.order.number)}</b>${c.reason ? ` ${e(c.reason)}` : ''}. Si fue un error o todavía lo querés, escribinos y vemos si quedan los talles.`) +
      button(c.links.shop, 'Volver a la tienda') }),
  },
  order_refunded: {
    label: 'Devolución realizada', group: 'pago', to: 'Clienta', when: 'Cuando el equipo devuelve el dinero de un pedido.',
    subject: (c) => `Devolvimos el pago de tu pedido ${c.order.number}`,
    html: (c) => layout(c, { preheader: 'Puede tardar unos días en verse en tu cuenta.', title: 'Hicimos la devolución.', body:
      p(`Hola ${first(c.name)}, devolvimos ${money(c.order.total)} del pedido <b>${e(c.order.number)}</b>.`) +
      small('Según tu medio de pago, puede tardar hasta 10 días hábiles en verse reflejado.') }),
  },
  cart_reminder_1: {
    label: 'Tenés un carrito esperándote', group: 'recordatorio', marketing: true, to: 'Clienta', when: 'Si deja prendas en la bolsa sin comprar: 1 hora después (primer aviso).',
    subject: (c) => `${first(c.name) ? first(c.name) + ', t' : 'T'}enés un carrito esperándote`,
    html: (c) => layout(c, { preheader: 'Guardamos tus prendas por si querés volver.', title: 'Tenés un carrito esperándote.', marketing: true, body:
      p(`Hola${c.name ? ' ' + first(c.name) : ''}, dejaste estas prendas en tu bolsa. Las guardamos para que sigas cuando quieras.`) +
      items(c, c.cart.items) + `<p style="margin:0;font-family:${SERIF};font-size:20px;text-align:right">${money(c.cart.total)}</p>` +
      button(c.links.cart, 'Volver a mi bolsa') + cartLink(c) + small('Pagás en hasta 3 cuotas sin interés o con 10% OFF por transferencia.') }),
  },
  cart_reminder_2: {
    label: 'Último aviso del carrito', group: 'recordatorio', marketing: true, to: 'Clienta', when: 'Si sigue sin comprar: 48 horas después de dejar la bolsa (último aviso).',
    subject: () => 'Tus prendas siguen en la bolsa (por ahora)',
    html: (c) => layout(c, { preheader: 'Algunas tienen pocas unidades.', title: 'Tus prendas siguen esperándote.', marketing: true, body:
      p(`Hola${c.name ? ' ' + first(c.name) : ''}, muchas de nuestras prendas tienen una o dos unidades por talle. Las tuyas siguen en la bolsa, pero no podemos guardarlas para siempre.`) +
      items(c, c.cart.items) + button(c.links.cart, 'Terminar mi compra') + cartLink(c) + small('Es el último recordatorio que te mandamos sobre esta bolsa.') }),
  },
  withdrawal_received: {
    label: 'Arrepentimiento recibido', group: 'pedido', to: 'Clienta', when: 'Cuando usa el Botón de arrepentimiento. Incluye el código del trámite.',
    subject: (c) => `Recibimos tu pedido de arrepentimiento · ${e(c.withdrawal.code)}`,
    html: (c) => layout(c, { preheader: `Código de trámite ${c.withdrawal.code}`, title: 'Recibimos tu pedido de arrepentimiento.', body:
      p(`Hola ${first(c.name)}, registramos tu pedido de arrepentimiento de la compra <b>${e(c.withdrawal.orderNumber)}</b>.`) +
      box(`<span style="font-size:12px;color:${MUTED}">Código de identificación del trámite</span><br><b style="font-family:${SERIF};font-size:22px;letter-spacing:.04em">${e(c.withdrawal.code)}</b>`) +
      p('En las próximas horas te escribimos para coordinar la devolución de las prendas, sin costo para vos. Cuando las recibamos, te devolvemos el total pagado, incluido el envío, por el mismo medio de pago.') +
      small(`Si tenés alguna duda, escribinos por WhatsApp al ${e(c.store.whatsapp)} con tu código de trámite.`) }),
  },
  staff_withdrawal: {
    label: 'Arrepentimiento de una clienta', group: 'equipo', to: 'Equipo', when: 'Cuando una clienta usa el Botón de arrepentimiento.',
    subject: (c) => `Arrepentimiento ${c.withdrawal.code} · pedido ${c.withdrawal.orderNumber}`,
    html: (c) => layout(c, { title: 'Pedido de arrepentimiento', body:
      p(`<b>${e(c.name)}</b> (${e(c.withdrawal.email)}) pidió arrepentirse de la compra <b>${e(c.withdrawal.orderNumber)}</b>.`) +
      (c.withdrawal.reason ? box(`<span style="color:${MUTED}">Motivo</span><br>${e(c.withdrawal.reason)}`) : '') +
      p(`Ya le mandamos el código <b>${e(c.withdrawal.code)}</b>. Coordiná la devolución y hacé el reintegro desde el panel.`) + button(c.links.panel, 'Ver el pedido') }),
  },
  staff_new_order: {
    label: 'Nuevo pedido pagado', group: 'equipo', to: 'Equipo', when: 'Cuando se acredita el pago de un pedido.',
    subject: (c) => `Nuevo pedido ${c.order.number} · ${money(c.order.total)}`,
    html: (c) => layout(c, { preheader: `${c.order.customerName} · ${c.order.shippingLabel}`, title: `Pedido ${e(c.order.number)}`, body:
      p(`<b>${e(c.order.customerName)}</b> · ${e(c.order.email || '')} · ${e(c.order.phone || '')}<br>${e(c.order.shippingLabel)} · ${c.order.paymentMethod === 'transferencia' ? 'Transferencia' : 'Mercado Pago'}`) +
      items(c, c.order.items) + totals(c.order) + button(c.links.panel, 'Abrir en el panel') }),
  },
  staff_transfer_pending: {
    label: 'Reserva por transferencia', group: 'equipo', to: 'Equipo', when: 'Cuando una clienta elige pagar por transferencia.',
    subject: (c) => `Reserva ${c.order.number} esperando transferencia · ${money(c.order.total)}`,
    html: (c) => layout(c, { preheader: 'Cuando llegue el comprobante, marcalo como pagado.', title: 'Nueva reserva por transferencia.', body:
      p(`<b>${e(c.order.customerName)}</b> reservó el pedido <b>${e(c.order.number)}</b> por ${money(c.order.total)}. Cuando llegue el comprobante, abrilo en el panel y tocá "Marcar como pagado".`) +
      items(c, c.order.items, { prices: false }) + button(c.links.panel, 'Abrir en el panel') }),
  },
  staff_low_stock: {
    label: 'Stock bajo', group: 'equipo', to: 'Equipo', when: 'Cuando una venta deja una variante con 1 unidad o sin stock.',
    subject: (c) => `Stock bajo: ${c.lowStock.map((x) => x.name).slice(0, 2).join(', ')}${c.lowStock.length > 2 ? '…' : ''}`,
    html: (c) => layout(c, { preheader: 'Revisá si conviene reponer.', title: 'Quedan pocas unidades.', body:
      box(c.lowStock.map((x) => `<b>${e(x.name)}</b> · ${e(x.variant)} · ${x.stock === 0 ? 'agotado' : `queda ${x.stock}`}`).join('<br>')) + button(c.links.panel, 'Ver stock') }),
  },
};

export const GROUPS = { cuenta: 'Cuenta', pedido: 'Pedidos', pago: 'Pagos', envio: 'Envío y retiro', recordatorio: 'Recordatorios', equipo: 'Avisos al equipo' };

/** Contexto de ejemplo para la vista previa de cada plantilla en el panel. */
export function sampleContext(store, sample = {}) {
  const items = sample.items || [{ name: 'Vestido Ranya', variant_label: 'Negro · Talle M', qty: 1, unit_price: 125000, image: '' }];
  const subtotal = items.reduce((a, i) => a + i.unit_price * i.qty, 0);
  const order = { number: 'S-1042', subtotal, discount: 0, shippingCost: 6200, total: subtotal + 6200, shippingLabel: 'Andreani a domicilio', shippingMethod: 'andreani_domicilio', items, customerName: 'Lucía Fernández', email: 'lucia@ejemplo.com', phone: '221 555 0000', paymentMethod: 'mercadopago' };
  return {
    store, name: 'Lucía Fernández', order, reason: 'porque no se registró el pago a tiempo',
    links: { order: `${store.url}/pedido.html`, shop: store.url, cart: `${store.url}/?carrito=ejemplo`, reset: `${store.url}/?reset=ejemplo`, unsubscribe: `${store.url}/api/email/baja`, panel: `${store.url}/admin/` },
    transfer: { holder: 'Samadhi Style', bank: 'Banco', cbu: '0000000000000000000000', alias: 'SAMADHI.STYLE', hours: 48, discount: 10 },
    tracking: { number: '360000123456789', url: 'https://www.andreani.com/' },
    pickup: { address: 'Nuestro local', hours: 'Lunes a sábado de 10 a 19' },
    cart: { items, total: subtotal },
    withdrawal: { code: 'ARR-7K2M9Q', orderNumber: 'S-1042', email: 'lucia@ejemplo.com', reason: 'El talle me quedó grande.' },
    lowStock: [{ name: 'Vestido Ranya', variant: 'Negro · Talle M', stock: 1 }, { name: 'Wide Leg Black', variant: 'Talle 28', stock: 0 }],
  };
}

export function render(key, c) {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`No existe la plantilla ${key}`);
  return { subject: t.subject(c), html: t.html(c) };
}
