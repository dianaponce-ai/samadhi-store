import crypto from 'node:crypto';
import { config } from './config.js';
import { get, run } from './db.js';
import { HttpError, isEmail } from './util.js';

// Roles del panel. El gerente maneja la operación diaria; el administrador además la configuración.
export const ROLES = {
  admin: 'Administrador',
  manager: 'Gerente de tienda',
};

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hashHex, 'hex');
  return ref.length === hash.length && crypto.timingSafeEqual(ref, hash);
}
const checkLength = (pw) => { if (String(pw || '').length < 10) throw new HttpError(422, 'La contraseña necesita al menos 10 caracteres.'); };

export function createAdmin(email, password, name = '', role = 'admin') {
  checkLength(password);
  if (!ROLES[role]) throw new HttpError(422, 'Elegí un rol válido.');
  return run('INSERT INTO admin_users(email, name, password_hash, role) VALUES(?,?,?,?)', email.toLowerCase().trim(), name, hashPassword(password), role);
}

export function ensureFirstAdmin() {
  const n = get('SELECT COUNT(*) AS n FROM admin_users').n;
  if (n === 0 && config.adminEmail && config.adminPassword) {
    createAdmin(config.adminEmail, config.adminPassword, 'Administración', 'admin');
    console.log(`Usuario del panel creado: ${config.adminEmail}`);
  }
}

/** Cuenta de clienta: si ya compró como invitada, se le agrega la contraseña a la misma ficha. */
export function registerCustomer({ name, email, password, phone = '', dni = '' }) {
  email = String(email || '').toLowerCase().trim();
  if (String(name || '').trim().length < 3) throw new HttpError(422, 'Escribí tu nombre y apellido.', { errors: { name: 'Escribí tu nombre y apellido.' } });
  if (!isEmail(email)) throw new HttpError(422, 'Revisá el email.', { errors: { email: 'Revisá el email.' } });
  checkLength(password);
  const ex = get('SELECT id, password_hash FROM customers WHERE email = ?', email);
  if (ex?.password_hash) throw new HttpError(409, 'Ya hay una cuenta con ese email. Ingresá con tu contraseña.');
  if (ex) {
    run('UPDATE customers SET name = ?, password_hash = ?, phone = COALESCE(NULLIF(?, \'\'), phone), dni = COALESCE(NULLIF(?, \'\'), dni) WHERE id = ?', name.trim(), hashPassword(password), phone, dni, ex.id);
    return ex.id;
  }
  return Number(run('INSERT INTO customers(email, name, phone, dni, password_hash) VALUES(?,?,?,?,?)', email, name.trim(), phone, dni, hashPassword(password)).lastInsertRowid);
}

// ── Sesiones firmadas en cookies ─────────────────────────
const STAFF = 'samadhi_admin';
const CUSTOMER = 'samadhi_cliente';
const STAFF_AGE = 12 * 3600;
const CUSTOMER_AGE = 30 * 24 * 3600;

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (p.exp < Date.now() / 1000) return null;
  return p;
}
function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
function cookie(res, name, value, maxAge) {
  const secure = config.publicUrl.startsWith('https://') ? '; Secure' : '';
  res.append('Set-Cookie', `${name}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export const setSession = (res, user) => cookie(res, STAFF, sign({ uid: user.id, exp: Math.floor(Date.now() / 1000) + STAFF_AGE }), STAFF_AGE);
export const clearSession = (res) => cookie(res, STAFF, '', 0);
export const setCustomerSession = (res, id) => cookie(res, CUSTOMER, sign({ cid: id, exp: Math.floor(Date.now() / 1000) + CUSTOMER_AGE }), CUSTOMER_AGE);
export const clearCustomerSession = (res) => cookie(res, CUSTOMER, '', 0);

export function staffFrom(req) {
  const p = verify(readCookie(req, STAFF));
  return p ? get('SELECT id, email, name, role FROM admin_users WHERE id = ?', p.uid) : null;
}
export function customerFrom(req) {
  const p = verify(readCookie(req, CUSTOMER));
  return p ? get('SELECT id, email, name, phone, dni FROM customers WHERE id = ? AND password_hash IS NOT NULL', p.cid) : null;
}

export function requireAdmin(req, res, next) {
  const user = staffFrom(req);
  if (!user) return res.status(401).json({ error: 'Tu sesión venció. Volvé a entrar.' });
  // Protección CSRF: el panel siempre manda un header propio en lo que modifica datos.
  if (!['GET', 'HEAD'].includes(req.method) && req.get('x-samadhi-admin') !== '1') return res.status(403).json({ error: 'Pedido rechazado.' });
  req.admin = user;
  next();
}
/** Solo para el rol indicado (por ejemplo, configuración y usuarios solo para administración). */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.admin?.role) ? next() : res.status(403).json({ error: 'Tu usuario no tiene permiso para esta sección. Pedíselo a quien administra la tienda.' });

export function requireCustomer(req, res, next) {
  const c = customerFrom(req);
  if (!c) return res.status(401).json({ error: 'Ingresá a tu cuenta para ver esto.' });
  if (!['GET', 'HEAD'].includes(req.method) && !String(req.get('content-type') || '').includes('application/json')) return res.status(403).json({ error: 'Pedido rechazado.' });
  req.customer = c;
  next();
}

// Límite simple de intentos de ingreso por IP.
const attempts = new Map();
export function loginLimiter(req, res, next) {
  const now = Date.now();
  const a = (attempts.get(req.ip) || []).filter((t) => now - t < 15 * 60e3);
  if (a.length >= 10) return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.' });
  a.push(now);
  attempts.set(req.ip, a);
  // Sólo cuentan los intentos fallidos.
  res.on('finish', () => { if (res.statusCode < 300) attempts.set(req.ip, (attempts.get(req.ip) || []).filter((t) => t !== now)); });
  next();
}
