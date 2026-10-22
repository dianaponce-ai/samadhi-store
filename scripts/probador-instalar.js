// Instala lo necesario para el recorte automático de prendas (opcional, unos 180 MB más el motor de cálculo).
// Uso: npm run probador:instalar
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { MODEL } from '../server/lib/cloth-seg.js';

console.log('Instalando onnxruntime-node y sharp (sin agregarlos a package.json)…');
execSync('npm install --no-save onnxruntime-node@1.20.1 sharp@0.33.5', { stdio: 'inherit' });
if (!existsSync(MODEL)) {
  mkdirSync(path.dirname(MODEL), { recursive: true });
  console.log('Descargando el modelo de recorte de prendas (176 MB)…');
  const r = await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_cloth_seg.onnx');
  if (!r.ok) throw new Error('No se pudo descargar el modelo: ' + r.status);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(MODEL));
}
console.log('Listo. Reiniciá la tienda: en Panel → Probador, "Preparar" usa el recorte automático.');
