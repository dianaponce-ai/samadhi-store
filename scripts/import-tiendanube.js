// Uso:
//   npm run import                       → usa data/import/tiendanube-productos.csv y data/import/fotos-tiendanube.txt
//   npm run import -- archivo.csv [fotos.txt]
//   npm run import -- --conservar         → no borra los productos que no estén en el archivo
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/lib/config.js';
import { importTiendanube, seedBannersIfEmpty, seedFeaturedIfEmpty, importExtras } from '../server/lib/importer.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const csvPath = args[0] || path.join(ROOT, 'data/import/tiendanube-productos.csv');
const photosPath = args[1] || path.join(ROOT, 'data/import/fotos-tiendanube.txt');
const colorsPath = path.join(ROOT, 'data/import/fotos-colores.txt');
// Por defecto el archivo manda: los productos que no están en la exportación se borran. Con --conservar no se borra nada.
const prune = !process.argv.includes('--conservar');

if (!existsSync(csvPath)) {
  console.error(`No encuentro el archivo ${csvPath}. Exportalo desde Tiendanube (Productos > Exportar) y pasá la ruta.`);
  process.exit(1);
}
const stats = importTiendanube(readFileSync(csvPath), existsSync(photosPath) ? readFileSync(photosPath, 'utf8') : '',
  { colorPhotos: existsSync(colorsPath) ? readFileSync(colorsPath, 'utf8') : '', prune });
seedFeaturedIfEmpty();
seedBannersIfEmpty();
const extras = importExtras(path.join(ROOT, 'data/import/productos-extra.json'));
if (extras) console.log(`${extras} productos extra (data/import/productos-extra.json).`);
console.log(`Listo: ${stats.products} productos (${stats.created} nuevos, ${stats.updated} actualizados, ${stats.hidden} ocultos, ${stats.deleted} borrados), ${stats.variants} variantes, ${stats.images} fotos, ${stats.colorImages} fotos por color.`);
