// Uso: npm run create-admin -- email@dominio.com "contraseña larga" "Nombre"
import '../server/lib/db.js';
import { createAdmin } from '../server/lib/auth.js';

const [email, password, name = ''] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: npm run create-admin -- email@dominio.com "contraseña de al menos 10 caracteres" "Nombre"');
  process.exit(1);
}
try {
  createAdmin(email, password, name);
  console.log(`Listo: ${email} ya puede entrar al panel en /admin`);
} catch (e) {
  console.error(/UNIQUE/.test(e.message) ? 'Ese email ya tiene acceso.' : e.message);
  process.exit(1);
}
