/**
 * Script para generar el hash bcrypt del usuario admin inicial.
 * 
 * Uso:
 *   node scripts/create-admin.js
 * 
 * Luego copia el hash y ejecuta en Supabase SQL Editor:
 *   INSERT INTO users_app (username, display_name, role, password_hash, active, can_validate)
 *   VALUES ('admin', 'Administrador', 'admin', '<HASH_AQUI>', true, true);
 */

const bcrypt = require('bcryptjs')
const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

console.log('\n🔐 Generador de usuario admin - Packing Santa Catalina\n')

rl.question('Usuario (ej: admin): ', (username) => {
  rl.question('Nombre para mostrar (ej: Administrador): ', (displayName) => {
    rl.question('Contraseña: ', async (password) => {
      const hash = await bcrypt.hash(password, 12)

      console.log('\n✅ Hash generado correctamente!\n')
      console.log('📋 Ejecuta este SQL en Supabase:\n')
      console.log(`INSERT INTO users_app (username, display_name, role, password_hash, active, can_validate)`)
      console.log(`VALUES (`)
      console.log(`  '${username.toLowerCase().trim()}',`)
      console.log(`  '${displayName}',`)
      console.log(`  'admin',`)
      console.log(`  '${hash}',`)
      console.log(`  true,`)
      console.log(`  true`)
      console.log(`);`)
      console.log('\n')

      rl.close()
    })
  })
})
