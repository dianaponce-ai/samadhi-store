// Uso:
//   npm run import                       → usa data/import/tiendanube-productos.csv y data/import/fotos-tiendanube.txt
//   npm run import -- archivo.csv [fotos.txt]
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/lib/config.js';
import { importTiendanube, seedBannersIfEmpty, seedFeaturedIfEmpty } from '../server/lib/importer.js';

const csvPath = process.argv[2] || path.join(ROOT, 'data/import/tiendanube-productos.csv');
const photosPath = process.argv[3] || path.join(ROOT, 'data/import/fotos-tiendanube.txt');

if (!existsSync(csvPath)) {
  console.error(`No encuentro el archivo ${csvPath}. Exportalo desde Tiendanube (Productos > Exportar) y pasá la ruta.`);
  process.exit(1);
}
const stats = importTiendanube(readFileSync(csvPath), existsSync(photosPath) ? readFileSync(photosPath, 'utf8') : '');
seedFeaturedIfEmpty();
seedBannersIfEmpty();
console.log(`Listo: ${stats.products} productos (${stats.created} nuevos, ${stats.updated} actualizados, ${stats.hidden} ocultos), ${stats.variants} variantes, ${stats.images} fotos.`);
