// HU-29 — Selección del canal de notificación preferido (RF-F6-07 a RF-F6-10).
//
// El cliente final elige desde la app por cuáles canales quiere recibir los avisos de su servicio:
// push, sms y correo.
//   CA1: `obtenerPreferencias` devuelve cada canal con su estado actual (activo/inactivo).
//   CA2: el SMS solo se activa con un celular validado con un código de 6 dígitos
//        (`solicitarCodigo` + `confirmarCodigo`). El código vence, tiene intentos limitados y solo se
//        guarda su hash.
//   CA3: si se desactivan todos los canales hay que confirmar la decisión (`confirmarSinCanales`).
//   CA4: el motor de envío (shared/notificaciones.js) consulta `canalesActivos` antes de cada despacho.
//
// Un cliente sin preferencias guardadas conserva el comportamiento anterior: recibe por correo.
// El cliente y el establecimiento salen del pase firmado (shared/paseCliente.js), nunca de la petición.
import { createHmac, hkdfSync, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError, noEncontrado } from './errores.js';
import { conTiempoMaximo } from './correo.js';
import { descifrar } from './cifrado.js';
import { enmascararCelular, enmascararCorreo } from './mascaras.js';
import { proveedorSms, smsDisponible, textoCodigoVerificacion } from './proveedorSms.js';

export const CANALES = ['push', 'sms', 'correo'];
/** Sin preferencias guardadas el cliente sigue recibiendo el correo, como antes de HU-29. */
export const POR_DEFECTO = { push: false, sms: false, correo: true };

export const VIGENCIA_CODIGO_MIN = 10;
export const MAX_INTENTOS_CODIGO = 5;
export const ESPERA_REENVIO_MS = 60_000;
export const MAX_CODIGOS_POR_HORA = 3;

const HORA_MS = 60 * 60 * 1000;
const CELULAR = /^3\d{9}$/;

const COLUMNAS_FILA =
  'id, canal_push, canal_sms, canal_correo, telefono_sms, telefono_sms_verificado_at';

const noVacio = (valor) => String(valor ?? '').replace(/\D/g, '');
const celularLimpio = (valor) => {
  let digitos = noVacio(valor);
  if (digitos.length === 12 && digitos.startsWith('57')) digitos = digitos.slice(2);
  return CELULAR.test(digitos) ? digitos : null;
};

/** Descifra el correo del cliente tolerando filas antiguas en texto plano. */
function correoPlano(valor) {
  if (!valor) return '';
  try {
    return String(descifrar(valor) ?? '').trim();
  } catch {
    return String(valor).trim();
  }
}

/**
 * Push depende del registro del dispositivo (HU-40). Mientras no exista, no se ofrece: guardarlo como
 * activo haría que el cliente creyera que recibe avisos que nadie envía.
 * HU-40 reemplaza esta función por la consulta de la suscripción del dispositivo del cliente.
 */
export async function pushDisponible() {
  return false;
}

async function leerFila(tenant, clienteId) {
  const { data, error } = await tenant
    .listar('preferencias_notificacion', COLUMNAS_FILA)
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) throw error;
  return data && !Array.isArray(data) ? data : null;
}

async function leerCliente(tenant, clienteId) {
  const { data, error } = await tenant.listar('clientes', 'id, correo, telefono').eq('id', clienteId).maybeSingle();
  if (error) throw error;
  if (!data) throw noEncontrado('Cliente');
  return data;
}

const celularVerificado = (fila) => Boolean(fila?.telefono_sms && fila?.telefono_sms_verificado_at);

/** Estado de cada canal de una fila de preferencias (o el estado por defecto si no hay fila). */
function estadoDe(fila) {
  if (!fila) return { ...POR_DEFECTO };
  return { push: fila.canal_push, sms: fila.canal_sms, correo: fila.canal_correo };
}

/** CA1: lo que ve el cliente. Los destinos viajan siempre enmascarados. */
async function vistaDe(fila, cliente) {
  const estado = estadoDe(fila);
  const correo = correoPlano(cliente.correo);
  const registrado = celularLimpio(cliente.telefono);
  return {
    canales: {
      push: { activo: estado.push, disponible: await pushDisponible() },
      sms: {
        activo: estado.sms,
        disponible: smsDisponible(),
        verificado: celularVerificado(fila),
        celular: fila?.telefono_sms ? enmascararCelular(fila.telefono_sms) : null,
        celularRegistrado: registrado ? enmascararCelular(registrado) : null,
      },
      correo: {
        activo: estado.correo,
        disponible: Boolean(correo),
        destino: correo ? enmascararCorreo(correo) : null,
      },
    },
    sinCanales: !estado.push && !estado.sms && !estado.correo,
  };
}

/** CA1: canales con su estado actual para la pantalla "preferencias de notificación". */
export async function obtenerPreferencias(tenant, clienteId) {
  const [fila, cliente] = await Promise.all([leerFila(tenant, clienteId), leerCliente(tenant, clienteId)]);
  return vistaDe(fila, cliente);
}

/**
 * CA4: canales por los que se debe enviar la próxima notificación. Nunca lanza: si no se pueden leer
 * las preferencias (p. ej. la migración todavía no está aplicada) se usa el comportamiento anterior y
 * el aviso sale por correo en lugar de perderse.
 * @returns {Promise<{ guardadas: boolean, correo: boolean, sms: boolean, push: boolean, telefonoSms: string|null }>}
 */
export async function canalesActivos(tenant, clienteId) {
  try {
    const fila = await leerFila(tenant, clienteId);
    const estado = estadoDe(fila);
    const telefonoSms = celularVerificado(fila) ? fila.telefono_sms : null;
    return {
      guardadas: Boolean(fila),
      correo: estado.correo,
      // El SMS solo sale si el celular quedó validado, aunque la casilla esté activa.
      sms: estado.sms && Boolean(telefonoSms),
      push: estado.push,
      telefonoSms,
    };
  } catch (err) {
    console.warn('[HU-29] No se pudieron leer las preferencias de canal; se usa el correo:', err?.message ?? err);
    return { guardadas: false, ...POR_DEFECTO, telefonoSms: null };
  }
}

const SIN_CANALES =
  'Si desactivas todos los canales no recibirás avisos del estado de tu vehículo. Confirma si quieres continuar';

/**
 * CA2 + CA3: guarda los canales elegidos.
 * @param {{ push: boolean, sms: boolean, correo: boolean, confirmarSinCanales?: boolean }} entrada
 */
export async function guardarPreferencias(tenant, clienteId, entrada, { ahora = new Date() } = {}) {
  const [fila, cliente] = await Promise.all([leerFila(tenant, clienteId), leerCliente(tenant, clienteId)]);
  const nuevo = { push: entrada.push === true, sms: entrada.sms === true, correo: entrada.correo === true };

  if (nuevo.push && !(await pushDisponible(tenant, clienteId))) {
    throw new AppError('VALIDACION', 'El canal push todavía no está disponible', [
      { campo: 'push', mensaje: 'Aún no puedes recibir avisos push. Elige sms o correo' },
    ]);
  }
  if (nuevo.sms) {
    if (!smsDisponible()) {
      throw new AppError('VALIDACION', 'El canal sms no está disponible en este momento', [
        { campo: 'sms', mensaje: 'Por ahora no enviamos avisos por sms. Elige correo' },
      ]);
    }
    // CA2: sin celular registrado y validado no se activa el canal.
    if (!celularVerificado(fila)) {
      throw new AppError('VALIDACION', 'Valida tu celular para activar el canal sms', [
        { campo: 'sms', mensaje: 'Registra tu celular y valídalo con el código de 6 dígitos', requiere: 'verificar_celular' },
      ]);
    }
  }
  if (nuevo.correo && !correoPlano(cliente.correo)) {
    throw new AppError('VALIDACION', 'No tienes un correo registrado', [
      { campo: 'correo', mensaje: 'No tienes un correo registrado. Pídele al car wash que lo agregue' },
    ]);
  }
  // CA3: dejar al cliente sin avisos tiene que ser una decisión confirmada.
  if (!nuevo.push && !nuevo.sms && !nuevo.correo && entrada.confirmarSinCanales !== true) {
    throw new AppError('CONFLICTO', SIN_CANALES, [
      { campo: 'canales', mensaje: SIN_CANALES, requiereConfirmacion: true },
    ]);
  }

  const valores = {
    canal_push: nuevo.push,
    canal_sms: nuevo.sms,
    canal_correo: nuevo.correo,
    updated_at: ahora.toISOString(),
  };
  const guardada = fila
    ? await tenant.actualizar('preferencias_notificacion', fila.id, valores, COLUMNAS_FILA, 'Preferencias')
    : await tenant.crear('preferencias_notificacion', { cliente_id: clienteId, ...valores }, COLUMNAS_FILA);
  return vistaDe(guardada ?? { ...fila, ...valores }, cliente);
}

// ---------------------------------------------------------------------------
// CA2 · Validación del celular con un código de 6 dígitos
// ---------------------------------------------------------------------------

/** Clave del HMAC derivada de la del servidor (no se reutiliza la de cifrado directamente). */
function claveCodigo() {
  const valor = process.env.ZARU_CLAVE_CIFRADO;
  const base = valor ? Buffer.from(valor, 'base64') : null;
  if (!base || base.length !== 32) throw new Error('ZARU_CLAVE_CIFRADO no está configurada o no es una clave de 32 bytes en base64');
  return Buffer.from(hkdfSync('sha256', base, Buffer.from('zaru'), Buffer.from('hu29-codigo-sms-v1'), 32));
}

/** Hash del código ligado al cliente y al celular: un código no sirve para otro cliente ni otro número. */
export function hashCodigo(clienteId, telefono, codigo) {
  return createHmac('sha256', claveCodigo()).update(`${clienteId}:${telefono}:${codigo}`).digest('hex');
}

export const generarCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const iguales = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * CA2: envía por SMS un código de 6 dígitos al celular que el cliente quiere usar. Si no indica uno, se
 * usa el celular con el que está registrado. Límites: una solicitud por minuto y 3 por hora.
 * El código nunca se devuelve en la respuesta.
 * @param {{ celular?: string }} entrada celular ya normalizado a 10 dígitos
 */
export async function solicitarCodigo(
  tenant,
  clienteId,
  { celular } = {},
  { ahora = new Date(), proveedor, generar = generarCodigo } = {},
) {
  if (!smsDisponible()) {
    throw new AppError('VALIDACION', 'El canal sms no está disponible en este momento', [
      { campo: 'sms', mensaje: 'Por ahora no enviamos avisos por sms. Elige correo' },
    ]);
  }
  const cliente = await leerCliente(tenant, clienteId);
  const telefono = celular ?? celularLimpio(cliente.telefono);
  if (!telefono) {
    throw new AppError('VALIDACION', 'Registra un celular válido', [
      { campo: 'celular', mensaje: 'Escribe tu celular de 10 dígitos, por ejemplo 3001234567' },
    ]);
  }

  const { data: recientes, error } = await tenant
    .listar('verificaciones_sms', 'created_at')
    .eq('cliente_id', clienteId)
    .gte('created_at', new Date(ahora.getTime() - HORA_MS).toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ultimo = recientes?.[0];
  if (ultimo) {
    const faltanMs = ESPERA_REENVIO_MS - (ahora.getTime() - new Date(ultimo.created_at).getTime());
    if (faltanMs > 0) {
      throw new AppError('LIMITE_EXCEDIDO', `Espera ${Math.ceil(faltanMs / 1000)} segundos antes de pedir otro código`);
    }
  }
  if ((recientes?.length ?? 0) >= MAX_CODIGOS_POR_HORA) {
    throw new AppError('LIMITE_EXCEDIDO', 'Pediste demasiados códigos. Inténtalo de nuevo en una hora');
  }

  const codigo = generar();
  const expiraEn = new Date(ahora.getTime() + VIGENCIA_CODIGO_MIN * 60_000);
  const fila = await tenant.crear('verificaciones_sms', {
    cliente_id: clienteId,
    telefono,
    codigo_hash: hashCodigo(clienteId, telefono, codigo),
    expira_at: expiraEn.toISOString(),
  }, 'id');

  try {
    const sms = proveedor ?? proveedorSms();
    await conTiempoMaximo(sms.enviar({ para: telefono, texto: textoCodigoVerificacion(codigo, VIGENCIA_CODIGO_MIN) }));
  } catch (err) {
    console.error('[HU-29] No se pudo enviar el código de verificación:', err?.message ?? err);
    // El código que no salió no debe quedar vigente.
    await tenant
      .actualizar('verificaciones_sms', fila.id, { usado_at: ahora.toISOString() }, 'id', 'Verificación')
      .catch(() => {});
    throw new AppError('ERROR_INTERNO', 'No pudimos enviar el código por SMS. Inténtalo de nuevo en unos minutos');
  }

  return {
    enviado: true,
    celular: enmascararCelular(telefono),
    expiraEn: expiraEn.toISOString(),
    reenvioEn: new Date(ahora.getTime() + ESPERA_REENVIO_MS).toISOString(),
  };
}

/**
 * CA2: valida el código de 6 dígitos. Si es correcto, el celular queda verificado y el canal sms puede
 * activarse al guardar las preferencias. Tras 5 intentos fallidos hay que pedir un código nuevo.
 */
export async function confirmarCodigo(tenant, clienteId, { codigo }, { ahora = new Date() } = {}) {
  const { data, error } = await tenant
    .listar('verificaciones_sms', 'id, telefono, codigo_hash, intentos, expira_at')
    .eq('cliente_id', clienteId)
    .is('usado_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const verificacion = data?.[0];

  if (!verificacion || new Date(verificacion.expira_at).getTime() <= ahora.getTime()) {
    throw new AppError('VALIDACION', 'El código venció o no existe', [
      { campo: 'codigo', mensaje: 'El código venció. Pide uno nuevo' },
    ]);
  }

  const cerrar = (cambios) =>
    tenant.actualizar('verificaciones_sms', verificacion.id, cambios, 'id', 'Verificación', {
      // Si otra petición cambió los intentos mientras tanto, esta no se aplica: evita adivinar en paralelo.
      intentos: verificacion.intentos,
    });
  const intentoConcurrente = () => new AppError('CONFLICTO', 'Tu solicitud se cruzó con otra. Inténtalo de nuevo');

  if (verificacion.intentos >= MAX_INTENTOS_CODIGO) {
    throw new AppError('LIMITE_EXCEDIDO', 'Superaste los intentos permitidos. Pide un código nuevo');
  }

  if (!iguales(hashCodigo(clienteId, verificacion.telefono, codigo), verificacion.codigo_hash)) {
    const intentos = verificacion.intentos + 1;
    try {
      await cerrar({ intentos, ...(intentos >= MAX_INTENTOS_CODIGO ? { usado_at: ahora.toISOString() } : {}) });
    } catch (err) {
      if (err?.codigo === 'NO_ENCONTRADO') throw intentoConcurrente();
      throw err;
    }
    if (intentos >= MAX_INTENTOS_CODIGO) {
      throw new AppError('LIMITE_EXCEDIDO', 'Superaste los intentos permitidos. Pide un código nuevo');
    }
    const restantes = MAX_INTENTOS_CODIGO - intentos;
    throw new AppError('VALIDACION', 'El código no es correcto', [
      { campo: 'codigo', mensaje: `El código no es correcto. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}` },
    ]);
  }

  try {
    await cerrar({ usado_at: ahora.toISOString() });
  } catch (err) {
    if (err?.codigo === 'NO_ENCONTRADO') throw intentoConcurrente();
    throw err;
  }

  const [fila, cliente] = await Promise.all([leerFila(tenant, clienteId), leerCliente(tenant, clienteId)]);
  const verificado = { telefono_sms: verificacion.telefono, telefono_sms_verificado_at: ahora.toISOString(), updated_at: ahora.toISOString() };
  const guardada = fila
    ? await tenant.actualizar('preferencias_notificacion', fila.id, verificado, COLUMNAS_FILA, 'Preferencias')
    : await tenant.crear('preferencias_notificacion', { cliente_id: clienteId, ...verificado }, COLUMNAS_FILA);
  return vistaDe(guardada ?? { ...fila, ...verificado }, cliente);
}
