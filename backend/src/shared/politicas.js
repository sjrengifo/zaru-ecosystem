// HU-51 CA1 — Política de tratamiento de datos vigente (información pública, no pertenece a un establecimiento).
import { supabase } from '../config/supabase.js';
import { AppError } from './errores.js';

export async function obtenerPoliticaVigente() {
  const { data, error } = await supabase
    .from('politicas_datos')
    .select('version, titulo, contenido, vigente_desde')
    .lte('vigente_desde', new Date().toISOString())
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError('NO_ENCONTRADO', 'No hay una política de tratamiento de datos publicada');
  return { version: data.version, titulo: data.titulo, contenido: data.contenido, vigenteDesde: data.vigente_desde };
}
