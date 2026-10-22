// Segmentación de prendas: modelo u2net_cloth_seg (proyecto rembg / cloth-segmentation, licencia MIT).
// Separa en la foto del producto la ropa de arriba, la de abajo y las prendas enteras, píxel por píxel.
// Es opcional: necesita `npm run probador:instalar` (onnxruntime-node, sharp y el modelo, unos 180 MB).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const MODEL = path.join(config.dataDir, 'modelos', 'u2net_cloth_seg.onnx');
let session = null, ort = null, sharp = null;

export async function available() {
  if (!existsSync(MODEL)) return false;
  try { ort ||= await import('onnxruntime-node'); sharp ||= (await import('sharp')).default; return true; } catch { return false; }
}
async function load() {
  if (!(await available())) throw new Error('El recorte automático no está instalado. Corré npm run probador:instalar en el servidor.');
  session ||= await ort.InferenceSession.create(MODEL, { executionProviders: ['cpu'] });
  return session;
}

/**
 * Devuelve la máscara (PNG en escala de grises, del tamaño de la foto) de la prenda del tipo pedido.
 * kind: 'top' | 'bottom' | 'full'.
 */
export async function garmentMask(buffer, kind) {
  const s = await load();
  const meta = await sharp(buffer).metadata();
  const W = meta.width, H = meta.height, N = 768;
  const raw = await sharp(buffer).removeAlpha().resize(N, N, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  let max = 1e-6; for (const v of raw) if (v > max) max = v;
  const x = new Float32Array(3 * N * N);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) x[c * N * N + i] = (raw[i * 3 + c] / max - 0.5) / 0.5;
  const out = await s.run({ input: new ort.Tensor('float32', x, [1, 3, N, N]) });
  const o = out.output.data; // 1×4×N×N
  const prob = (k, i) => { let m = -Infinity; for (let c = 0; c < 4; c++) m = Math.max(m, o[c * N * N + i]); let sum = 0; for (let c = 0; c < 4; c++) sum += Math.exp(o[c * N * N + i] - m); return Math.exp(o[k * N * N + i] - m) / sum; };
  // Clases: 1 arriba, 2 abajo, 3 entera. Para una prenda entera se suman las tres si el modelo la partió en dos.
  const area = [0, 0, 0, 0];
  for (let i = 0; i < N * N; i++) { let best = 0, bv = -Infinity; for (let c = 0; c < 4; c++) if (o[c * N * N + i] > bv) { bv = o[c * N * N + i]; best = c; } area[best]++; }
  let classes = kind === 'top' ? [1] : kind === 'bottom' ? [2] : [3];
  if (kind === 'full' && area[3] < (area[1] + area[2]) * 0.6) classes = [1, 2, 3];
  if (kind === 'top' && area[1] < area[3] * 0.3) classes = [1, 3]; // túnicas y kimonos que el modelo toma como prenda entera
  const m = Buffer.alloc(N * N);
  for (let i = 0; i < N * N; i++) { let p = 0; for (const k of classes) p += prob(k, i); m[i] = Math.round(Math.min(1, p) * 255); }
  const png = await sharp(m, { raw: { width: N, height: N, channels: 1 } }).resize(W, H, { fit: 'fill', kernel: 'cubic' }).png().toBuffer();
  return { png, W, H, area: area.map((a) => a / (N * N)), classes };
}
