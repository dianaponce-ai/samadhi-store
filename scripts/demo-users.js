// Crea los tres usuarios de prueba para recorrer la tienda y el panel con cada rol.
// Uso:  npm run demo-users            (crea o actualiza)
//       npm run demo-users -- --borrar (los elimina antes de publicar)
import { get, run } from '../server/lib/db.js';
import { hashPassword } from '../server/lib/auth.js';

import { DEMO_USERS } from './demo-users-list.js';

if (process.argv.includes('--borrar')) {
  for (const u of DEMO_USERS) {
    if (u.kind === 'staff') run('DELETE FROM admin_users WHERE email = ?', u.email);
    else run('UPDATE customers SET password_hash = NULL WHERE email = ?', u.email);
  }
  console.log('Usuarios de prueba eliminados.');
} else {
  for (const u of DEMO_USERS) {
    const hash = hashPassword(u.password);
    if (u.kind === 'staff') {
      if (get('SELECT id FROM admin_users WHERE email = ?', u.email)) run('UPDATE admin_users SET role = ?, name = ?, password_hash = ? WHERE email = ?', u.role, u.name, hash, u.email);
      else run('INSERT INTO admin_users(email, name, role, password_hash) VALUES(?,?,?,?)', u.email, u.name, u.role, hash);
    } else if (get('SELECT id FROM customers WHERE email = ?', u.email)) {
      run('UPDATE customers SET name = ?, phone = ?, dni = ?, password_hash = ? WHERE email = ?', u.name, u.phone, u.dni, hash, u.email);
    } else {
      run('INSERT INTO customers(email, name, phone, dni, password_hash) VALUES(?,?,?,?,?)', u.email, u.name, u.phone, u.dni, hash);
    }
  }
  console.log('Usuarios de prueba listos:');
  for (const u of DEMO_USERS) console.log(`  ${u.kind === 'staff' ? (u.role === 'admin' ? 'Administrador    ' : 'Gerente de tienda') : 'Cliente          '}  ${u.email}  /  ${u.password}`);
  console.log('Borralos antes de publicar la tienda: npm run demo-users -- --borrar');
}
