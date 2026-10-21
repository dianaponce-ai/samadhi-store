// Tareas que corren solas cada 10 minutos: recordatorios por email y vencimiento de reservas.
import { all, get, run, getSetting } from './db.js';
import { config } from './config.js';
import { emailSettings, notifyOrder, sendTemplate } from './mail.js';
import { cartItems } from './carts.js';
import { expireStaleOrders, transferInfo } from './orders.js';

const ago = (h) => `-${Math.max(0, Number(h) || 0) * 60} minutes`;

export async function runJobs() {
  const s = emailSettings();
  const done = { expired: expireStaleOrders(), carts: 0, payment: 0, transfer: 0, pickup: 0 };

  // Carritos abandonados: primer aviso y último aviso.
  run(`UPDATE carts SET status = 'expired' WHERE status = 'active' AND updated_at < datetime('now', '-14 days')`);
  for (const [step, hours, key] of [[0, s.cartReminder1Hours, 'cart_reminder_1'], [1, s.cartReminder2Hours, 'cart_reminder_2']]) {
    const due = all(`SELECT * FROM carts WHERE status = 'active' AND reminders = ? AND updated_at < datetime('now', ?)
                     AND COALESCE(last_reminder_at, updated_at) < datetime('now', ?)`, step, ago(hours), ago(step ? hours - s.cartReminder1Hours : 0));
    for (const c of due) {
      // Si compró después de dejar la bolsa, no la molestamos.
      const bought = get(`SELECT id FROM orders WHERE email = ? AND created_at > ? LIMIT 1`, c.email, c.created_at);
      if (bought) { run("UPDATE carts SET status = 'converted', order_id = ? WHERE id = ?", bought.id, c.id); continue; }
      const items = cartItems(c).filter((i) => i.stock === null || i.stock > 0);
      if (!items.length) { run("UPDATE carts SET status = 'expired' WHERE id = ?", c.id); continue; }
      await sendTemplate(key, c.email, {
        name: c.name, cart: { items, total: items.reduce((a, i) => a + i.unit_price * i.qty, 0) },
        links: { cart: `${config.publicUrl}/?carrito=${c.token}` },
      });
      run("UPDATE carts SET reminders = reminders + 1, last_reminder_at = datetime('now') WHERE id = ?", c.id);
      done.carts++;
    }
  }

  // Pago con Mercado Pago pendiente.
  for (const o of all(`SELECT * FROM orders WHERE status = 'pending_payment' AND payment_method != 'transferencia' AND reminded_at IS NULL AND created_at < datetime('now', ?)`, ago(s.paymentReminderHours))) {
    run("UPDATE orders SET reminded_at = datetime('now') WHERE id = ?", o.id);
    await notifyOrder('payment_reminder', o);
    done.payment++;
  }

  // Reserva por transferencia a punto de vencer.
  const th = Number(getSetting('payments').transferHours) || 48;
  for (const o of all(`SELECT * FROM orders WHERE status = 'pending_payment' AND payment_method = 'transferencia' AND reminded_at IS NULL AND created_at < datetime('now', ?)`, ago(Math.max(1, th - s.transferReminderHoursBefore)))) {
    run("UPDATE orders SET reminded_at = datetime('now') WHERE id = ?", o.id);
    await notifyOrder('transfer_reminder', o, { transfer: transferInfo() });
    done.transfer++;
  }

  // Pedido listo para retirar que nadie pasó a buscar.
  const sh = getSetting('shipping');
  for (const o of all(`SELECT * FROM orders WHERE status = 'ready_pickup' AND pickup_reminded_at IS NULL AND COALESCE(ready_at, updated_at) < datetime('now', ?)`, `-${Number(s.pickupReminderDays) || 3} days`)) {
    run("UPDATE orders SET pickup_reminded_at = datetime('now') WHERE id = ?", o.id);
    await notifyOrder('pickup_reminder', o, { pickup: { address: sh.pickupAddress, hours: sh.pickupHours } });
    done.pickup++;
  }
  return done;
}

export function startJobs() {
  const tick = () => runJobs().catch((e) => console.error('[tareas]', e.message));
  setInterval(tick, 10 * 60e3).unref();
  setTimeout(tick, 5000).unref();
}
