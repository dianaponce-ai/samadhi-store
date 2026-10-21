import { Router } from 'express';
import { all, get, run } from '../lib/db.js';
import { HttpError, digits } from '../lib/util.js';
import {
  checkPassword, setSession, clearSession, setCustomerSession, clearCustomerSession, registerCustomer,
  loginLimiter, staffFrom, customerFrom, requireCustomer, ROLES, hashPassword,
} from '../lib/auth.js';
import { publicOrder } from '../lib/orders.js';
import { db } from '../lib/db.js';
import { config } from '../lib/config.js';
import { randomToken } from '../lib/util.js';
import { sendTemplate } from '../lib/mail.js';

db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)`);

// Ingreso único desde la tienda: el equipo va al panel y las clientas a "Mi cuenta".
export const auth = Router();

auth.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const staff = get('SELECT * FROM admin_users WHERE email = ?', email);
  if (staff && checkPassword(password, staff.password_hash)) {
    setSession(res, staff);
    return res.json({ type: 'staff', name: staff.name, role: staff.role, roleLabel: ROLES[staff.role], redirect: '/admin/' });
  }
  const c = get('SELECT * FROM customers WHERE email = ? AND password_hash IS NOT NULL', email);
  if (c && checkPassword(password, c.password_hash)) {
    setCustomerSession(res, c.id);
    return res.json({ type: 'customer', name: c.name });
  }
  throw new HttpError(401, 'El email o la contraseña no coinciden.');
});

auth.post('/register', loginLimiter, (req, res) => {
  const b = req.body || {};
  const id = registerCustomer({ name: b.name, email: b.email, password: b.password, phone: digits(b.phone), dni: digits(b.dni) });
  setCustomerSession(res, id);
  sendTemplate('account_welcome', String(b.email).toLowerCase().trim(), { name: String(b.name).trim() }).catch(() => {});
  res.json({ type: 'customer', name: String(b.name).trim() });
});

// Olvidé mi contraseña: siempre responde lo mismo, exista o no la cuenta.
auth.post('/forgot', loginLimiter, (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const staff = get('SELECT id, name FROM admin_users WHERE email = ?', email);
  const cust = staff ? null : get('SELECT id, name FROM customers WHERE email = ? AND password_hash IS NOT NULL', email);
  const who = staff || cust;
  if (who) {
    const token = randomToken(24);
    run(`INSERT INTO password_resets(token, kind, user_id, expires_at) VALUES(?,?,?, datetime('now','+1 hour'))`, token, staff ? 'staff' : 'customer', who.id);
    sendTemplate('password_reset', email, { name: who.name, links: { reset: `${config.publicUrl}/?reset=${token}` } }, { force: true }).catch(() => {});
  }
  res.json({ ok: true, message: 'Si hay una cuenta con ese email, te mandamos un link para elegir una nueva contraseña.' });
});
auth.post('/reset', loginLimiter, (req, res) => {
  const r = get(`SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')`, String(req.body?.token || ''));
  if (!r) throw new HttpError(400, 'El link venció o ya se usó. Pedí uno nuevo desde "Olvidé mi contraseña".');
  if (String(req.body?.password || '').length < 10) throw new HttpError(422, 'La contraseña necesita al menos 10 caracteres.');
  run(`UPDATE ${r.kind === 'staff' ? 'admin_users' : 'customers'} SET password_hash = ? WHERE id = ?`, hashPassword(req.body.password), r.user_id);
  run('UPDATE password_resets SET used = 1 WHERE token = ?', r.token);
  res.json({ ok: true });
});

auth.post('/logout', (req, res) => { clearSession(res); clearCustomerSession(res); res.json({ ok: true }); });

auth.get('/session', (req, res) => {
  const staff = staffFrom(req);
  const c = customerFrom(req);
  res.json({
    staff: staff ? { name: staff.name, email: staff.email, role: staff.role, roleLabel: ROLES[staff.role] } : null,
    customer: c ? { name: c.name, email: c.email, phone: c.phone, dni: c.dni } : null,
  });
});

// Mi cuenta
export const account = Router();
account.use(requireCustomer);
account.get('/orders', (req, res) => {
  const rows = all('SELECT * FROM orders WHERE customer_id = ? OR email = ? ORDER BY id DESC LIMIT 50', req.customer.id, req.customer.email);
  res.json({ orders: rows.map((o) => ({ ...publicOrder(o), token: o.token })) });
});
account.put('/me', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (name.length < 3) throw new HttpError(422, 'Escribí tu nombre y apellido.');
  run('UPDATE customers SET name = ?, phone = ?, dni = ? WHERE id = ?', name, digits(b.phone), digits(b.dni), req.customer.id);
  res.json({ ok: true });
});
account.post('/password', (req, res) => {
  const c = get('SELECT password_hash FROM customers WHERE id = ?', req.customer.id);
  if (!checkPassword(req.body?.current, c.password_hash)) throw new HttpError(400, 'La contraseña actual no coincide.');
  if (String(req.body?.next || '').length < 10) throw new HttpError(422, 'La nueva contraseña necesita al menos 10 caracteres.');
  run('UPDATE customers SET password_hash = ? WHERE id = ?', hashPassword(req.body.next), req.customer.id);
  res.json({ ok: true });
});
