// HU-18 — Datos del seguimiento público y aviso de cambios en tiempo real.
//
// El cliente final no tiene sesión: entra con el código de seguimiento de su orden (HU-08).
// Ese código es único en toda la plataforma, así que es lo único que se busca de forma global;
// con la orden encontrada, el resto de la lectura pasa por el acceso del tenant de esa orden (HU-41),
// igual que en el panel.
//
// Tiempo real (ADR-04): el backend mantiene UNA suscripción de Supabase Realtime a `ordenes`
// con la clave de servicio y reparte cada cambio solo a las conexiones de esa orden (RF-F5-07).
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from './tenant.js';
import { noEncontrado } from './errores.js';
import { armarSeguimiento, codigoVigente, normalizarCodigo } from './etapasSeguimiento.js';

const COLUMNAS_ORDEN = [
  'id, estado, estado_desde, subtotal, descuento, total, codigo_seguimiento, entrega_estimada_at,',
  'entregada_at, created_at, version,',
  'vehiculo:vehiculos(placa, tipo, marca, color),',
  'servicios:orden_servicios(precio, duracion_min, servicio:servicios(nombre)),',
  'historial:historial_estados(estado, created_at, revertido)',
].join(' ');

/** Mismo mensaje para un código inexistente, vencido o de una sede suspendida: no se revela cuál fue. */
const sinSeguimiento = () => noEncontrado('Seguimiento');

/**
 * Carga el seguimiento de un código.
 * @returns {Promise<{ ordenId: string, seguimiento: object }>} `ordenId` es interno (para el bus); no se envía al cliente.
 */
export async function cargarSeguimiento(codigoRecibido, { db = supabase, ahora = new Date() } = {}) {
  const codigo = normalizarCodigo(codigoRecibido);
  if (!codigo) throw sinSeguimiento();

  const { data: encontrada, error } = await db
    .from('ordenes')
    .select('id, establecimiento_id')
    .eq('codigo_seguimiento', codigo)
    .maybeSingle();
  if (error) throw error;
  if (!encontrada) throw sinSeguimiento();

  const tenant = crearAccesoTenant(db, { establecimientoId: encontrada.establecimiento_id });
  const [orden, sede] = await Promise.all([
    tenant.obtener('ordenes', encontrada.id, COLUMNAS_ORDEN, 'Seguimiento'),
    tenant.listar('establecimientos', 'nombre, logo_url, color_primario, color_secundario, estado').maybeSingle(),
  ]);
  if (sede.error) throw sede.error;
  if (!sede.data || sede.data.estado === 'suspendido') throw sinSeguimiento();
  if (!codigoVigente(orden, ahora)) throw sinSeguimiento();

  return { ordenId: orden.id, seguimiento: armarSeguimiento(orden, sede.data) };
}

/** Reparte avisos de cambio por orden. Cada conexión solo se suscribe a la suya (RF-F5-07). */
export function crearBus() {
  const suscriptores = new Map();
  return {
    suscribir(ordenId, alCambiar) {
      if (!suscriptores.has(ordenId)) suscriptores.set(ordenId, new Set());
      suscriptores.get(ordenId).add(alCambiar);
      return () => {
        const lista = suscriptores.get(ordenId);
        lista?.delete(alCambiar);
        if (lista?.size === 0) suscriptores.delete(ordenId);
      };
    },
    publicar(ordenId) {
      for (const alCambiar of suscriptores.get(ordenId) ?? []) {
        try {
          alCambiar();
        } catch (err) {
          console.error('[HU-18] Error al avisar un cambio de orden:', err?.message ?? err);
        }
      }
    },
    conexiones(ordenId) {
      return ordenId ? suscriptores.get(ordenId)?.size ?? 0 : [...suscriptores.values()].reduce((n, s) => n + s.size, 0);
    },
  };
}

export const bus = crearBus();

let canal = null;

/**
 * Abre (una sola vez y solo cuando alguien sigue una orden) la suscripción de Realtime a `ordenes`.
 * Si el canal se cae, se vuelve a abrir en la siguiente conexión; mientras tanto, cada conexión
 * revisa su orden periódicamente, así que el cliente igual recibe el cambio.
 */
export function escucharCambiosDeOrdenes(db = supabase) {
  if (canal) return canal;
  canal = db
    .channel('hu18-seguimiento-publico')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ordenes' }, (cambio) => {
      const id = cambio?.new?.id;
      if (id) bus.publicar(id);
    })
    .subscribe((estado) => {
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
        console.warn(`[HU-18] Canal de Realtime ${estado}; se usará la revisión periódica.`);
        const anterior = canal;
        canal = null;
        anterior?.unsubscribe?.().catch?.(() => {});
      }
    });
  return canal;
}
