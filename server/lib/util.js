import crypto from 'node:crypto';

export function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/['´’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

const SMALL = new Set(['y', 'de', 'del', 'la', 'el', 'con', 'en', 'a']);
export function titleCase(s) {
  return String(s || '').trim().toLowerCase().split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export const randomToken = (n = 24) => crypto.randomBytes(n).toString('base64url');

export const fmtARS = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''));
export const digits = (s) => String(s || '').replace(/\D/g, '');
