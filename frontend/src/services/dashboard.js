// HU-09 — Consultas del tablero operativo.
// Lee directamente de Supabase con la sesión del panel: las políticas RLS de
// `ordenes`, `orden_servicios` y `vehiculos` limitan los resultados al
// establecimiento del usuario. El establecimiento nunca se envía como filtro
// de confianza; solo se usa en Realtime como defensa adicional.
import { supabase } from '../lib/supabase.js';
import { inicioDiaBogota } from '../lib/dashboard.js';

// Columnas que necesita una tarjeta y los dos indicadores del día.
// `estado_desde` y `duracion_min` alimentan la alerta de demora de HU-11 sin
// consultas extra: la duración es el snapshot guardado al crear la orden.
const CAMPOS = [
  'id, vehiculo_id, estado, estado_desde, created_at, total, codigo_seguimiento,',
  'entrega_estimada_at, entregada_at,',
  'vehiculos(placa),',
  'orden_servicios(duracion_min, servicios(nombre)),',
  // HU-46: solo evento/estado/fecha; nunca `destino` (correo cifrado) ni `error` (texto del proveedor).
  'notificaciones(evento, estado, created_at)',
].join(' ');

/**
 * Órdenes que pertenecen al tablero:
 * - todas las que siguen en proceso (estado distinto de `entregado`), sin
 *   importar cuándo ingresaron, para no perder trabajo en curso;
 * - y las entregadas hoy, que alimentan la columna "Entregado" y el indicador.
 *
 * Una sola consulta evita el N+1 y el cruce de datos entre establecimientos.
 */
export async function listarOrdenesDelTablero() {
  const desde = inicioDiaBogota();
  const { data, error } = await supabase
    .from('ordenes')
    .select(CAMPOS)
    .or(`estado.neq.entregado,and(estado.eq.entregado,entregada_at.gte.${desde})`)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
