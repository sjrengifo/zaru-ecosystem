// HU-44 CA2 — Registro de auditoría (tabla `auditoria`, solo inserción).
// Nunca bloquea ni rompe la respuesta: si el registro falla, se informa en el log.
import { supabase } from '../config/supabase.js';

/**
 * @param {import('express').Request} req
 * @param {{ accion?: string, recurso?: string, recursoId?: string, resultado: 'permitido'|'denegado', motivo?: string, detalle?: object }} datos
 */
export async function registrarAuditoria(req, datos) {
  // Ruta declarada, por ejemplo "/api/servicios/:id", sin barra final.
  const ruta = `${req.baseUrl ?? ''}${req.route?.path ?? ''}`.replace(/(.)\/$/, '$1');
  const fila = {
    establecimiento_id: req.ctx?.establecimientoId ?? null,
    usuario_id: req.ctx?.usuarioId ?? null,
    actor_tipo: 'usuario',
    rol: req.ctx?.rol ?? null,
    accion: datos.accion ?? `${req.method} ${ruta}`,
    recurso: datos.recurso ?? (ruta.replace(/^\/api\/?/, '').split('/')[0] || null),
    recurso_id: datos.recursoId ?? req.params?.id ?? null,
    resultado: datos.resultado,
    motivo: datos.motivo ?? null,
    detalle: datos.detalle ?? {},
    ip: req.ip ?? null,
    request_id: req.requestId ?? null,
  };
  try {
    const { error } = await supabase.from('auditoria').insert(fila);
    if (error) throw error;
  } catch (err) {
    console.error('No se pudo registrar la auditoría', { requestId: fila.request_id, error: err.message });
  }
}
