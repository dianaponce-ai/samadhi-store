// Probador con IA de Google Gemini (modelos de imagen, "Nano Banana").
// Recibe la foto de la clienta y la foto de la prenda y devuelve una foto nueva de la clienta con la prenda puesta.
// La foto viaja a Google sólo para generar la imagen; la tienda no la guarda. En el plan pago de la API,
// Google no usa el contenido para mejorar sus productos.
// Sin dependencias: lo usa el servidor de la tienda y también la función de Vercel de la demo (api/probador.js).

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash-image';
const RATIOS = [['1:1', 1], ['2:3', 2 / 3], ['3:2', 3 / 2], ['3:4', 3 / 4], ['4:3', 4 / 3], ['4:5', 4 / 5], ['5:4', 5 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9]];
const KIND_ES = { top: 'upper-body garment (top)', bottom: 'lower-body garment (bottom)', full: 'full-body garment (dress or one-piece)' };
const REPLACE = { top: 'their current top', bottom: 'their current trousers, skirt or shorts', full: 'their current outfit' };

/** Relación de aspecto soportada más cercana a la de la foto de la clienta. */
export function closestRatio(w, h) {
  const r = w / h;
  return RATIOS.reduce((best, x) => (Math.abs(Math.log(x[1] / r)) < Math.abs(Math.log(best[1] / r)) ? x : best))[0];
}

export function buildPrompt({ kind, name, flat }) {
  const k = KIND_ES[kind] || 'garment';
  return [
    `You are a virtual fitting room for a fashion store. Image 1 is a photo of a customer. Image 2 is the product photo of a ${k}${name ? ` called "${name}"` : ''}${flat ? ' shown on its own' : ', worn by a model'}.`,
    `Generate a photorealistic photo of the customer from image 1 wearing exactly the garment from image 2, replacing ${REPLACE[kind] || 'the corresponding clothing'}.`,
    'Keep everything else from image 1 unchanged: the same face and identity, hair, skin tone, body shape and proportions, pose, hands, background, lighting, camera framing, and the rest of their clothing and shoes.',
    'Reproduce the garment faithfully: same color, fabric, texture, print or pattern, buttons, neckline, sleeves, length and fit as in image 2, with natural folds and shadows that match the lighting of image 1.',
    'Do not include the model, background or any other item from image 2. Do not add text or logos. Return only the edited photo.',
  ].join(' ');
}

const b64 = (dataUri) => { const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(dataUri || ''); return m ? { mimeType: m[1], data: m[2] } : null; };

/**
 * person: data URI de la foto de la clienta. garment: { mimeType, data (base64) }.
 * Devuelve { image: data URI } o lanza un Error con .code ('sin-clave', 'bloqueada', 'sin-imagen', 'servicio').
 */
export async function geminiTryOn({ apiKey, model = GEMINI_DEFAULT_MODEL, person, personSize, garment, kind, name, flat, timeoutMs = 90000 }) {
  if (!apiKey) { const e = new Error('Falta la clave de Gemini.'); e.code = 'sin-clave'; throw e; }
  const p = b64(person);
  if (!p) { const e = new Error('Subí una foto tuya (JPG o PNG).'); e.code = 'foto'; throw e; }
  const body = {
    contents: [{ role: 'user', parts: [{ inlineData: p }, { inlineData: garment }, { text: buildPrompt({ kind, name, flat }) }] }],
    generationConfig: { responseModalities: ['IMAGE'], ...(personSize ? { imageConfig: { aspectRatio: closestRatio(personSize[0], personSize[1]) } } : {}) },
  };
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) { const e = new Error('No pudimos conectar con el probador. Probá de nuevo en un momento.'); e.code = 'servicio'; e.detail = err.message; throw e; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(r.status === 429 ? 'El probador está con mucha demanda. Probá en unos segundos.' : 'El probador no está disponible ahora. Probá más tarde.');
    e.code = r.status === 400 && /api key/i.test(d.error?.message || '') ? 'sin-clave' : 'servicio'; e.status = r.status; e.detail = d.error?.message; throw e;
  }
  const cand = d.candidates?.[0];
  const part = cand?.content?.parts?.find((x) => x.inlineData || x.inline_data);
  if (!part) {
    const blocked = d.promptFeedback?.blockReason || /SAFETY|PROHIBITED|IMAGE_SAFETY/.test(cand?.finishReason || '');
    const e = new Error(blocked ? 'La foto no pasó el control de contenido. Probá con otra foto, de cuerpo entero y con ropa.' : 'No pudimos generar la imagen. Probá con otra foto de cuerpo entero.');
    e.code = blocked ? 'bloqueada' : 'sin-imagen'; e.detail = cand?.finishReason || d.promptFeedback?.blockReason; throw e;
  }
  const img = part.inlineData || part.inline_data;
  return { image: `data:${img.mimeType || img.mime_type || 'image/png'};base64,${img.data}` };
}
