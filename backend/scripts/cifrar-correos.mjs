// HU-50 CA2 — Cifra los correos de clientes que aún están en texto plano (datos anteriores al cifrado).
// Es idempotente: los valores que ya empiezan por "v1:" no se tocan.
// Uso: cd backend && node --env-file=.env scripts/cifrar-correos.mjs
import { validarEntorno } from '../src/config/env.js';
import { supabase } from '../src/config/supabase.js';
import { cifrar, estaCifrado } from '../src/shared/cifrado.js';

validarEntorno();

const { data, error } = await supabase.from('clientes').select('id, correo').not('correo', 'is', null);
if (error) throw error;

const pendientes = data.filter((c) => c.correo && !estaCifrado(c.correo));
for (const cliente of pendientes) {
  const { error: errUpdate } = await supabase.from('clientes').update({ correo: cifrar(cliente.correo) }).eq('id', cliente.id);
  if (errUpdate) throw errUpdate;
}
console.log(`Correos revisados: ${data.length} · cifrados ahora: ${pendientes.length} · ya cifrados: ${data.length - pendientes.length}`);
