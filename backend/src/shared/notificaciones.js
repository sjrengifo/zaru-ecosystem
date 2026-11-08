// HU-46 — Notificaciones por correo al cliente final.
//
// Flujo (patrón outbox, tabla `notificaciones`):
//   1. preparar: con la orden ya guardada, se arma el mensaje y se deja una fila "pendiente".
//      Si el cliente no tiene correo o pidió no recibir avisos, no se crea nada y se informa el motivo.
//   2. el controlador responde al operario SIN esperar el envío (CA3: la operación nunca se bloquea).
//   3. enviar: en segundo plano se llama al proveedor (con tiempo máximo y hasta 3 intentos) y la fila
//      queda "enviada" o "fallida" con el error, para consultarla después.
//
// Nada de este módulo lanza errores hacia el controlador: un fallo del correo jamás revierte ni
// impide el cambio de estado de la orden (CA3).
//
// Todo acceso a datos pasa por el acceso del tenant (HU-41): la notificación queda en el mismo
// establecimiento de la orden. El destino se guarda cifrado, igual que el correo del cliente (HU-50).
import { cifrar, descifrar, estaCifrado } from './cifrado.js';
import { proveedorCorreo, conTiempoMaximo, enmascararCorreo } from './correo.js';
import { PLANTILLAS } from './plantillasCorreo.js';

export const EVENTOS = { RECIBIDA: 'orden.recibida', LISTA: 'orden.lista' };
export const MAX_INTENTOS = 3;
const ESPERAS_MS = [2_000, 4_000]; // antes del 2.º y del 3.er intento

const COLUMNAS_ORDEN =
  'id, estado, subtotal, descuento, total, created_at, codigo_seguimiento, vehiculos(placa, clientes(id, nombre, correo)), orden_servicios(precio, servicios(nombre))';

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const resumen = (estado, extra = {}) => ({ canal: 'correo', estado, ...extra });

/** El cliente revocó expresamente los avisos del servicio (última evidencia de consentimientos, HU-51). */
async function avisosRevocados(tenant, clienteId) {
  const { data, error } = await tenant
    .listar('consentimientos', 'otorgado, created_at')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'notificaciones_servicio')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.otorgado === false;
}

/**
 * Prepara el correo de un evento de la orden.
 * @returns {Promise<{ resumen: object, enviar: () => Promise<object> }>}
 *   `resumen` se devuelve al panel; `enviar` se ejecuta en segundo plano después de responder.
 */
export async function prepararCorreo(tenant, { evento, ordenId }, opciones = {}) {
  const sinEnvio = async () => null;
  try {
    const plantilla = PLANTILLAS[evento];
    if (!plantilla) throw new Error(`Evento de correo desconocido: ${evento}`);

    const { data: orden, error } = await tenant.listar('ordenes', COLUMNAS_ORDEN).eq('id', ordenId).maybeSingle();
    if (error) throw error;
    if (!orden) throw new Error('La orden no existe');

    const vehiculo = orden.vehiculos ?? {};
    const cliente = vehiculo.clientes ?? null;
    if (!cliente) return { resumen: resumen('omitida', { motivo: 'sin_cliente' }), enviar: sinEnvio };

    // CA3: sin correo registrado no se envía nada y la operación sigue normal.
    const correoGuardado = cliente.correo;
    const correo = correoGuardado ? descifrar(correoGuardado)?.trim() : '';
    if (!correo) return { resumen: resumen('omitida', { motivo: 'sin_correo' }), enviar: sinEnvio };

    if (await avisosRevocados(tenant, cliente.id)) {
      return { resumen: resumen('omitida', { motivo: 'revocado' }), enviar: sinEnvio };
    }

    const { data: establecimiento } = await tenant
      .listar('establecimientos', 'nombre, logo_url, color_primario')
      .maybeSingle();

    const mensaje = plantilla({
      establecimiento,
      cliente,
      orden,
      vehiculo,
      servicios: (orden.orden_servicios ?? []).map((s) => ({ nombre: s.servicios?.nombre ?? 'Servicio', precio: s.precio })),
    });

    let fila;
    try {
      fila = await tenant.crear('notificaciones', {
        cliente_id: cliente.id,
        orden_id: orden.id,
        tipo: 'operativa',
        evento,
        canal: 'correo',
        destino: estaCifrado(correoGuardado) ? correoGuardado : cifrar(correo),
        contenido: { asunto: mensaje.asunto },
        estado: 'pendiente',
        clave_dedupe: `${orden.id}:${evento}:correo`,
      }, 'id');
    } catch (err) {
      // RNF-F6-04: el mismo evento de la misma orden nunca genera un segundo correo.
      if (err.codigo === 'CONFLICTO') return { resumen: resumen('duplicada'), enviar: sinEnvio };
      throw err;
    }

    const destino = enmascararCorreo(correo);
    return {
      resumen: resumen('pendiente', { id: fila.id, destino }),
      enviar: () => enviarCorreo(tenant, { id: fila.id, para: correo, mensaje }, opciones),
    };
  } catch (err) {
    console.error(`[HU-46] No se pudo preparar el correo ${evento} de la orden ${ordenId}:`, err.message);
    return { resumen: resumen('error', { motivo: 'preparacion' }), enviar: sinEnvio };
  }
}

/** Marca la fila sin propagar errores: el seguimiento nunca debe romper el envío. */
async function marcar(tenant, id, cambios) {
  try {
    await tenant.actualizar('notificaciones', id, cambios, 'id', 'Notificación');
  } catch (err) {
    console.error(`[HU-46] No se pudo actualizar la notificación ${id}:`, err.message);
  }
}

/**
 * Envía el correo con hasta MAX_INTENTOS intentos y deja el resultado en la fila.
 * @returns {Promise<{ estado: 'enviada'|'fallida', intentos: number, error?: string }>}
 */
export async function enviarCorreo(tenant, { id, para, mensaje }, opciones = {}) {
  const proveedor = opciones.proveedor ?? proveedorCorreo();
  const esperas = opciones.esperasMs ?? ESPERAS_MS;
  const tiempoMaximo = opciones.tiempoMaximoMs;
  let ultimoError;

  for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
    await marcar(tenant, id, { estado: 'enviando', intentos: intento });
    try {
      const { idProveedor } = await conTiempoMaximo(proveedor.enviar({ para, ...mensaje }), tiempoMaximo);
      await marcar(tenant, id, {
        estado: 'enviada',
        error: null,
        proximo_intento_at: null,
        contenido: { asunto: mensaje.asunto, proveedor: proveedor.nombre, idProveedor: idProveedor ?? null },
      });
      return { estado: 'enviada', intentos: intento };
    } catch (err) {
      ultimoError = String(err?.message ?? err).slice(0, 500);
      const espera = esperas[intento - 1];
      if (intento < MAX_INTENTOS) {
        await marcar(tenant, id, {
          estado: 'pendiente',
          error: ultimoError,
          proximo_intento_at: new Date(Date.now() + (espera ?? 0)).toISOString(),
        });
        if (espera) await dormir(espera);
      }
    }
  }

  console.error(`[HU-46] Correo ${id} fallido tras ${MAX_INTENTOS} intentos: ${ultimoError}`);
  await marcar(tenant, id, { estado: 'fallida', error: ultimoError, proximo_intento_at: null });
  return { estado: 'fallida', intentos: MAX_INTENTOS, error: ultimoError };
}

/** Ejecuta el envío en segundo plano, después de que el controlador ya respondió. */
export function enSegundoPlano(tarea) {
  setImmediate(() => {
    Promise.resolve()
      .then(tarea)
      .catch((err) => console.error('[HU-46] Error inesperado en el envío de correo:', err?.message ?? err));
  });
}


/**
 * Compatibilidad con los controladores existentes del proyecto actual.
 * `ingreso` y `listo` se traducen al nuevo outbox; el envío siempre queda desacoplado.
 */
export async function programarNotificacion(tenant, ordenId, tipo) {
  const evento = tipo === 'ingreso' ? EVENTOS.RECIBIDA : EVENTOS.LISTA;
  const preparado = await prepararCorreo(tenant, { evento, ordenId });
  if (preparado.resumen.estado === 'pendiente') enSegundoPlano(preparado.enviar);
  return preparado.resumen;
}

/** Adaptador para pruebas/integraciones antiguas que ejecutan el envío de forma síncrona. */
export async function notificarOrden(tenant, ordenId, tipo, { enviar } = {}) {
  const evento = tipo === 'ingreso' ? EVENTOS.RECIBIDA : EVENTOS.LISTA;
  const proveedor = enviar ? {
    nombre: 'prueba',
    async enviarCorreo({ para, ...mensaje }) {
      const resultado = await enviar({ para, ...mensaje });
      if (resultado?.enviado === false) throw new Error(resultado.motivo || 'El proveedor rechazó el envío');
      return { idProveedor: resultado?.id ?? null };
    },
    async enviar({ para, ...mensaje }) {
      const resultado = await enviar({ para, ...mensaje });
      if (resultado?.enviado === false) throw new Error(resultado.motivo || 'El proveedor rechazó el envío');
      return { idProveedor: resultado?.id ?? null };
    },
  } : undefined;
  const preparado = await prepararCorreo(tenant, { evento, ordenId }, { proveedor, esperasMs: [] });
  if (preparado.resumen.estado === 'pendiente') {
    const resultado = await preparado.enviar();
    return resultado.estado === 'enviada'
      ? { estado: 'enviada' }
      : { estado: 'fallida', motivo: resultado.error };
  }
  if (preparado.resumen.estado === 'omitida') return { estado: 'cancelada', motivo: preparado.resumen.motivo };
  if (preparado.resumen.estado === 'duplicada') return { estado: 'omitida' };
  return { estado: 'fallida', motivo: preparado.resumen.motivo ?? 'No se pudo preparar el correo' };
}
