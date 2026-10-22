// Probador Samadhi: motor propio, corre entero en el navegador (la foto nunca sale del dispositivo).
//
// 1. Detecta el cuerpo con MediaPipe Pose (33 puntos + silueta), servido desde /vendor/mediapipe-pose.
// 2. "Prepara" cada prenda a partir de la foto del producto: recorta la silueta de la modelo, se queda con
//    la zona de la prenda según su tipo (arriba, abajo o entera) y saca cabeza, manos y piel.
// 3. Calza la prenda sobre la foto de la clienta deformándola con una malla (thin-plate spline) que lleva
//    hombros, codos, cadera, rodillas y tobillos de la modelo a los de la clienta.
//
// Sin dependencias: lo usan la tienda, el panel y el script que prepara el catálogo.

const L = { nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8, mouthL: 9, mouthR: 10, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, hipL: 23, hipR: 24, knL: 25, knR: 26, anL: 27, anR: 28, heelL: 29, heelR: 30, toeL: 31, toeR: 32 };
export const KINDS = { top: 'Parte de arriba', bottom: 'Parte de abajo', full: 'Prenda entera' };

/** Prendas cortas de abajo (se recorta el ruedo donde empieza la pierna). */
export const isShort = (text) => /short|falda|pollera|bermuda|mini/i.test(String(text || ''));
/** Tipo de prenda según su categoría o nombre. */
export function kindFor(text) {
  const t = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/vestid|enterit|mono|jumpsuit|tunica|kimono|solero/.test(t)) return 'full';
  if (/jean|pantal|short|falda|pollera|wide ?leg|oxford|baggy|cargo|jogger|calza|bermuda|mom\b/.test(t)) return 'bottom';
  if (/blusa|camis|remer|musculosa|top|sweater|buzo|saco|chaleco|campera|chaqueta|blazer|cardigan|sueter|body|crop|tejid|polera|chomb|kimono/.test(t)) return 'top';
  return null;
}

// ── MediaPipe Pose ────────────────────────────────────────
let posePromise = null;
let queue = Promise.resolve();
export function loadPose(base = (typeof window !== 'undefined' && window.__PROBADOR_BASE) || '/vendor/mediapipe-pose/') {
  if (posePromise) return posePromise;
  posePromise = new Promise((ok, bad) => {
    const go = () => {
      try {
        const pose = new window.Pose({ locateFile: (f) => base + f });
        pose.setOptions({ modelComplexity: 1, smoothLandmarks: false, enableSegmentation: true, smoothSegmentation: false, minDetectionConfidence: 0.4, minTrackingConfidence: 0.4 });
        ok(pose);
      } catch (e) { bad(e); }
    };
    if (window.Pose) return go();
    const s = document.createElement('script');
    s.src = base + 'pose.js'; s.crossOrigin = 'anonymous';
    s.onload = go; s.onerror = () => bad(new Error('No pudimos cargar el probador. Revisá tu conexión.'));
    document.head.appendChild(s);
  });
  return posePromise;
}

/** Corre la detección sobre una imagen/canvas/video. Devuelve puntos en píxeles y la silueta como canvas. */
export async function detect(source, { complexity = 1, video = false, mask = true } = {}) {
  const pose = await loadPose();
  const run = async () => {
    const mode = `${complexity}:${video ? 'v' : 'i'}`;
    if (pose.__mode !== mode) { pose.setOptions({ modelComplexity: complexity, enableSegmentation: true, smoothLandmarks: video }); pose.reset?.(); pose.__mode = mode; }
    const res = await new Promise((ok, bad) => {
      pose.onResults(ok);
      pose.send({ image: source }).catch(bad);
    });
    const W = source.videoWidth || source.naturalWidth || source.width, H = source.videoHeight || source.naturalHeight || source.height;
    if (!res.poseLandmarks) return { W, H, lm: null, mask: null };
    const lm = res.poseLandmarks.map((p) => ({ x: p.x * W, y: p.y * H, v: p.visibility ?? 1 }));
    let m = null;
    if (mask && res.segmentationMask) {
      m = document.createElement('canvas'); m.width = W; m.height = H;
      m.getContext('2d').drawImage(res.segmentationMask, 0, 0, W, H);
    }
    return { W, H, lm, mask: m };
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// ── Utilidades geométricas ────────────────────────────────
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (a, v, k = 1) => ({ x: a.x + v.x * k, y: a.y + v.y * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const norm = (v) => { const n = Math.hypot(v.x, v.y) || 1; return { x: v.x / n, y: v.y / n }; };
const perp = (v) => ({ x: -v.y, y: v.x });

/** Completa puntos poco visibles (por ejemplo, tobillos fuera de cuadro) a partir del resto del cuerpo. */
function fillLandmarks(lm) {
  const p = lm.map((x) => ({ ...x }));
  const ok = (i) => p[i] && p[i].v > 0.35;
  const torso = dist(mid(p[L.shL], p[L.shR]), mid(p[L.hipL], p[L.hipR]));
  for (const [hip, kn, an] of [[L.hipL, L.knL, L.anL], [L.hipR, L.knR, L.anR]]) {
    if (!ok(kn)) p[kn] = { ...add(p[hip], { x: 0, y: torso * 0.95 }), v: 0.2, guessed: true };
    if (!ok(an)) p[an] = { ...add(p[kn], norm(sub(p[kn], p[hip])), torso * 0.95), v: 0.2, guessed: true };
  }
  for (const [sh, el, wr] of [[L.shL, L.elL, L.wrL], [L.shR, L.elR, L.wrR]]) {
    if (!ok(el)) p[el] = { ...add(p[sh], { x: 0, y: torso * 0.6 }), v: 0.2, guessed: true };
    if (!ok(wr)) p[wr] = { ...add(p[el], norm(sub(p[el], p[sh])), torso * 0.55), v: 0.2, guessed: true };
  }
  return p;
}

/** Puntos de control para cada tipo de prenda (los mismos en la modelo y en la clienta). */
function controlPoints(lm0, kind) {
  const lm = fillLandmarks(lm0);
  const shL = lm[L.shL], shR = lm[L.shR], hipL = lm[L.hipL], hipR = lm[L.hipR];
  const shM = mid(shL, shR), hipM = mid(hipL, hipR);
  const down = norm(sub(hipM, shM)), side = perp(down);
  const shW = dist(shL, shR), torso = dist(shM, hipM);
  const neck = add(shM, down, -torso * 0.12);
  const pts = [];
  const push = (q, name) => pts.push({ x: q.x, y: q.y, name });
  if (kind === 'top' || kind === 'full') {
    push(neck, 'neck'); push(shL, 'shL'); push(shR, 'shR');
    push(lerp(shL, hipL, 0.5), 'ribL'); push(lerp(shR, hipR, 0.5), 'ribR');
    push(lm[L.elL], 'elL'); push(lm[L.elR], 'elR');
    push(lerp(lm[L.elL], lm[L.wrL], 0.6), 'faL'); push(lerp(lm[L.elR], lm[L.wrR], 0.6), 'faR');
  }
  push(hipL, 'hipL'); push(hipR, 'hipR'); push(hipM, 'hipM');
  if (kind === 'bottom' || kind === 'full') {
    push(add(hipM, down, -torso * 0.12), 'waist');
    push(lm[L.knL], 'knL'); push(lm[L.knR], 'knR'); push(mid(lm[L.knL], lm[L.knR]), 'knM');
    push(lm[L.anL], 'anL'); push(lm[L.anR], 'anR');
  }
  if (kind === 'top') { push(add(hipM, down, torso * 0.35), 'hem'); push(add(add(hipM, down, torso * 0.35), side, shW * 0.6), 'hemL'); push(add(add(hipM, down, torso * 0.35), side, -shW * 0.6), 'hemR'); }
  return { pts, shW, torso, down, side, shM, hipM, lm };
}

// ── Preparar la prenda a partir de la foto del producto ───
function rgb2ycc(r, g, b) { return [0.299 * r + 0.587 * g + 0.114 * b, 128 + (-0.168736 * r - 0.331264 * g + 0.5 * b), 128 + (0.5 * r - 0.418688 * g - 0.081312 * b)]; }
/** Color de piel promedio (mejillas y entrecejo), en YCbCr. */
function skinColor(px, lm, W, H) {
  const samples = [];
  const fr = Math.max(4, dist(lm[L.earL], lm[L.earR]) * 0.12);
  for (const q of [lerp(lm[L.nose], lm[L.earL], 0.35), lerp(lm[L.nose], lm[L.earR], 0.35), lerp(lm[L.eyeL], lm[L.eyeR], 0.5)]) {
    for (let dy = -fr; dy <= fr; dy += 2) for (let dx = -fr; dx <= fr; dx += 2) {
      const x = Math.round(q.x + dx), y = Math.round(q.y + dy); if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4; samples.push(rgb2ycc(px[i], px[i + 1], px[i + 2]));
    }
  }
  samples.sort((a, b) => a[0] - b[0]);
  const core = samples.slice(Math.floor(samples.length * 0.2), Math.ceil(samples.length * 0.8));
  return core.reduce((a, s) => [a[0] + s[0] / core.length, a[1] + s[1] / core.length, a[2] + s[2] / core.length], [0, 0, 0]);
}
const isSkin = (c, skin, loose = 1) => Math.hypot(c[1] - skin[1], c[2] - skin[2]) < 7 * loose && Math.abs(c[0] - skin[0]) < 48 * loose;

/**
 * Devuelve { canvas (prenda con transparencia), pts (puntos de control en el recorte), kind, quality } o null.
 * image: HTMLImageElement ya cargada. kind: 'top' | 'bottom' | 'full'.
 */
export async function prepareGarment(image, kind, opts = {}) {
  const d = await detect(image, { complexity: 1 });
  if (!d.lm) return null;
  const { W, H, mask } = d;
  const lm = fillLandmarks(d.lm);
  const cp = controlPoints(d.lm, kind);
  const { shW, torso, down, shM, hipM } = cp;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H), px = img.data;
  const m = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;

  const face = null;
  const skin = skinColor(px, lm, W, H);
  void face;
  // Color de pelo: arriba de la frente. Se usa para sacar el pelo largo que cae sobre la prenda.
  const hairS = [];
  const eyeM = mid(lm[L.eyeL], lm[L.eyeR]), up = sub(eyeM, lm[L.nose]), ew = dist(lm[L.earL], lm[L.earR]);
  for (const k of [1.6, 2.2]) for (const sx of [-0.25, 0, 0.25]) {
    const q = add(add(eyeM, up, k), { x: ew, y: 0 }, sx);
    for (let dy = -3; dy <= 3; dy += 2) for (let dx = -3; dx <= 3; dx += 2) {
      const x = Math.round(q.x + dx), y = Math.round(q.y + dy); if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4; if (m[i] + m[i + 3] < 200) continue; hairS.push(rgb2ycc(px[i], px[i + 1], px[i + 2]));
    }
  }
  const hair = hairS.length > 6 ? hairS.reduce((a, s) => [a[0] + s[0] / hairS.length, a[1] + s[1] / hairS.length, a[2] + s[2] / hairS.length], [0, 0, 0]) : null;

  // Zona de la prenda según el tipo (en coordenadas del eje del cuerpo).
  const along = (q) => (q.x - shM.x) * down.x + (q.y - shM.y) * down.y; // 0 en hombros, +torso en cadera
  const ankleY = Math.max(along(lm[L.anL]), along(lm[L.anR]));
  const kneeY = Math.max(along(lm[L.knL]), along(lm[L.knR]));
  const range = kind === 'top' ? [-torso * 0.2, torso * 1.45] : kind === 'bottom' ? [torso * 0.82, ankleY + torso * 0.03] : [-torso * 0.2, ankleY + torso * 0.03];
  // Dónde termina la prenda: buscamos el cambio de color entre la prenda y lo que lleva abajo (o arriba).
  const sideOf = (q) => (q.x - shM.x) * cp.side.x + (q.y - shM.y) * cp.side.y;
  const rowColor = (t) => {
    let a = [0, 0, 0], n = 0;
    for (let k = -0.32; k <= 0.32; k += 0.04) {
      const q = add(add(shM, down, t), cp.side, k * shW);
      const x = Math.round(q.x), y = Math.round(q.y); if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4; if (m[i] + m[i + 3] < 150) continue;
      const c = rgb2ycc(px[i], px[i + 1], px[i + 2]); a = [a[0] + c[0], a[1] + c[1], a[2] + c[2]]; n++;
    }
    return n ? a.map((v) => v / n) : null;
  };
  const cdist = (a, b) => Math.hypot((a[0] - b[0]) * 0.45, a[1] - b[1], a[2] - b[2]);
  const findEdge = (refFrom, refTo, from, to) => {
    const ref = [0, 0, 0]; let n = 0;
    for (let t = refFrom; t <= refTo; t += torso * 0.03) { const c = rowColor(t); if (c) { ref[0] += c[0]; ref[1] += c[1]; ref[2] += c[2]; n++; } }
    if (!n) return null; ref.forEach((v, i) => (ref[i] = v / n));
    const step = (to > from ? 1 : -1) * torso * 0.02; let run = 0;
    for (let t = from; step > 0 ? t <= to : t >= to; t += step) {
      const c = rowColor(t); if (!c) continue;
      if (cdist(c, ref) > 26) { if (++run >= 3) return t - step * 2.5; } else run = 0;
    }
    return null;
  };
  if (kind === 'top') { const e = findEdge(torso * 0.3, torso * 0.7, torso * 0.75, torso * 1.45); if (e) range[1] = e; }
  if (kind === 'bottom') { const e = findEdge(torso * 1.25, torso * 1.55, torso * 1.15, torso * 0.7); if (e) range[0] = e; }
  // Ruedo: shorts, faldas y vestidos cortos terminan donde empieza la pierna.
  if (kind === 'bottom' && opts.short) { const e = findEdge(torso * 0.95, torso * 1.15, torso * 1.2, ankleY); if (e) range[1] = Math.min(range[1], e); }
  const headC = mid(lm[L.earL], lm[L.earR]), headR = Math.max(dist(lm[L.earL], lm[L.earR]) * 0.85, shW * 0.33);
  const handR = shW * 0.14;
  const hand = (wr, el) => add(wr, sub(wr, el), 0.3);
  const cut = [[headC, headR, 1.25], [hand(lm[L.wrL], lm[L.elL]), handR, 1], [hand(lm[L.wrR], lm[L.elR]), handR, 1]];

  // ¿La prenda se distingue del pelo? Se mira el color en el medio del torso.
  let hairOk = false;
  if (hair && kind !== 'bottom') {
    const probe = []; const c0 = lerp(shM, hipM, 0.6);
    for (let dy = -torso * 0.12; dy <= torso * 0.12; dy += 3) for (let dx = -shW * 0.2; dx <= shW * 0.2; dx += 3) {
      const x = Math.round(c0.x + dx), y = Math.round(c0.y + dy); if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4; probe.push(rgb2ycc(px[i], px[i + 1], px[i + 2]));
    }
    const g = probe.reduce((a, s) => [a[0] + s[0] / probe.length, a[1] + s[1] / probe.length, a[2] + s[2] / probe.length], [0, 0, 0]);
    hairOk = Math.hypot(g[1] - hair[1], g[2] - hair[2]) > 9 || Math.abs(g[0] - hair[0]) > 55;
  }
  const alpha = new Float32Array(W * H);
  let kept = 0, skinCut = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, i = k * 4;
    let a = Math.max(m[i], m[i + 3] < 255 ? m[i + 3] : 0) / 255; // silueta de la persona
    if (a < 0.35) continue;
    const t = along({ x, y });
    if (t < range[0] || t > range[1]) continue;
    if (t < -torso * 0.04 && Math.abs(sideOf({ x, y })) > shW * 0.22) continue; // pelo y fondo sobre los hombros
    let out = false;
    for (const [cq, r, sy] of cut) { const dx = x - cq.x, dy = (y - cq.y) / sy; if (dx * dx + dy * dy < r * r) { out = true; break; } }
    if (out) continue;
    const [Y, Cb, Cr] = rgb2ycc(px[i], px[i + 1], px[i + 2]);
    const dc = Math.hypot(Cb - skin[1], Cr - skin[2]), dl = Math.abs(Y - skin[0]);
    if (dc < 7 * (t < torso * 0.5 ? 1.35 : 1) && dl < 45 * (t < torso * 0.5 ? 1.3 : 1)) { skinCut++; continue; } // piel: cuello, escote, brazos y piernas
    if (hairOk && t < torso * 0.75 && Math.hypot(Cb - hair[1], Cr - hair[2]) < 6 && Math.abs(Y - hair[0]) < 38) continue; // pelo sobre los hombros
    alpha[k] = a; kept++;
  }
  // Limpieza: nos quedamos con el bloque principal (componente conexa más grande) y suavizamos el borde.
  // Borde: saca píxeles del fondo que la silueta se llevó pegados (pared blanca al lado de los brazos).
  {
    const bg = []; for (let k = 0; k < W * H; k += 37) { const i = k * 4; if (m[i] + m[i + 3] < 40) bg.push(rgb2ycc(px[i], px[i + 1], px[i + 2])); }
    if (bg.length > 50) {
      const med = [0, 1, 2].map((c) => bg.map((v) => v[c]).sort((a, b) => a - b)[bg.length >> 1]);
      const R = Math.max(3, Math.round(W / 90));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x; if (alpha[k] <= 0) continue;
        let edge = false;
        for (const [dx, dy] of [[R, 0], [-R, 0], [0, R], [0, -R]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || alpha[yy * W + xx] <= 0) { edge = true; break; } }
        if (!edge) continue;
        const i = k * 4, c = rgb2ycc(px[i], px[i + 1], px[i + 2]);
        if (Math.hypot((c[0] - med[0]) * 0.5, c[1] - med[1], c[2] - med[2]) < 14) alpha[k] = 0;
      }
    }
  }
  openMask(alpha, W, H, Math.max(1, Math.round(W / 320)));
  const keep = largestComponent(alpha, W, H);
  fillHoles(alpha, keep, px, W, H);
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let k = 0; k < W * H; k++) {
    const a = keep[k] ? alpha[k] : 0;
    px[k * 4 + 3] = Math.round(Math.min(1, a * 1.15) * 255);
    if (a > 0) { const x = k % W, y = (k / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX <= minX || maxY <= minY) return null;
  ctx.putImageData(img, 0, 0);
  // Borde suave.
  const pad = 6, cw = maxX - minX + 1 + pad * 2, ch = maxY - minY + 1 + pad * 2;
  const out = document.createElement('canvas'); out.width = cw; out.height = ch;
  const o = out.getContext('2d');
  o.filter = 'blur(0.6px)';
  o.drawImage(c, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);
  const pts = cp.pts.map((q) => ({ ...q, x: q.x - minX + pad, y: q.y - minY + pad }));
  let area = 0; for (let k = 0; k < W * H; k++) if (keep[k] && alpha[k] > 0) area++;
  const len = Math.max(1, range[1] - range[0]);
  const expected = shW * len * (kind === 'top' ? 1.5 : kind === 'bottom' ? 1.1 : 1.3);
  const coverage = area / expected;
  // Puntaje 0–1: cuánto de la silueta esperada se pudo recortar. Abajo de 0,5 conviene revisarla en el panel.
  const quality = Math.max(0, Math.min(1, 1 - Math.abs(coverage - 0.85) / 0.65));
  void kneeY;
  return { canvas: out, pts, kind, quality: Math.round(quality * 100) / 100, size: [cw, ch] };
}

// Apertura morfológica: corta puentes finos con el fondo (por ejemplo, un estante pegado a la silueta).
function openMask(alpha, W, H, r) {
  const on = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) on[k] = alpha[k] > 0 ? 1 : 0;
  const pass = (src, keepIf) => {
    const dst = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let cnt = 0, tot = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; tot++; cnt += src[yy * W + xx]; }
      dst[y * W + x] = keepIf(cnt, tot) ? 1 : 0;
    }
    return dst;
  };
  const eroded = pass(on, (c, t) => c === t);
  const opened = pass(eroded, (c) => c > 0);
  for (let k = 0; k < W * H; k++) if (!opened[k]) alpha[k] = 0;
}
// Rellena agujeros chicos dentro de la prenda (donde estaba la mano de la modelo) estirando los colores vecinos.
function fillHoles(alpha, keep, px, W, H) {
  const lab = new Int32Array(W * H); let n = 0; let area = 0;
  for (let k = 0; k < W * H; k++) if (keep[k] && alpha[k] > 0) area++;
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if ((keep[s] && alpha[s] > 0) || lab[s]) continue;
    n++; let top = 0; const cells = []; let border = false; stack[top++] = s; lab[s] = n;
    while (top) {
      const k = stack[--top]; cells.push(k); const x = k % W, y = (k / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true;
      for (const q of [k - 1, k + 1, k - W, k + W]) { if (q < 0 || q >= W * H || lab[q] || (keep[q] && alpha[q] > 0)) continue; if ((q === k - 1 && x === 0) || (q === k + 1 && x === W - 1)) continue; lab[q] = n; stack[top++] = q; }
      if (cells.length > area * 0.06) { border = true; }
    }
    if (border || cells.length > area * 0.06) continue;
    // Relleno: varias pasadas tomando el promedio de los vecinos ya pintados.
    const todo = new Set(cells), filled = new Set();
    for (let it = 0; it < 200 && todo.size; it++) {
      const done = [];
      for (const k of todo) {
        let r = 0, g = 0, b = 0, c = 0;
        for (const q of [k - 1, k + 1, k - W, k + W]) if (q >= 0 && q < W * H && keep[q] && (alpha[q] > 0.6 || filled.has(q)) && !todo.has(q)) { r += px[q * 4]; g += px[q * 4 + 1]; b += px[q * 4 + 2]; c++; }
        if (c) done.push([k, r / c, g / c, b / c]);
      }
      for (const [k, r, g, b] of done) { px[k * 4] = r; px[k * 4 + 1] = g; px[k * 4 + 2] = b; alpha[k] = 1; keep[k] = 1; todo.delete(k); filled.add(k); }
      if (!done.length) break;
    }
  }
}

/**
 * Igual que prepareGarment, pero con la máscara de la prenda que da el modelo de recorte de ropa (mucho más precisa).
 * maskImg: imagen en escala de grises del mismo tamaño que la foto (blanco = prenda).
 */
export async function prepareGarmentFromMask(image, maskImg, kind) {
  const d = await detect(image, { complexity: 1, mask: false });
  if (!d.lm) return null;
  const { W, H } = d;
  const cp = controlPoints(d.lm, kind);
  const { shW, torso, down, shM } = cp;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(maskImg, 0, 0, W, H);
  const mk = ctx.getImageData(0, 0, W, H).data;
  ctx.clearRect(0, 0, W, H); ctx.drawImage(image, 0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H), px = img.data;
  const alpha = new Float32Array(W * H);
  const along = (x, y) => (x - shM.x) * down.x + (y - shM.y) * down.y;
  for (let k = 0; k < W * H; k++) {
    const v = mk[k * 4] / 255;
    const a = Math.max(0, Math.min(1, (v - 0.3) / 0.45));
    if (a <= 0) continue;
    if (along(k % W, (k / W) | 0) < -torso * 0.35) continue; // nada por encima del cuello
    alpha[k] = a;
  }
  const keep = largestComponent(alpha, W, H);
  fillHoles(alpha, keep, px, W, H);
  bridgeVertical(alpha, keep, px, W, H, Math.round(torso * 0.45), skinColor(px, fillLandmarks(d.lm), W, H));
  let minX = W, minY = H, maxX = 0, maxY = 0, area = 0;
  for (let k = 0; k < W * H; k++) {
    const a = keep[k] ? alpha[k] : 0;
    px[k * 4 + 3] = Math.round(a * 255);
    if (a > 0.05) { area += a; const x = k % W, y = (k / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX <= minX || maxY <= minY) return null;
  ctx.putImageData(img, 0, 0);
  const pad = 4, cw = maxX - minX + 1 + pad * 2, ch = maxY - minY + 1 + pad * 2;
  const out = document.createElement('canvas'); out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(c, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);
  const pts = cp.pts.map((q) => ({ ...q, x: q.x - minX + pad, y: q.y - minY + pad }));
  // Puntaje: prenda de tamaño razonable para el cuerpo detectado y cuerpo de frente (hombros anchos respecto del torso).
  const len = kind === 'top' ? torso * 1.2 : kind === 'bottom' ? torso * 1.8 : torso * 2.4;
  const coverage = area / (shW * len * 1.2);
  const frontal = Math.min(1, (shW / torso) / 0.75);
  const quality = Math.max(0, Math.min(1, (1 - Math.abs(coverage - 0.9) / 0.9) * frontal));
  return { canvas: out, pts, kind, quality: Math.round(quality * 100) / 100, size: [cw, ch] };
}

// Brazos cruzados delante de la prenda: en cada columna, si un tramo vacío tiene prenda arriba y abajo,
// lo completa estirando los colores de los dos bordes.
function bridgeVertical(alpha, keep, px, W, H, maxGap, skin) {
  const solid = (k) => keep[k] && alpha[k] > 0.7;
  const skinAt = (k) => isSkin(rgb2ycc(px[k * 4], px[k * 4 + 1], px[k * 4 + 2]), skin, 1.5);
  const bridged = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!solid(y * W + x)) { y++; continue; }
      let y2 = y + 1; while (y2 < H && !solid(y2 * W + x)) y2++;
      const gap = y2 - y - 1;
      let skinN = 0; for (let yy = y + 1; yy < y2; yy++) if (skinAt(yy * W + x)) skinN++;
      // Sólo si el hueco es mayormente piel (un brazo o una mano tapando la prenda), no fondo.
      if (y2 < H && gap > 0 && gap <= maxGap && skinN >= gap * 0.6) {
        const a = Math.max(0, y - 3) * W + x, b = Math.min(H - 1, y2 + 3) * W + x;
        for (let yy = y + 1; yy < y2; yy++) {
          const k = yy * W + x, t = (yy - y) / (gap + 1);
          for (let c = 0; c < 3; c++) px[k * 4 + c] = px[a * 4 + c] * (1 - t) + px[b * 4 + c] * t;
          alpha[k] = 1; keep[k] = 1; bridged[k] = 1;
        }
      }
      y = y2;
    }
  }
  // Suaviza el relleno en horizontal para que no queden rayas.
  for (let pass = 0; pass < 3; pass++) for (let y = 0; y < H; y++) for (let x = 3; x < W - 3; x++) {
    const k = y * W + x; if (!bridged[k]) continue;
    for (let c = 0; c < 3; c++) { let a = 0; for (let d = -3; d <= 3; d++) a += px[(k + d) * 4 + c]; px[k * 4 + c] = a / 7; }
  }
}

function largestComponent(alpha, W, H) {
  const lab = new Int32Array(W * H), sizes = [0];
  let n = 0;
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (alpha[s] <= 0 || lab[s]) continue;
    n++; let top = 0, size = 0; stack[top++] = s; lab[s] = n;
    while (top) {
      const k = stack[--top]; size++;
      const x = k % W;
      for (const q of [k - 1, k + 1, k - W, k + W]) {
        if (q < 0 || q >= W * H || lab[q] || alpha[q] <= 0) continue;
        if ((q === k - 1 && x === 0) || (q === k + 1 && x === W - 1)) continue;
        lab[q] = n; stack[top++] = q;
      }
    }
    sizes.push(size);
  }
  const big = sizes.indexOf(Math.max(...sizes));
  const minKeep = sizes[big] * 0.08; // también conserva piezas grandes separadas (por ejemplo, mangas)
  const keep = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (lab[k] && sizes[lab[k]] >= minKeep) keep[k] = 1;
  return keep;
}

// ── Thin-plate spline ─────────────────────────────────────
function tps(src, dst, lambda = 0.5) {
  const n = src.length, N = n + 3;
  const U = (r2) => (r2 === 0 ? 0 : r2 * Math.log(r2));
  const A = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { const dx = src[i].x - src[j].x, dy = src[i].y - src[j].y; A[i][j] = U(dx * dx + dy * dy) + (i === j ? lambda : 0); }
    A[i][n] = 1; A[i][n + 1] = src[i].x; A[i][n + 2] = src[i].y;
    A[n][i] = 1; A[n + 1][i] = src[i].x; A[n + 2][i] = src[i].y;
  }
  const solve = (b) => {
    const M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < N; c++) {
      let piv = c; for (let r = c + 1; r < N; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c] || 1e-9;
      for (let r = 0; r < N; r++) { if (r === c) continue; const f = M[r][c] / d; if (!f) continue; for (let k = c; k <= N; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[N] / (r[i] || 1e-9));
  };
  const wx = solve([...dst.map((p) => p.x), 0, 0, 0]), wy = solve([...dst.map((p) => p.y), 0, 0, 0]);
  return (x, y) => {
    let fx = wx[n] + wx[n + 1] * x + wx[n + 2] * y, fy = wy[n] + wy[n + 1] * x + wy[n + 2] * y;
    for (let i = 0; i < n; i++) { const dx = x - src[i].x, dy = y - src[i].y, u = U(dx * dx + dy * dy); fx += wx[i] * u; fy += wy[i] * u; }
    return { x: fx, y: fy };
  };
}

function drawTri(ctx, img, s0, s1, s2, d0, d1, d2) {
  // Agranda apenas el triángulo de destino para que no se vean costuras entre triángulos.
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
  const g = (p) => ({ x: p.x + (p.x - cx) * 0.03, y: p.y + (p.y - cy) * 0.03 });
  const e0 = g(d0), e1 = g(d1), e2 = g(d2);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.closePath(); ctx.clip();
  const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(den) < 1e-6) { ctx.restore(); return; }
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / den;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / den;
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Dibuja la prenda calzada sobre el cuerpo detectado.
 * ctx: contexto ya con la foto de la clienta dibujada. body: resultado de detect() de la clienta.
 * garment: { image (img/canvas de la prenda), pts, kind }. adj: { dx, dy, scale, length } ajustes finos (0 por defecto).
 */
export function fitGarment(ctx, body, garment, adj = {}) {
  const target = controlPoints(body.lm, garment.kind);
  const byName = new Map(target.pts.map((p) => [p.name, p]));
  const pairs = garment.pts.filter((p) => byName.has(p.name));
  if (pairs.length < 4) return false;
  const s = 1 + (adj.scale || 0), len = 1 + (adj.length || 0);
  const o = target.shM;
  const dst = pairs.map((p) => {
    const q = byName.get(p.name);
    // Ajustes: escala alrededor de los hombros y largo a lo largo del eje del cuerpo.
    const v = sub(q, o);
    const al = v.x * target.down.x + v.y * target.down.y, sd = v.x * target.side.x + v.y * target.side.y;
    const q2 = add(add(o, target.down, al * s * (al > target.torso * 0.9 ? len : 1)), target.side, sd * s);
    return { x: q2.x + (adj.dx || 0), y: q2.y + (adj.dy || 0) };
  });
  const map = tps(pairs, dst, 1);
  const gw = garment.image.width || garment.image.naturalWidth, gh = garment.image.height || garment.image.naturalHeight;
  const cols = 14, rows = Math.max(10, Math.round(14 * gh / gw));
  const grid = [];
  for (let r = 0; r <= rows; r++) { const row = []; for (let c = 0; c <= cols; c++) { const sx = (c / cols) * gw, sy = (r / rows) * gh; row.push({ s: { x: sx, y: sy }, d: map(sx, sy) }); } grid.push(row); }
  const W = ctx.canvas.width, H = ctx.canvas.height;
  // 1) Prenda deformada en una capa aparte.
  const G = document.createElement('canvas'); G.width = W; G.height = H;
  const g = G.getContext('2d', { willReadFrequently: true });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = grid[r][c], b = grid[r][c + 1], d = grid[r + 1][c], e = grid[r + 1][c + 1];
    drawTri(g, garment.image, a.s, b.s, e.s, a.d, b.d, e.d);
    drawTri(g, garment.image, a.s, e.s, d.s, a.d, e.d, d.d);
  }
  if (adj.fast || !body.mask) { ctx.drawImage(G, 0, 0); return true; }
  const base = ctx.getImageData(0, 0, W, H), bp = base.data;
  const ga = g.getImageData(0, 0, W, H).data;
  const um = body.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const lm = fillLandmarks(body.lm);
  const skin = skinColor(bp, lm, W, H);
  const out = new ImageData(new Uint8ClampedArray(bp), W, H), op = out.data;
  // 2) Alrededor de la prenda, borra la ropa que la clienta tiene puesta (si asoma) rellenando con el fondo de esa fila.
  const R = Math.round(target.shW * 0.16);
  const cover = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) cover[k] = ga[k * 4 + 3] > 40 ? 1 : 0;
  const near = dilate(cover, W, H, R);
  const erased = new Uint8Array(W * H);
  const shM = target.shM, down = target.down;
  const tOf = (x, y) => (x - shM.x) * down.x + (y - shM.y) * down.y;
  const zone = garment.kind === 'top' ? [-target.torso * 0.1, target.torso * 1.5] : garment.kind === 'bottom' ? [target.torso * 0.75, Infinity] : [-target.torso * 0.1, Infinity];
  // (Desactivado por defecto: en fondos con textura deja rayas. Se activa con adj.clean.)
  for (let y = 0; adj.clean && y < H; y++) {
    let x = 0;
    while (x < W) {
      const k = y * W + x;
      const erase = near[k] && !cover[k] && (um[k * 4] + um[k * 4 + 3]) > 200 && !isSkin(rgb2ycc(bp[k * 4], bp[k * 4 + 1], bp[k * 4 + 2]), skin, 1.2) && (() => { const t = tOf(x, y); return t > zone[0] && t < zone[1]; })();
      if (!erase) { x++; continue; }
      let x2 = x; while (x2 < W && near[y * W + x2] && !cover[y * W + x2] && (um[(y * W + x2) * 4] + um[(y * W + x2) * 4 + 3]) > 200) x2++;
      // Color de fondo a cada lado del tramo (fuera de la silueta).
      const sideColor = (from, dir) => { for (let xx = from, n = 0; xx >= 0 && xx < W && n < W / 3; xx += dir, n++) { const q = y * W + xx; if ((um[q * 4] + um[q * 4 + 3]) < 120 && !cover[q]) return [bp[q * 4], bp[q * 4 + 1], bp[q * 4 + 2]]; } return null; };
      // Sólo si el tramo va de la prenda al fondo (ropa propia que asoma por el costado de la silueta).
      const leftG = x > 0 && cover[y * W + x - 1], rightG = x2 < W && cover[y * W + x2];
      const bgL = x > 0 && (um[(y * W + x - 1) * 4] + um[(y * W + x - 1) * 4 + 3]) < 120, bgR = x2 >= W || (um[(y * W + x2) * 4] + um[(y * W + x2) * 4 + 3]) < 120;
      if (!((leftG && bgR) || (rightG && bgL))) { x = x2 + 1; continue; }
      const cl = sideColor(x - 1, -1), cr = sideColor(x2, 1);
      const c0 = leftG ? cr : cl, c1 = c0;
      if (c0) for (let xx = x; xx < x2; xx++) { const t = (xx - x) / Math.max(1, x2 - x), q = (y * W + xx) * 4; for (let ch = 0; ch < 3; ch++) op[q + ch] = c0[ch] + (c1[ch] - c0[ch]) * t; erased[y * W + xx] = 1; }
      x = x2 + 1;
    }
  }
  // Suaviza el relleno en vertical para que no queden rayas.
  for (let pass = 0; pass < 2; pass++) for (let x = 0; x < W; x++) for (let y = 2; y < H - 2; y++) {
    const k = y * W + x; if (!erased[k]) continue;
    for (let ch = 0; ch < 3; ch++) { let a = 0, n = 0; for (let d = -2; d <= 2; d++) { const q = k + d * W; a += op[q * 4 + ch]; n++; } op[k * 4 + ch] = a / n; }
  }
  ctx.putImageData(out, 0, 0);
  // 3) La prenda, con una sombra mínima para que no parezca pegada.
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = Math.max(2, target.shW * 0.03); ctx.drawImage(G, 0, 0); ctx.restore();
  // 4) Lo que va delante de la prenda: cara y pelo (arriba del cuello) y manos.
  const top = ctx.getImageData(0, 0, W, H), tp = top.data;
  const headC = mid(lm[L.earL], lm[L.earR]), headR = Math.max(dist(lm[L.earL], lm[L.earR]) * 0.9, target.shW * 0.35);
  const hands = [[lm[L.wrL], lm[L.elL]], [lm[L.wrR], lm[L.elR]]].map(([w, e]) => [add(w, sub(w, e), 0.25), target.shW * 0.2]);
  const neckT = tOf(lm[L.mouthL].x, lm[L.mouthL].y) + target.torso * 0.06;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; if (!cover[k] || (um[k * 4] + um[k * 4 + 3]) < 200) continue;
    const c = rgb2ycc(bp[k * 4], bp[k * 4 + 1], bp[k * 4 + 2]);
    let front = false;
    if (Math.hypot(x - headC.x, (y - headC.y) / 1.2) < headR && tOf(x, y) < neckT) front = true;
    else for (const [h, r] of hands) if (Math.hypot(x - h.x, y - h.y) < r && isSkin(c, skin, 1.3)) { front = true; break; }
    if (front) { tp[k * 4] = bp[k * 4]; tp[k * 4 + 1] = bp[k * 4 + 1]; tp[k * 4 + 2] = bp[k * 4 + 2]; }
  }
  ctx.putImageData(top, 0, 0);
  return true;
}

function dilate(on, W, H, r) {
  // Dilatación separable (primero filas, después columnas) con un cuadrado de lado 2r+1.
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { let last = -1e9; for (let x = 0; x < W; x++) { if (on[y * W + x]) last = x; if (x - last <= r) tmp[y * W + x] = 1; } last = 1e9; for (let x = W - 1; x >= 0; x--) { if (on[y * W + x]) last = x; if (last - x <= r) tmp[y * W + x] = 1; } }
  for (let x = 0; x < W; x++) { let last = -1e9; for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= r) out[y * W + x] = 1; } last = 1e9; for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= r) out[y * W + x] = 1; } }
  return out;
}

/** Si la foto sirve: devuelve un aviso en castellano o null. */
export function checkBody(body, kind) {
  if (!body.lm) return 'No encontramos una persona en la foto. Usá una foto de cuerpo entero, de frente.';
  const v = (i) => body.lm[i].v;
  if (v(L.shL) < 0.5 || v(L.shR) < 0.5) return 'No se ven bien los hombros. Probá con una foto de frente, con buena luz.';
  if (v(L.hipL) < 0.4 || v(L.hipR) < 0.4) return 'No se ve la cadera. Usá una foto de cuerpo entero.';
  if (kind !== 'top' && (v(L.knL) < 0.3 || v(L.knR) < 0.3)) return 'Para esta prenda necesitamos ver tus piernas: usá una foto de cuerpo entero.';
  return null;
}

/** Dibuja la foto y todas las prendas del look (primero las de abajo y las enteras, después las de arriba). */
export function renderLook(canvas, photo, body, look, opts = {}) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = body.W; canvas.height = body.H;
  ctx.drawImage(photo, 0, 0, body.W, body.H);
  if (!body.lm) return;
  const order = { full: 0, bottom: 1, top: 2 };
  for (const g of [...look].sort((a, b) => order[a.kind] - order[b.kind])) fitGarment(ctx, body, g, { ...(g.adj || {}), fast: opts.fast });
}
