// HU-46 · HU-34 — Notificaciones al cliente final (patrón outbox).
//
// Flujo:
//   1. preparar: con la orden ya guardada, se arma el mensaje y se deja una fila "pendiente".
//      Si el cliente no tiene correo o pidió no recibir avisos, no se crea nada y se informa el motivo.
//   2. el controlador responde al operario SIN esperar el envío (CA3: la operación nunca se bloquea).
//   3. el worker (shared/workerNotificaciones.js) reclama las filas vencidas y envía con reintentos
//      exponenciales; cada intento queda auditado en `notificacion_intentos` (HU-34).
//
// HU-34:
//   - Solo se reintenta un error recuperable (red, 429, 5xx, tiempo agotado). Un error permanente
//     (destinatario inválido, credenciales, 4xx de validación) termina de inmediato.
//   - Esperas acotadas 1, 2 y 4 minutos (configurables). Nunca hay reintentos infinitos.
//   - Si se agotan los intentos de un aviso "listo" por correo y el cliente tiene celular y
//     autorización, se crea una notificación alterna por SMS con su propia clave anti-duplicados.
//   - La clave de deduplicación impide que un reintento o el canal alterno repita un mensaje ya
//     entregado (si la fila original quedó entregada, no se crea el alterno).
//
// Todo acceso a datos pasa por el acceso del tenant (HU-41). El destino se guarda cifrado (HU-50).
import { cifrar, descifrar, estaCifrado } from './cifrado.js';
import { proveedorCorreo, conTiempoMaximo, enmascararCorreo } from './correo.js';
import { proveedorSms, textoAvisoListo } from './proveedorSms.js';
import { clasificarError, esperaExponencial, esperasConfiguradas } from './reintentos.js';
import { PLANTILLAS } from './plantillasCorreo.js';
import { crearAccesoTenant } from './tenant.js';

export const EVENTOS = { RECIBIDA: 'orden.recibida', LISTA: 'orden.lista' };
export const MAX_INTENTOS = 3;
const ESPERAS_MS = [2_000, 4_000]; // compatibilidad del envío inmediato (HU-46)

const COLUMNAS_ORDEN =
  'id, estado, subtotal, descuento, total, created_at, codigo_seguimiento, vehiculos(placa, clientes(id, nombre, correo, telefono)), orden_servicios(precio, servicios(nombre))';

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const resumen = (estado, extra = {}) => ({ canal: 'correo', estado, ...extra });
const ahoraIso = () => new Date().toISOString();

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

/** Descifra un destino tolerando filas antiguas en texto plano. */
function destinoPlano(destino) {
  try {
    return descifrar(destino) ?? '';
  } catch {
    return String(destino ?? '');
  }
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
        // Solo se guarda el asunto y metadatos: el cuerpo se reconstruye con la plantilla al enviar,
        // así no se duplican datos personales en la cola.
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
 * HU-34: guarda la auditoría de un intento. Es best-effort: si la migración todavía no está
 * aplicada, el envío sigue funcionando y la bitácora simplemente no muestra el detalle.
 */
export async function registrarIntento(tenant, datos) {
  try {
    await tenant.crear('notificacion_intentos', {
      notificacion_id: datos.notificacionId,
      intento: datos.intento,
      canal: datos.canal,
      resultado: datos.resultado,
      proveedor: datos.proveedor ?? null,
      id_proveedor: datos.idProveedor ?? null,
      entregado: Boolean(datos.entregado),
      recuperable: datos.recuperable ?? null,
      error: datos.error ?? null,
    }, 'id');
  } catch (err) {
    if (err?.codigo === 'CONFLICTO') return; // reintento concurrente: ya quedó registrado
    console.warn('[HU-34] No se pudo registrar el intento:', err?.message ?? err);
  }
}

/**
 * Envío inmediato compatible con HU-46 (sin worker). Hace hasta MAX_INTENTOS con esperas cortas.
 * El worker usa `enviarUnIntento` para respetar la espera exponencial de minutos.
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
        contenido: {
          asunto: mensaje.asunto,
          proveedor: proveedor.nombre,
          idProveedor: idProveedor ?? null,
          aceptadaAt: ahoraIso(),
          entregaConfirmada: false,
        },
      });
      await registrarIntento(tenant, {
        notificacionId: id,
        intento,
        canal: 'correo',
        resultado: 'enviado',
        proveedor: proveedor.nombre,
        idProveedor,
        entregado: false,
        recuperable: null,
      });
      return { estado: 'enviada', intentos: intento };
    } catch (err) {
      const { recuperable, motivo } = clasificarError(err);
      ultimoError = motivo;
      await registrarIntento(tenant, {
        notificacionId: id,
        intento,
        canal: 'correo',
        resultado: 'fallido',
        proveedor: proveedor.nombre,
        recuperable,
        error: motivo,
      });

      // Un error permanente no se reintenta: quedaría en un bucle inútil.
      if (!recuperable) {
        await marcar(tenant, id, { estado: 'fallida', intentos: intento, error: ultimoError, proximo_intento_at: null });
        return { estado: 'fallida', intentos: intento, error: ultimoError };
      }

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
 * Reconstruye el mensaje de correo desde la orden y la plantilla. No se guarda el cuerpo en la cola.
 * @returns {Promise<{ mensaje: object, orden: object, cliente: object, establecimiento: object } | null>}
 */
async function reconstruirMensaje(tenant, fila) {
  const plantilla = PLANTILLAS[fila.evento];
  if (!plantilla || !fila.orden_id) return null;

  const { data: orden, error } = await tenant.listar('ordenes', COLUMNAS_ORDEN).eq('id', fila.orden_id).maybeSingle();
  if (error) throw error;
  if (!orden) return null;

  const vehiculo = orden.vehiculos ?? {};
  const cliente = vehiculo.clientes ?? null;
  if (!cliente) return null;

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
  return { mensaje, orden, cliente, vehiculo, establecimiento };
}

/** Texto del SMS alterno. Se reconstruye con los datos reales de la orden. */
async function reconstruirTextoSms(tenant, fila) {
  if (fila.contenido?.texto) return fila.contenido.texto;
  if (!fila.orden_id) return null;
  const { data: orden, error } = await tenant
    .listar('ordenes', 'id, total, vehiculos(placa), orden_servicios(precio, servicios(nombre))')
    .eq('id', fila.orden_id)
    .maybeSingle();
  if (error) throw error;
  if (!orden) return null;
  const { data: establecimiento } = await tenant.listar('establecimientos', 'nombre').maybeSingle();
  return textoAvisoListo({ establecimiento, placa: orden.vehiculos?.placa, total: orden.total });
}

/**
 * HU-34: crea el aviso alterno por SMS cuando el correo de "listo" agotó sus intentos.
 * Solo si el proveedor está configurado, el cliente tiene celular y no revocó los avisos.
 * La clave de deduplicación evita duplicados si el worker corre dos veces.
 */
export async function crearAlternoSms(tenant, fila, { ahora = new Date() } = {}) {
  if (fila.canal !== 'correo') return null;
  if (fila.evento !== EVENTOS.LISTA) return null;
  if (String(process.env.SMS_PROVEEDOR ?? 'consola').toLowerCase() === 'deshabilitado') return null;

  const datos = await reconstruirMensaje(tenant, fila);
  if (!datos) return null;
  const { orden, cliente, vehiculo, establecimiento } = datos;
  const telefono = String(cliente.telefono ?? '').replace(/\D/g, '');
  if (!telefono) return null;
  if (await avisosRevocados(tenant, cliente.id)) return null;

  const clave = `${orden.id}:${fila.evento}:sms`;
  const { data: existente, error: errorExistente } = await tenant
    .listar('notificaciones', 'id')
    .eq('clave_dedupe', clave)
    .maybeSingle();
  if (errorExistente) throw errorExistente;
  if (existente) return null;

  try {
    const creada = await tenant.crear('notificaciones', {
      cliente_id: cliente.id,
      orden_id: orden.id,
      tipo: 'operativa',
      evento: fila.evento,
      canal: 'sms',
      destino: cifrar(telefono),
      contenido: {
        asunto: 'Tu vehículo está listo',
        texto: textoAvisoListo({ establecimiento, placa: vehiculo.placa, total: orden.total }),
        alterno: true,
      },
      estado: 'pendiente',
      clave_dedupe: clave,
      notificacion_origen_id: fila.id,
      programada_para: ahora.toISOString(),
    }, 'id');
    return { id: creada.id, canal: 'sms' };
  } catch (err) {
    if (err?.codigo === 'CONFLICTO') return null;
    throw err;
  }
}

/**
 * HU-34: un solo intento del worker. Deja la fila pendiente con `proximo_intento_at` (reintento
 * recuperable) o fallida (permanente o sin intentos). Registra el intento y, al agotar el correo
 * de "listo", intenta el canal alterno.
 */
export async function enviarUnIntento(tenant, fila, { proveedor, proveedorSms: sms, ahora = new Date() } = {}) {
  const canal = fila.canal;
  const intento = Math.max(1, Number(fila.intentos ?? 0) + 1);
  const esperas = esperasConfiguradas();
  const destino = destinoPlano(fila.destino);

  const fallar = async (error, recuperable, extra = {}) => {
    const motivo = String(error?.message ?? error ?? 'Error del proveedor').slice(0, 500);
    const puedeReintentar = recuperable && intento < MAX_INTENTOS;
    const proximo = puedeReintentar
      ? new Date(ahora.getTime() + esperaExponencial(intento, esperas)).toISOString()
      : null;
    await marcar(tenant, fila.id, {
      estado: puedeReintentar ? 'pendiente' : 'fallida',
      intentos: intento,
      error: motivo,
      proximo_intento_at: proximo,
      ...extra,
    });
    await registrarIntento(tenant, {
      notificacionId: fila.id,
      intento,
      canal,
      resultado: 'fallido',
      proveedor: extra?.contenido?.proveedor ?? null,
      recuperable,
      error: motivo,
    });
    if (!puedeReintentar) {
      try {
        await crearAlternoSms(tenant, { ...fila, intentos: intento }, { ahora });
      } catch (err) {
        console.error('[HU-34] No se pudo crear el canal alterno:', err?.message ?? err);
      }
    }
    return { estado: puedeReintentar ? 'pendiente' : 'fallida', intentos: intento, error: motivo };
  };

  if (['enviada', 'entregada', 'cancelada'].includes(fila.estado)) {
    return { estado: fila.estado, intentos: Number(fila.intentos ?? 0), omitida: true };
  }

  if (canal === 'push') {
    const error = new Error('El canal push no está configurado en este ambiente');
    error.recuperable = false;
    return fallar(error, false);
  }

  if (canal === 'correo') {
    if (!destino) {
      const error = new Error('La notificación no tiene un correo de destino válido');
      error.recuperable = false;
      return fallar(error, false);
    }
    let datos;
    try {
      datos = await reconstruirMensaje(tenant, fila);
    } catch (err) {
      return fallar(err, true);
    }
    if (!datos) {
      const error = new Error('No se pudo reconstruir el mensaje: la orden o el cliente ya no existen');
      error.recuperable = false;
      return fallar(error, false);
    }
    const proveedorCorreoElegido = proveedor ?? proveedorCorreo();
    try {
      const { idProveedor } = await conTiempoMaximo(proveedorCorreoElegido.enviar({ para: destino, ...datos.mensaje }));
      await marcar(tenant, fila.id, {
        estado: 'enviada',
        intentos: intento,
        error: null,
        proximo_intento_at: null,
        contenido: {
          ...(fila.contenido ?? {}),
          asunto: datos.mensaje.asunto,
          proveedor: proveedorCorreoElegido.nombre,
          idProveedor: idProveedor ?? null,
          aceptadaAt: ahora.toISOString(),
          entregaConfirmada: false,
        },
      });
      await registrarIntento(tenant, {
        notificacionId: fila.id,
        intento,
        canal: 'correo',
        resultado: 'enviado',
        proveedor: proveedorCorreoElegido.nombre,
        idProveedor,
        entregado: false,
      });
      return { estado: 'enviada', intentos: intento };
    } catch (err) {
      const { recuperable } = clasificarError(err);
      return fallar(err, recuperable, {
        contenido: { ...(fila.contenido ?? {}), proveedor: proveedorCorreoElegido.nombre },
      });
    }
  }

  if (canal === 'sms') {
    if (!destino) {
      const error = new Error('La notificación no tiene un celular de destino válido');
      error.recuperable = false;
      return fallar(error, false);
    }
    const proveedorSmsElegido = sms ?? proveedorSms();
    let texto;
    try {
      texto = await reconstruirTextoSms(tenant, fila);
    } catch (err) {
      return fallar(err, true);
    }
    if (!texto) {
      const error = new Error('No se pudo reconstruir el mensaje SMS: la orden ya no existe');
      error.recuperable = false;
      return fallar(error, false);
    }
    try {
      const { idProveedor } = await conTiempoMaximo(proveedorSmsElegido.enviar({ para: destino, texto }));
      await marcar(tenant, fila.id, {
        estado: 'enviada',
        intentos: intento,
        error: null,
        proximo_intento_at: null,
        contenido: {
          ...(fila.contenido ?? {}),
          texto,
          proveedor: proveedorSmsElegido.nombre,
          idProveedor: idProveedor ?? null,
          aceptadaAt: ahora.toISOString(),
          entregaConfirmada: false,
        },
      });
      await registrarIntento(tenant, {
        notificacionId: fila.id,
        intento,
        canal: 'sms',
        resultado: 'enviado',
        proveedor: proveedorSmsElegido.nombre,
        idProveedor,
        entregado: false,
      });
      return { estado: 'enviada', intentos: intento };
    } catch (err) {
      const { recuperable } = clasificarError(err);
      return fallar(err, recuperable, {
        contenido: { ...(fila.contenido ?? {}), proveedor: proveedorSmsElegido.nombre },
      });
    }
  }

  const error = new Error(`Canal de notificación desconocido: ${canal}`);
  error.recuperable = false;
  return fallar(error, false);
}

/**
 * HU-34: procesa la cola persistente. Reclama cada fila con una actualización condicional para que
 * dos workers no la envíen a la vez. `db` debe ser el cliente con service_role (worker del servidor).
 * @returns {Promise<Array<{ id: string, estado: string, intentos: number }>>}
 */
export async function procesarCola(db, { limite = 20, ahora = new Date(), proveedor, proveedorSms: sms } = {}) {
  const iso = ahora.toISOString();
  const { data: vencidas, error } = await db
    .from('notificaciones')
    .select('*')
    .in('estado', ['pendiente', 'programada'])
    .lte('programada_para', iso)
    .or(`proximo_intento_at.is.null,proximo_intento_at.lte.${iso}`)
    .order('programada_para', { ascending: true })
    .limit(limite);
  if (error) throw error;

  const resultados = [];
  for (const fila of vencidas ?? []) {
    // Reclamo atómico: solo el worker que logra cambiar el estado desde pendiente/programada envía.
    const { data: reclamada, error: errorReclamo } = await db
      .from('notificaciones')
      .update({ estado: 'enviando' })
      .eq('id', fila.id)
      .in('estado', ['pendiente', 'programada'])
      .select('*')
      .maybeSingle();
    if (errorReclamo) {
      console.error('[HU-34] No se pudo reclamar la notificación:', errorReclamo.message);
      continue;
    }
    if (!reclamada) continue; // otro worker ya la tomó

    const tenant = crearAccesoTenant(db, { establecimientoId: reclamada.establecimiento_id });
    try {
      const resultado = await enviarUnIntento(tenant, reclamada, { proveedor, proveedorSms: sms, ahora });
      resultados.push({ id: reclamada.id, ...resultado });
    } catch (err) {
      console.error(`[HU-34] Error inesperado al enviar ${reclamada.id}:`, err?.message ?? err);
      // No se pierde: vuelve a la cola con una espera acotada y el error visible en la bitácora.
      await marcar(tenant, reclamada.id, {
        estado: 'pendiente',
        intentos: Math.max(1, Number(reclamada.intentos ?? 0) + 1),
        error: String(err?.message ?? err).slice(0, 500),
        proximo_intento_at: new Date(ahora.getTime() + esperaExponencial(1, esperasConfiguradas())).toISOString(),
      });
    }
  }
  return resultados;
}

/**
 * Compatibilidad con los controladores existentes del proyecto actual.
 * `ingreso` y `listo` se traducen al nuevo outbox.
 *
 * Con el worker activo (producción/desarrollo) el envío queda solo en la cola, para que no haya dos
 * envíos del mismo mensaje. En pruebas o con NOTIFICACIONES_WORKER=off se envía en segundo plano.
 */
export async function programarNotificacion(tenant, ordenId, tipo) {
  const evento = tipo === 'ingreso' ? EVENTOS.RECIBIDA : EVENTOS.LISTA;
  const preparado = await prepararCorreo(tenant, { evento, ordenId });
  const workerActivo = process.env.NODE_ENV !== 'test' && String(process.env.NOTIFICACIONES_WORKER ?? 'on') !== 'off';
  if (preparado.resumen.estado === 'pendiente' && !workerActivo) enSegundoPlano(preparado.enviar);
  return preparado.resumen;
}

/** Adaptador para pruebas/integraciones antiguas que ejecutan el envío de forma síncrona. */
export async function notificarOrden(tenant, ordenId, tipo, { enviar } = {}) {
  const evento = tipo === 'ingreso' ? EVENTOS.RECIBIDA : EVENTOS.LISTA;
  const proveedor = enviar ? {
    nombre: 'prueba',
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
