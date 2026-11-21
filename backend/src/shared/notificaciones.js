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
//
// HU-33 (reintento y canal alterno):
//   CA1: un intento inicial y hasta 3 reintentos a 1, 2 y 4 minutos, en cualquier canal (correo,
//        SMS o push). Un canal que no está disponible (push sin HU-40) falla sin reintentar.
//   CA2: si se agotan los intentos de un aviso "listo", se crea el aviso por el siguiente canal del
//        cliente que no se haya intentado (push → SMS → correo), con destino registrado y la
//        autorización de avisos vigente (HU-30). Cada alterno tiene su propia clave anti-duplicados.
//   CA3: si ya no queda canal, la fila queda con `fallo_definitivo_at` y aparece como alerta en el
//        dashboard (GET /notificaciones/fallidas) con la placa y el celular del cliente.
//   CA4: un alterno no se crea ni se envía si otro mensaje de la misma cadena ya fue aceptado o
//        entregado; los proveedores reciben una referencia estable para no duplicar un reintento, y
//        la confirmación tardía de entrega (webhooks) cancela lo pendiente (shared/confirmacionEntrega.js).
//
// Todo acceso a datos pasa por el acceso del tenant (HU-41). El destino se guarda cifrado (HU-50).
import { cifrar, descifrar, estaCifrado } from './cifrado.js';
import { proveedorCorreo, conTiempoMaximo, enmascararCorreo } from './correo.js';
import { proveedorSms, textoAvisoListo } from './proveedorSms.js';
import { proveedorPush } from './proveedorPush.js';
import { clasificarError, esperaExponencial, esperasConfiguradas } from './reintentos.js';
import { PLANTILLAS } from './plantillasCorreo.js';
import { enlaceBaja, puedeRecibir, TIPOS } from './autorizaciones.js';
import { crearAccesoTenant } from './tenant.js';

export const EVENTOS = { RECIBIDA: 'orden.recibida', LISTA: 'orden.lista' };
/** HU-33 CA1: el intento inicial más 3 reintentos (1, 2 y 4 minutos). */
export const MAX_REINTENTOS = 3;
export const MAX_INTENTOS = MAX_REINTENTOS + 1;
const ESPERAS_MS = [2_000, 4_000]; // compatibilidad del envío inmediato (HU-46)

const COLUMNAS_ORDEN =
  'id, estado, subtotal, descuento, total, created_at, codigo_seguimiento, vehiculos(placa, clientes(id, nombre, correo, telefono)), orden_servicios(precio, servicios(nombre))';

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const resumen = (estado, extra = {}) => ({ canal: 'correo', estado, ...extra });
const ahoraIso = () => new Date().toISOString();

/** HU-30 CA3: enlace "dejar de recibir estos avisos". Si no se puede firmar, el correo sale sin él. */
function enlaceDeBaja(tenant, clienteId) {
  try {
    return enlaceBaja({ establecimientoId: tenant.establecimientoId, clienteId, tipo: TIPOS.servicio });
  } catch {
    return null;
  }
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

    // HU-30: solo se envía si el titular autorizó los avisos del servicio y no los revocó.
    if (!(await puedeRecibir(tenant, cliente.id, TIPOS.servicio))) {
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
      enlaceBaja: enlaceDeBaja(tenant, cliente.id),
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
      const { idProveedor } = await conTiempoMaximo(proveedor.enviar({ para, ...mensaje, referencia: id }), tiempoMaximo);
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

/** Texto corto de un aviso por SMS o push. Se reconstruye con los datos reales de la orden. */
async function reconstruirTextoCorto(tenant, fila) {
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

/** Estados en los que el proveedor ya tiene el mensaje: no se debe enviar otro de la misma cadena. */
const ACEPTADAS = new Set(['enviada', 'entregada']);
const EN_CURSO = new Set(['programada', 'pendiente', 'enviando']);

/** HU-33 CA2: orden en que se prueban los canales alternos. */
export const ORDEN_CANALES = ['push', 'sms', 'correo'];

/** Id del aviso original de una cadena (el original y sus alternos comparten este id). */
export const origenDe = (fila) => fila.notificacion_origen_id ?? fila.id;

/** El original y todos sus alternos. */
export async function cadenaDe(tenant, fila) {
  const origen = origenDe(fila);
  const { data, error } = await tenant
    .listar('notificaciones', 'id, canal, estado')
    .or(`id.eq.${origen},notificacion_origen_id.eq.${origen}`);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * HU-33 CA2: canales por los que se le puede avisar al cliente, en orden de preferencia.
 * - push: lo agrega HU-40 cuando el dispositivo quede registrado; hasta entonces no hay destino.
 * - sms: celular registrado (es obligatorio al crear el cliente) y SMS no deshabilitado.
 * - correo: correo registrado.
 * Cuando HU-29 guarde las preferencias del cliente, se filtran aquí.
 */
function canalesDisponibles(cliente) {
  const canales = [];
  const telefono = String(cliente.telefono ?? '').replace(/\D/g, '');
  const smsHabilitado = String(process.env.SMS_PROVEEDOR ?? 'consola').toLowerCase() !== 'deshabilitado';
  if (telefono && smsHabilitado) canales.push({ canal: 'sms', destino: telefono });
  const correo = cliente.correo ? destinoPlano(cliente.correo).trim() : '';
  if (correo) canales.push({ canal: 'correo', destino: correo });
  return canales.sort((a, b) => ORDEN_CANALES.indexOf(a.canal) - ORDEN_CANALES.indexOf(b.canal));
}

/**
 * HU-33 CA2: al agotar los intentos de un aviso "listo", crea el aviso por el siguiente canal del
 * cliente que todavía no se haya intentado en la cadena.
 * @returns {Promise<{ id: string, canal: string } | { sinAlterno: 'no_aplica'|'revocado'|'entregada'|'en_curso'|'sin_canales'|'duplicado' }>}
 */
export async function crearAlterno(tenant, fila, { ahora = new Date() } = {}) {
  if (fila.evento !== EVENTOS.LISTA) return { sinAlterno: 'no_aplica' };

  const datos = await reconstruirMensaje(tenant, fila);
  if (!datos) return { sinAlterno: 'no_aplica' };
  const { orden, cliente, vehiculo, establecimiento } = datos;

  // HU-30: el canal alterno sigue la misma regla que el original.
  if (!(await puedeRecibir(tenant, cliente.id, TIPOS.servicio))) return { sinAlterno: 'revocado' };

  const cadena = await cadenaDe(tenant, fila);
  // CA4: si otro mensaje de la cadena ya llegó al proveedor, el cliente ya tiene el aviso.
  if (cadena.some((f) => f.id !== fila.id && ACEPTADAS.has(f.estado))) return { sinAlterno: 'entregada' };

  const usados = new Set([fila.canal, ...cadena.map((f) => f.canal)]);
  const siguiente = canalesDisponibles(cliente).find((c) => !usados.has(c.canal));
  if (!siguiente) {
    // Si otro canal de la cadena todavía está en curso, aún no es un fallo definitivo.
    const enCurso = cadena.some((f) => f.id !== fila.id && EN_CURSO.has(f.estado));
    return { sinAlterno: enCurso ? 'en_curso' : 'sin_canales' };
  }

  const asunto = 'Tu vehículo está listo';
  const contenido = siguiente.canal === 'correo'
    ? { asunto, alterno: true }
    : { asunto, texto: textoAvisoListo({ establecimiento, placa: vehiculo.placa, total: orden.total }), alterno: true };

  try {
    const creada = await tenant.crear('notificaciones', {
      cliente_id: cliente.id,
      orden_id: orden.id,
      tipo: 'operativa',
      evento: fila.evento,
      canal: siguiente.canal,
      destino: cifrar(siguiente.destino),
      contenido,
      estado: 'pendiente',
      clave_dedupe: `${orden.id}:${fila.evento}:${siguiente.canal}`,
      notificacion_origen_id: origenDe(fila),
      programada_para: ahora.toISOString(),
    }, 'id');
    return { id: creada.id, canal: siguiente.canal };
  } catch (err) {
    // La clave anti-duplicados ya existe: otro worker creó este alterno.
    if (err?.codigo === 'CONFLICTO') return { sinAlterno: 'duplicado' };
    throw err;
  }
}

/** Compatibilidad con HU-34: el alterno del correo de "listo" sigue siendo el SMS. */
export async function crearAlternoSms(tenant, fila, opciones) {
  const resultado = await crearAlterno(tenant, fila, opciones);
  return resultado.id ? resultado : null;
}

/** Proveedor del canal: los inyectados (pruebas) o el configurado en el ambiente. */
function proveedorDe(canal, { proveedor, proveedorSms: sms, proveedorPush: push }) {
  if (canal === 'correo') return proveedor ?? proveedorCorreo();
  if (canal === 'sms') return sms ?? proveedorSms();
  if (canal === 'push') return push ?? proveedorPush();
  return null;
}

/** Arma lo que recibe el proveedor de cada canal. Devuelve null si la orden ya no existe. */
async function armarEnvio(tenant, fila, destino) {
  if (fila.canal === 'correo') {
    const datos = await reconstruirMensaje(tenant, fila);
    if (!datos) return null;
    return { envio: { para: destino, ...datos.mensaje }, asunto: datos.mensaje.asunto };
  }
  const texto = await reconstruirTextoCorto(tenant, fila);
  if (!texto) return null;
  return { envio: { para: destino, asunto: fila.contenido?.asunto ?? 'Tu vehículo está listo', texto }, asunto: fila.contenido?.asunto, texto };
}

const SIN_DESTINO = {
  correo: 'La notificación no tiene un correo de destino válido',
  sms: 'La notificación no tiene un celular de destino válido',
  push: 'La notificación no tiene un dispositivo registrado',
};

/**
 * Un solo intento del worker. Deja la fila pendiente con `proximo_intento_at` (reintento
 * recuperable) o fallida (permanente o sin intentos). Registra el intento (HU-34) y, al agotar un
 * aviso "listo", crea el canal alterno o marca el fallo definitivo (HU-33).
 */
export async function enviarUnIntento(tenant, fila, opciones = {}) {
  const { ahora = new Date() } = opciones;
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
    if (!puedeReintentar) await despuesDeFallar(tenant, { ...fila, intentos: intento }, ahora);
    return { estado: puedeReintentar ? 'pendiente' : 'fallida', intentos: intento, error: motivo };
  };

  if (['enviada', 'entregada', 'cancelada'].includes(fila.estado)) {
    return { estado: fila.estado, intentos: Number(fila.intentos ?? 0), omitida: true };
  }

  // CA4: un alterno no sale si el original (u otro alterno) ya llegó, aunque haya sido tarde.
  if (fila.notificacion_origen_id) {
    const cadena = await cadenaDe(tenant, fila);
    if (cadena.some((f) => f.id !== fila.id && ACEPTADAS.has(f.estado))) {
      await marcar(tenant, fila.id, { estado: 'cancelada', error: 'El aviso ya se entregó por otro canal', proximo_intento_at: null });
      return { estado: 'cancelada', intentos: Number(fila.intentos ?? 0), omitida: true };
    }
  }

  const proveedor = proveedorDe(canal, opciones);
  if (!proveedor) {
    const error = new Error(`Canal de notificación desconocido: ${canal}`);
    error.recuperable = false;
    return fallar(error, false);
  }
  if (!destino) {
    const error = new Error(SIN_DESTINO[canal]);
    error.recuperable = false;
    return fallar(error, false);
  }

  let armado;
  try {
    armado = await armarEnvio(tenant, fila, destino);
  } catch (err) {
    return fallar(err, true);
  }
  if (!armado) {
    const error = new Error('No se pudo reconstruir el mensaje: la orden o el cliente ya no existen');
    error.recuperable = false;
    return fallar(error, false);
  }

  try {
    // `referencia` es estable entre reintentos: el proveedor que la soporta no duplica el mensaje (CA4).
    const { idProveedor } = await conTiempoMaximo(proveedor.enviar({ ...armado.envio, referencia: fila.id }));
    await marcar(tenant, fila.id, {
      estado: 'enviada',
      intentos: intento,
      error: null,
      proximo_intento_at: null,
      contenido: {
        ...(fila.contenido ?? {}),
        ...(armado.asunto ? { asunto: armado.asunto } : {}),
        ...(armado.texto ? { texto: armado.texto } : {}),
        proveedor: proveedor.nombre,
        idProveedor: idProveedor ?? null,
        aceptadaAt: ahora.toISOString(),
        entregaConfirmada: false,
      },
    });
    await registrarIntento(tenant, {
      notificacionId: fila.id,
      intento,
      canal,
      resultado: 'enviado',
      proveedor: proveedor.nombre,
      idProveedor,
      entregado: false,
    });
    return { estado: 'enviada', intentos: intento };
  } catch (err) {
    const { recuperable } = clasificarError(err);
    return fallar(err, recuperable, {
      contenido: { ...(fila.contenido ?? {}), proveedor: proveedor.nombre },
    });
  }
}

/**
 * HU-33: una fila que ya no se reintenta. Si es un aviso "listo", se intenta el canal alterno (CA2)
 * y, si no queda ninguno, queda como fallo definitivo para la alerta del dashboard (CA3).
 */
async function despuesDeFallar(tenant, fila, ahora) {
  if (fila.evento !== EVENTOS.LISTA) return;
  try {
    const alterno = await crearAlterno(tenant, fila, { ahora });
    if (alterno.sinAlterno === 'sin_canales') {
      await marcar(tenant, fila.id, { fallo_definitivo_at: ahora.toISOString() });
      console.warn(`[HU-33] Aviso ${fila.id} falló en todos los canales: queda como alerta en el dashboard.`);
    }
  } catch (err) {
    console.error('[HU-33] No se pudo crear el canal alterno:', err?.message ?? err);
  }
}

/**
 * HU-34: procesa la cola persistente. Reclama cada fila con una actualización condicional para que
 * dos workers no la envíen a la vez. `db` debe ser el cliente con service_role (worker del servidor).
 * @returns {Promise<Array<{ id: string, estado: string, intentos: number }>>}
 */
export async function procesarCola(db, { limite = 20, ahora = new Date(), proveedor, proveedorSms: sms, proveedorPush: push } = {}) {
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
      const resultado = await enviarUnIntento(tenant, reclamada, { proveedor, proveedorSms: sms, proveedorPush: push, ahora });
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
