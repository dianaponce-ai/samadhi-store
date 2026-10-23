import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

export const config = {
  port: Number(env('PORT', '3000')),
  publicUrl: env('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, ''),
  production: env('NODE_ENV') === 'production',
  dataDir: env('DATA_DIR', path.join(ROOT, 'data')),
  sessionSecret: env('SESSION_SECRET') || null,
  adminEmail: env('ADMIN_EMAIL'),
  adminPassword: env('ADMIN_PASSWORD'),
  mp: {
    accessToken: env('MP_ACCESS_TOKEN'),
    webhookSecret: env('MP_WEBHOOK_SECRET'),
  },
  andreani: {
    user: env('ANDREANI_USER'),
    password: env('ANDREANI_PASSWORD'),
    cliente: env('ANDREANI_CLIENTE'),
    contratoDomicilio: env('ANDREANI_CONTRATO_DOMICILIO'),
    contratoSucursal: env('ANDREANI_CONTRATO_SUCURSAL'),
    env: env('ANDREANI_ENV', 'prod'),
  },
  lince: {
    // Dragonfish (el sistema de Zoo Logic que usa Lince). Ver README → "Conectar Lince".
    url: env('DRAGONFISH_URL').replace(/\/$/, ''),
    clientId: env('DRAGONFISH_ID_CLIENTE'),
    token: env('DRAGONFISH_TOKEN'),
    stockPath: env('DRAGONFISH_STOCK_PATH', 'ConsultaStockYPrecios'),
    syncSecret: env('LINCE_SYNC_SECRET'),
  },
  gemini: {
    // Probador con IA de Google (Gemini, modelos de imagen). Clave de Google AI Studio.
    apiKey: env('GEMINI_API_KEY'),
    model: env('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image'),
  },
  fashn: {
    // Probador virtual con IA (https://fashn.ai). Sin clave queda en modo prueba.
    apiKey: env('FASHN_API_KEY'),
  },
  google: {
    // Reseñas de la ficha de Google: clave de Places API y Place ID del local.
    placesKey: env('GOOGLE_PLACES_API_KEY'),
    placeId: env('GOOGLE_PLACE_ID'),
  },
  mail: {
    smtpUrl: env('SMTP_URL'),
    from: env('MAIL_FROM', 'Samadhi Style <hola@samadhistyle.com.ar>'),
    storeNotify: env('STORE_NOTIFY_EMAIL'),
  },
};

config.mp.mock = !config.mp.accessToken;
config.lince.mode = config.lince.url && config.lince.token ? 'directo' : config.lince.syncSecret ? 'agente' : 'prueba';
config.andreani.mock = !(config.andreani.user && config.andreani.password && config.andreani.cliente);

if (!config.sessionSecret) {
  // Sin clave fija, las sesiones del panel se pierden al reiniciar. Sirve para probar en tu compu.
  config.sessionSecret = crypto.randomBytes(32).toString('hex');
  config.ephemeralSecret = true;
}
