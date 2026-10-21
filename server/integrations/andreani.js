// Andreani · API REST (apis.andreani.com)
// Login: GET /login con Basic Auth → header x-authorization-token
// Cotizar: GET /v1/tarifas · Sucursales: GET /v2/sucursales · Alta: POST /v2/ordenes-de-envio
// Etiqueta: GET /v2/ordenes-de-envio/{numero}/etiquetas · Seguimiento: GET /v2/envios/{numero}/trazas
import { config } from '../lib/config.js';
import { makeLabelPdf } from '../lib/pdf.js';

const BASE = config.andreani.env === 'qa' ? 'https://apisqa.andreani.com' : 'https://apis.andreani.com';
let token = null, tokenAt = 0;

async function login() {
  if (token && Date.now() - tokenAt < 6 * 3600e3) return token;
  const basic = Buffer.from(`${config.andreani.user}:${config.andreani.password}`).toString('base64');
  const res = await fetch(`${BASE}/login`, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Andreani rechazó el usuario o la contraseña (HTTP ${res.status}). Revisá ANDREANI_USER y ANDREANI_PASSWORD.`);
  token = res.headers.get('x-authorization-token');
  if (!token) throw new Error('Andreani no devolvió el token de acceso.');
  tokenAt = Date.now();
  return token;
}

async function call(method, path, { body, raw } = {}) {
  const t = await login();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'x-authorization-token': t, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 401) { token = null; }
  if (raw) {
    if (!res.ok) throw new Error(`Andreani respondió HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data?.detail || data?.title || data?.message || (Array.isArray(data?.errors) ? data.errors.map((e) => e.message || e).join('; ') : '') || `HTTP ${res.status}`;
    throw new Error(`Andreani: ${detail}`);
  }
  return data;
}

// Arma la query como la espera Andreani: bultos[0][kilos]=1&bultos[0][volumen]=...
function qs(params) {
  const out = [];
  const add = (k, v) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((x, i) => add(`${k}[${i}]`, x));
    else if (typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => add(`${k}[${kk}]`, vv));
    else out.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  };
  Object.entries(params).forEach(([k, v]) => add(k, v));
  return out.join('&');
}

/** Suma el paquete del pedido a partir de las prendas. */
export function packageFor(items) {
  let kilos = 0, volumen = 0, valor = 0;
  for (const it of items) {
    const w = it.weight_kg || 0.5;
    const vol = (it.height_cm || 5) * (it.width_cm || 30) * (it.depth_cm || 30);
    kilos += w * it.qty;
    volumen += vol * it.qty;
    valor += it.unit_price * it.qty;
  }
  return { kilos: Math.max(0.1, Math.round(kilos * 100) / 100), volumen: Math.max(1000, Math.round(volumen)), valorDeclarado: Math.round(valor) };
}

// Tabla de prueba (sin credenciales): zonas por código postal. Solo para probar el flujo.
function mockQuote(cp, kind) {
  const n = Number(cp);
  let base = 9800; // interior
  if (n >= 1000 && n <= 1499) base = 6200; // CABA
  else if (n >= 1600 && n <= 1999) base = 7400; // GBA
  else if (n >= 9000) base = 14500; // Patagonia
  return kind === 'sucursal' ? Math.round(base * 0.78) : base;
}

/** Cotiza un envío. kind: "domicilio" | "sucursal". Devuelve { cost, days, mock } */
export async function quote({ cp, kind, items }) {
  const pkg = packageFor(items);
  if (config.andreani.mock) return { cost: mockQuote(cp, kind), days: kind === 'sucursal' ? '3 a 6 días hábiles' : '2 a 5 días hábiles', mock: true };
  const contrato = kind === 'sucursal' ? config.andreani.contratoSucursal : config.andreani.contratoDomicilio;
  if (!contrato) throw new Error(`Falta el contrato de Andreani para envío a ${kind}.`);
  const data = await call('GET', '/v1/tarifas?' + qs({
    cpDestino: cp, contrato, cliente: config.andreani.cliente,
    bultos: [{ volumen: pkg.volumen, kilos: pkg.kilos, valorDeclarado: pkg.valorDeclarado }],
  }));
  const total = Number(data?.tarifaConIva?.total ?? data?.tarifaConIVA?.total ?? data?.total);
  if (!Number.isFinite(total)) throw new Error('Andreani no devolvió una tarifa para ese código postal.');
  return { cost: Math.ceil(total), days: null, mock: false };
}

/** Sucursales Andreani cerca de un código postal. */
export async function branches(cp) {
  if (config.andreani.mock) {
    return [
      { id: 'MOCK-1', nombre: `Sucursal de prueba ${cp}`, direccion: 'Av. Siempre Viva 742', localidad: 'Ciudad', horario: 'Lun a vie 9 a 18' },
      { id: 'MOCK-2', nombre: `Punto de retiro de prueba ${cp}`, direccion: 'Calle Falsa 123', localidad: 'Ciudad', horario: 'Lun a sáb 10 a 20' },
    ];
  }
  const data = await call('GET', '/v2/sucursales?' + qs({ codigoPostal: cp, canal: 'B2C', seHaceAtencionAlCliente: true }));
  const list = Array.isArray(data) ? data : data?.sucursales || [];
  return list.slice(0, 12).map((s) => ({
    id: String(s.id ?? s.codigo ?? s.numero ?? ''),
    nombre: s.descripcion || s.nombre || 'Sucursal Andreani',
    direccion: [s.direccion?.calle, s.direccion?.numero].filter(Boolean).join(' '),
    localidad: s.direccion?.localidad || s.localidad || '',
    horario: Array.isArray(s.horarioDeAtencion) ? s.horarioDeAtencion.map((h) => `${h.dia || ''} ${h.desde || ''}-${h.hasta || ''}`).join(' · ') : '',
  }));
}

/** Da de alta la orden de envío en Andreani. Devuelve { numero, raw } */
export async function createShipment(order, items, shippingSettings) {
  const addr = JSON.parse(order.shipping_address || '{}');
  const pkg = packageFor(items);
  if (config.andreani.mock) return { numero: `MOCK${String(Date.now()).slice(-9)}`, mock: true };
  const sucursal = order.shipping_method === 'andreani_sucursal';
  const o = shippingSettings.origin, s = shippingSettings.sender;
  const body = {
    contrato: sucursal ? config.andreani.contratoSucursal : config.andreani.contratoDomicilio,
    origen: { postal: { codigoPostal: o.codigoPostal, calle: o.calle, numero: o.numero, localidad: o.localidad, region: o.region || '', pais: 'Argentina' } },
    destino: sucursal
      ? { sucursal: { id: order.shipping_branch } }
      : {
          postal: {
            codigoPostal: addr.cp, calle: addr.calle, numero: addr.numero, localidad: addr.localidad, region: addr.provincia || '', pais: 'Argentina',
            componentesDeDireccion: [
              addr.piso ? { meta: 'piso', contenido: addr.piso } : null,
              addr.depto ? { meta: 'departamento', contenido: addr.depto } : null,
              addr.referencia ? { meta: 'entreCalle', contenido: addr.referencia } : null,
            ].filter(Boolean),
          },
        },
    remitente: {
      nombreCompleto: s.nombreCompleto, email: s.email, documentoTipo: s.documentoTipo || 'CUIT', documentoNumero: s.documentoNumero,
      telefonos: s.telefono ? [{ tipo: 1, numero: s.telefono }] : [],
    },
    destinatario: [{
      nombreCompleto: order.name, email: order.email, documentoTipo: 'DNI', documentoNumero: order.dni,
      telefonos: order.phone ? [{ tipo: 1, numero: order.phone }] : [],
    }],
    productoAEntregar: 'Indumentaria',
    bultos: [{
      kilos: pkg.kilos, volumenCm: pkg.volumen, valorDeclaradoConImpuestos: pkg.valorDeclarado,
      referencias: [{ meta: 'idCliente', contenido: order.number }, { meta: 'detalle', contenido: `Pedido ${order.number}` }],
    }],
  };
  const data = await call('POST', '/v2/ordenes-de-envio', { body });
  const numero = data?.bultos?.[0]?.numeroDeEnvio || data?.numeroDeEnvio || data?.agrupadorDeBultos;
  if (!numero) throw new Error('Andreani creó la orden pero no devolvió el número de envío. Revisala en tu cuenta de Andreani.');
  return { numero: String(numero), raw: data };
}

/** Etiqueta en PDF (Buffer). */
export async function label(order) {
  if (config.andreani.mock || order.andreani_number.startsWith('MOCK')) {
    return makeLabelPdf(order);
  }
  return call('GET', `/v2/ordenes-de-envio/${encodeURIComponent(order.andreani_number)}/etiquetas`, { raw: true });
}

/** Eventos de seguimiento normalizados: [{ fecha, estado, sucursal }] */
export async function tracking(numero) {
  if (config.andreani.mock || numero.startsWith('MOCK')) {
    return [{ fecha: new Date().toISOString(), estado: 'Envío creado (prueba)', sucursal: '' }];
  }
  const data = await call('GET', `/v2/envios/${encodeURIComponent(numero)}/trazas`);
  const ev = data?.eventos || data || [];
  return (Array.isArray(ev) ? ev : []).map((e) => ({
    fecha: e.Fecha || e.fecha || '',
    estado: e.Estado || e.estado || e.Evento || '',
    sucursal: e.Sucursal || e.sucursal || '',
  }));
}

export const trackingUrl = (numero) => `https://www.andreani.com/#!/informacionEnvio/${encodeURIComponent(numero)}`;
