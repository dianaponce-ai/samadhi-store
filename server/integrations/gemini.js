// Probador con IA de Google Gemini (modelos de imagen, "Nano Banana").
// Recibe la foto de la clienta y la foto de la prenda y devuelve una foto nueva de la clienta con la prenda puesta.
// La foto viaja a Google sólo para generar la imagen; la tienda no la guarda. En el plan pago de la API,
// Google no usa el contenido para mejorar sus productos.
// Sin dependencias: lo usa el servidor de la tienda y también la función de Vercel de la demo (api/probador.js).

// Modelo preferido y alternativas, en orden. Si uno no existe para la clave (Google los renueva), pasa al siguiente.
export const GEMINI_DEFAULT_MODEL = 'gemini-3.1-flash-image';
const MODEL_CHAIN = ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'];
let resolvedModel = null; // el que funcionó la última vez (por instancia), para no repetir los 404

const RATIOS = [['1:1', 1], ['2:3', 2 / 3], ['3:2', 3 / 2], ['3:4', 3 / 4], ['4:3', 4 / 3], ['4:5', 4 / 5], ['5:4', 5 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9]];
export const KINDS = ['top', 'bottom', 'full', 'set', 'outer'];
const KIND_EN = {
  top: 'top (blouse, shirt, t-shirt, tank top or sweater)',
  bottom: 'bottom (trousers, jeans, shorts or skirt)',
  full: 'one-piece dress or jumpsuit',
  set: 'two-piece set (matching top and bottom sold together)',
  outer: 'outer layer (jacket, blazer, vest, cardigan or coat)',
};
// Qué se saca y qué se deja de la ropa de la clienta, según el tipo de prenda.
// Los modelos de imagen siguen mejor una descripción de cómo tiene que quedar la foto final que una lista de prohibiciones.
const SWAP = {
  top: 'Change only the upper body: the customer now wears this top instead of her current top, tucked or untucked as it is worn in the product photos. Her current trousers, skirt or shorts and her shoes stay exactly as they are.',
  bottom: 'Change only the lower body: the customer now wears this bottom instead of her current trousers, skirt or shorts, with the same length, rise and leg shape as in the product photos. Her current top and her shoes stay exactly as they are.',
  full: 'This is a complete outfit change. In the final photo the customer wears ONLY this dress or jumpsuit plus her own shoes. It covers her from its neckline down to its own hemline, at the same height on her body as on the model in the product photos (for example, if it ends mid-thigh on the model, it ends mid-thigh on her). If it is a dress, her bare legs are visible from the hemline down to her shoes. Her original top and her original trousers or skirt no longer exist in the photo.',
  set: 'This is a complete outfit change. The customer now wears BOTH pieces of the set from the product photos: its top replaces her current top and its bottom replaces her current trousers, skirt or shorts. Only her shoes stay as they are.',
  outer: 'Add this outer layer on top of what she is wearing: she now wears it over her current clothes, open or closed exactly as it is worn in the product photos, with the same length and sleeve length. Where it is open, her current top stays visible underneath. Her trousers, skirt or shorts and her shoes stay exactly as they are.',
};
const FINAL_CHECK = {
  full: 'Before answering, check the result: if any part of her original trousers, shirt, collar or sleeves is still visible, redraw it so that only the dress or jumpsuit, her skin and her shoes remain.',
  set: 'Before answering, check that neither her original top nor her original trousers, skirt or shorts are visible anywhere, and that both pieces of the set are there.',
  top: 'Before answering, check that her original top is no longer visible anywhere and that the new top looks exactly like the one in the product photos.',
  bottom: 'Before answering, check that her original trousers, skirt or shorts are no longer visible anywhere and that the new bottom looks exactly like the one in the product photos.',
  outer: 'Before answering, check that the outer layer looks exactly like the one in the product photos (color, fabric, length, collar, buttons) and that it sits over her clothes.',
};

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Orden de prioridad: conjunto > vestido/mono > abrigo > parte de arriba > parte de abajo.
const RULES = [
  ['set', /\b(conjunto|set|pijama|pyjama|twin ?set|bikini|tankini)\b/],
  ['full', /\b(vestid\w*|mono|monos|enterit\w*|jumpsuit|solero|tunica|kaftan|caftan|maxi ?dress)\b/],
  ['outer', /\b(saco|sacos|blazer\w*|chaleco\w*|campera\w*|cardigan\w*|kimono\w*|tapado\w*|chaqueta\w*|piloto|trench|sobretodo|poncho|ruana|chal|capa)\b/],
  ['top', /\b(blusa\w*|camisa\w*|remera\w*|musculosa\w*|sweater\w*|sueter\w*|top|tops|body|bodys|buzo\w*|polera\w*|camisola|crop|corset|bustier|chomba\w*)\b/],
  ['bottom', /\b(jeans?|pantal\w*|shorts?|falda\w*|pollera\w*|wide ?leg|bermuda\w*|jogger\w*|calzas?|oxford|palazzo\w*|cargo|mom|baggy|babucha\w*|culotte\w*)\b/],
];
/** Adivina el tipo de prenda por el nombre (primero) y las categorías. Devuelve null si no hay pistas. */
export function guessKind(name, categories = []) {
  for (const text of [norm(name), norm([].concat(categories).join(' '))]) {
    for (const [kind, re] of RULES) if (re.test(text)) return kind;
  }
  return null;
}
/**
 * Tipo final para Gemini. Conjuntos y abrigos ganan siempre (el recorte del motor propio sólo conoce top/bottom/full);
 * si no, manda el tipo guardado (puede estar corregido a mano en el panel) y, si no hay, lo que se adivina.
 */
export function resolveKind(stored, name, categories) {
  const g = guessKind(name, categories);
  if (g === 'set' || g === 'outer') return g;
  if (KINDS.includes(stored)) return stored;
  return g || 'top';
}

/** Relación de aspecto soportada más cercana a la de la foto de la clienta. */
export function closestRatio(w, h) {
  const r = w / h;
  return RATIOS.reduce((best, x) => (Math.abs(Math.log(x[1] / r)) < Math.abs(Math.log(best[1] / r)) ? x : best))[0];
}

export function buildPrompt({ kind, name, count = 1 }) {
  const k = KIND_EN[kind] || 'garment';
  const imgs = count > 1 ? `Images 2 to ${count + 1} are photos of the same product` : 'Image 2 is a photo of the product';
  return [
    `You are a virtual fitting room for a fashion store. Image 1 is a photo of a customer. ${imgs}: a ${k}${name ? ` called "${name}"` : ''}.`,
    count > 1 ? 'Some product photos may show it worn by a model and others on its own (on a hanger, laid flat or in close-up). Use the photos on a model to judge exactly where it ends on the body (length), how long the sleeves are and how it is worn; use the other photos for color, fabric and details.' : '',
    `If a model wears the product, she may also wear other items: the product is ONLY the ${k}; ignore every other item she wears.`,
    'Edit image 1 so that the customer is wearing exactly that product.',
    SWAP[kind] || 'Replace the corresponding clothing of the customer with this garment.',
    'Reproduce the garment faithfully: same color, fabric, texture, print or pattern, buttons, neckline, sleeves (shape and length), silhouette and total length as in the product photos, adapted naturally to the customer\'s body, with folds and shadows that match the lighting of image 1. Keep the same length relative to the body (for example, mid-thigh on the model means mid-thigh on her, not below the knee).',
    'Keep the customer exactly the same: same face and identity, hair, skin tone, body shape and proportions, pose, hands, background, lighting and camera framing.',
    'From the product photos take only the product: not the other model, her body, her other clothes, shoes, accessories, hanger or background. Do not add text or logos.',
    FINAL_CHECK[kind] || '',
    'Return only the edited photo.',
  ].filter(Boolean).join(' ');
}

const b64 = (dataUri) => { const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(dataUri || ''); return m ? { mimeType: m[1], data: m[2] } : null; };

/**
 * person: data URI de la foto de la clienta. garments: [{ mimeType, data (base64) }] (todas las fotos del producto; garment, una sola, también sirve).
 * Devuelve { image: data URI, model } o lanza un Error con .code ('sin-clave', 'bloqueada', 'sin-imagen', 'servicio').
 */
export async function geminiTryOn({ apiKey, model, person, personSize, garment, garments, kind, name, timeoutMs = 90000 }) {
  const prod = (Array.isArray(garments) && garments.length ? garments : [garment]).filter(Boolean).slice(0, 3);
  if (!apiKey) { const e = new Error('Falta la clave de Gemini.'); e.code = 'sin-clave'; throw e; }
  const p = b64(person);
  if (!p) { const e = new Error('Subí una foto tuya (JPG o PNG).'); e.code = 'foto'; throw e; }
  const body = {
    contents: [{ role: 'user', parts: [{ text: 'Image 1 (customer):' }, { inlineData: p }, ...prod.flatMap((g, i) => [{ text: `Image ${i + 2} (product):` }, { inlineData: g }]), { text: buildPrompt({ kind, name, count: prod.length }) }] }],
    generationConfig: { responseModalities: ['IMAGE'], ...(personSize ? { imageConfig: { aspectRatio: closestRatio(personSize[0], personSize[1]) } } : {}) },
  };
  const deadline = Date.now() + timeoutMs;
  const call = (m) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(5000, deadline - Date.now())),
  });
  // Orden de prueba: el que ya funcionó, el configurado y la cadena de alternativas (sin repetir).
  const chain = [...new Set([resolvedModel, model, ...MODEL_CHAIN].filter(Boolean))];
  const missing = (res, d) => res.status === 404 || (res.status === 400 && /not found|not supported|unknown model|is not available/i.test(d.error?.message || ''));
  let r, d = {}, used = null;
  try {
    for (const m of chain) {
      r = await call(m); d = await r.json().catch(() => ({}));
      if (!missing(r, d)) { used = m; break; }
    }
    // Ninguno de la lista existe para esta clave: busca el modelo de imagen disponible y reintenta una vez.
    if (!used) {
      const alt = await pickImageModel(apiKey);
      if (alt && !chain.includes(alt)) { r = await call(alt); d = await r.json().catch(() => ({})); used = alt; }
    }
  } catch (err) {
    const late = err.name === 'TimeoutError' || err.name === 'AbortError';
    const e = new Error(late ? 'El probador tardó demasiado. Probá de nuevo en un momento.' : 'No pudimos conectar con el probador. Probá de nuevo en un momento.');
    e.code = 'servicio'; e.detail = err.message; throw e;
  }
  if (!r.ok) {
    const msg = d.error?.message || '';
    const noCredit = r.status === 402 || /prepayment|credits are depleted|billing account/i.test(msg);
    const keyProblem = !noCredit && (r.status === 401 || r.status === 403 || /api key|API_KEY|permission/i.test(msg));
    const e = new Error(noCredit ? 'La cuenta de Google (Gemini) se quedó sin saldo. Cargá crédito en Google AI Studio.' : r.status === 429 ? 'El probador está con mucha demanda. Probá en unos segundos.' : keyProblem ? 'La clave de Gemini no es válida o no tiene permiso para generar imágenes.' : 'El probador no está disponible ahora. Probá más tarde.');
    e.code = noCredit ? 'saldo' : keyProblem ? 'clave' : 'servicio'; e.status = r.status; e.detail = `${used || chain.at(-1)} · ${r.status} ${d.error?.status || ''} ${msg}`.trim().slice(0, 300); throw e;
  }
  resolvedModel = used;
  const cand = d.candidates?.[0];
  const part = cand?.content?.parts?.find((x) => x.inlineData || x.inline_data);
  if (!part) {
    const blocked = d.promptFeedback?.blockReason || /SAFETY|PROHIBITED|IMAGE_SAFETY/.test(cand?.finishReason || '');
    const e = new Error(blocked ? 'La foto no pasó el control de contenido. Probá con otra foto, de cuerpo entero y con ropa.' : 'No pudimos generar la imagen. Probá con otra foto de cuerpo entero.');
    e.code = blocked ? 'bloqueada' : 'sin-imagen'; e.detail = `${used} · ${cand?.finishReason || d.promptFeedback?.blockReason || ''}`; throw e;
  }
  const img = part.inlineData || part.inline_data;
  return { image: `data:${img.mimeType || img.mime_type || 'image/png'};base64,${img.data}`, model: used };
}

/** Busca entre los modelos de la cuenta uno que genere imágenes (por si los nombres de la lista cambiaron). */
export async function pickImageModel(apiKey) {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    const names = (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /image/i.test(m.name) && !/imagen/i.test(m.name)).map((m) => m.name.replace(/^models\//, ''));
    const score = (n) => (/flash/.test(n) ? 2 : 0) + (/preview/.test(n) ? 0 : 1) + (Number((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]) || 0) / 10;
    return names.sort((a, b) => score(b) - score(a))[0] || null;
  } catch { return null; }
}
