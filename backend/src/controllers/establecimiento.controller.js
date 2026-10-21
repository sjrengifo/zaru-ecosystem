// HU-13 — Lógica del establecimiento y su branding.
// TODO: subir el logo a Supabase Storage (bucket "logos"), validar PNG/JPG y máx. 2 MB (CA3).
import { supabase } from '../config/supabase.js';
import { pendiente } from './pendiente.js';

export async function obtener(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('establecimientos')
      .select('*')
      .eq('id', req.usuario.establecimientoId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export const actualizarBranding = pendiente('HU-13');
