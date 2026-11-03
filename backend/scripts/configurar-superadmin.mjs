// Crea el perfil superadmin para un usuario Auth creado previamente desde el panel de Supabase.
// No crea contraseñas ni expone la service_role key. Solo permite insertar un perfil nuevo.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ZARU_SUPERADMIN_USER_ID, ZARU_SUPERADMIN_NOMBRE } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ZARU_SUPERADMIN_USER_ID || !ZARU_SUPERADMIN_NOMBRE) {
  console.error('Configura SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ZARU_SUPERADMIN_USER_ID y ZARU_SUPERADMIN_NOMBRE.');
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ZARU_SUPERADMIN_USER_ID)) {
  console.error('ZARU_SUPERADMIN_USER_ID debe ser un UUID válido.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: usuario, error: errorUsuario } = await db.auth.admin.getUserById(ZARU_SUPERADMIN_USER_ID);
if (errorUsuario || !usuario?.user) {
  console.error('No se encontró el usuario Auth indicado. Créalo primero desde Supabase Auth.');
  process.exit(1);
}
const { data: existente, error: errorPerfil } = await db.from('perfiles')
  .select('id, rol, establecimiento_id').eq('id', ZARU_SUPERADMIN_USER_ID).maybeSingle();
if (errorPerfil) {
  console.error('No se pudo consultar el perfil:', errorPerfil.message);
  process.exit(1);
}
if (existente) {
  console.error('El usuario ya tiene un perfil. Por seguridad, este script no convierte perfiles existentes.');
  process.exit(1);
}
const { error } = await db.from('perfiles').insert({
  id: ZARU_SUPERADMIN_USER_ID,
  nombre: ZARU_SUPERADMIN_NOMBRE.trim(),
  rol: 'superadmin',
  establecimiento_id: null,
  activo: true,
});
if (error) {
  console.error('No se pudo crear el perfil superadmin:', error.message);
  process.exit(1);
}
console.log('Perfil superadmin creado. El usuario puede iniciar sesión con su cuenta de Supabase Auth.');
