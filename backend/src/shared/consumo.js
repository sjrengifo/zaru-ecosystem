// HU-39 (ZARU-28) — Contabilidad de consumo de notificaciones por plan.
//
// Fuentes de verdad:
//   - `public.planes`: cupos mensuales configurables (DA-12). Ningún número vivo aquí.
//   - `public.consumo_mensual`: acumulado real por establecimiento, mes (America/Bogota) y canal.
//   - `public.consumo_reservas`: idempotencia de cada envío entre reintentos y workers.
//
// Reglas:
//   - Solo el SMS está limitado. Correo y push se contabilizan, pero nunca bloquean un aviso
//     operativo: el cupo agotado debe cambiar el canal, no callar a ZARU (CA2).
//   - `cantidad` se incrementa ÚNICAMENTE cuando el proveedor aceptó el mensaje. El worker aparta
//     una reserva antes de enviar y la libera si el proveedor falla.
//   - El tenant siempre sale del contexto de sesión (`tenant.rpc`, `tenant.listar`), nunca del
//     cuerpo de una petición. Los reportes globales usan service_role y solo se exponen al
//     superadministrador desde la capa de rutas.
import { supabase } from '../config/supabase.js';
import { crearProveedorCorreo } from './correo.js';
import { AppError, noEncontrado } from './errores.js';
import { esUuid } from './tenant.js';

export const ZONA_BOGOTA = 'America/Bogota';
export const PLANES = Object.freeze(['basico', 'intermedio', 'empresarial']);
export const CANALES = Object.freeze(['sms', 'correo', 'push']);
export const UMBRAL_ALERTA = 0.8;
export const MAX_INTENTOS_ALERTA = 3;

const FORMATO_MES = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_BOGOTA,
  year: 'numeric',
  month: '2-digit',
});

const ETIQUETA_PLAN = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  empresarial: 'Empresarial',
};

export const etiquetaPlan = (plan) => ETIQUETA_PLAN[plan] ?? String(plan ?? '');

/** `YYYY-MM` en la zona horaria comercial del proyecto. */
export function mesBogota(fecha = new Date()) {
  return FORMATO_MES.format(fecha instanceof Date ? fecha : new Date(fecha));
}

/** Primer día del mes, tal como lo guarda `consumo_mensual`. */
export const fechaMes = (mes) => `${validarMes(mes)}-01`;

export function validarMes(mes) {
  if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new AppError('VALIDACION', 'El mes debe tener el formato YYYY-MM', [
      { campo: 'mes', mensaje: 'Use YYYY-MM (por ejemplo, 2026-11)' },
    ]);
  }
  return mes;
}

/** Porcentaje redondeado a dos decimales; null cuando el plan no define cupo. */
export function porcentaje(usados, cupo) {
  const cantidad = Number(usados ?? 0);
  const limite = cupo === null || cupo === undefined ? null : Number(cupo);
  if (limite === null || !Number.isFinite(limite) || limite <= 0) return null;
  return Math.round((cantidad / limite) * 10000) / 100;
}

export function informacionCanal(cupo, usados) {
  const cantidad = Number(usados ?? 0);
  const limite = cupo === null || cupo === undefined ? null : Number(cupo);
  const pct = porcentaje(cantidad, limite);
  return {
    usados: cantidad,
    cupo: limite,
    restantes: limite === null ? null : Math.max(limite - cantidad, 0),
    porcentaje: pct,
    alerta80: pct !== null && pct >= UMBRAL_ALERTA * 100,
    agotado: limite !== null && cantidad >= limite,
  };
}

/** Estado visual del consumo de SMS de una sede. */
export function estadoConsumo(sms) {
  if (sms.agotado) return 'agotado';
  if (sms.alerta80) return 'advertencia';
  return 'normal';
}

/** Las RPC devuelven jsonb; una respuesta inesperada (por ejemplo null) no rompe el envío. Si la función no existe, `tenant.rpc` lanza y la falta de migración se reporta explícitamente. */
function normalizarRespuesta(respuesta, operacion) {
  if (!respuesta || typeof respuesta !== 'object' || !respuesta.estado) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[HU-39] La RPC ${operacion} no devolvió un resultado válido; se continúa sin control de cupo.`);
    }
    return { estado: 'ok', degradado: true };
  }
  return respuesta;
}

/** CA2: aparta una unidad del cupo antes de llamar al proveedor. */
export async function reservarConsumo(tenant, { canal, referencia, ahora = new Date() }) {
  if (!CANALES.includes(canal)) throw new AppError('VALIDACION', `Canal desconocido: ${canal}`);
  const respuesta = await tenant.rpc('hu39_reservar_consumo', {
    p_canal: canal,
    p_referencia: String(referencia),
    p_mes: fechaMes(mesBogota(ahora)),
    p_ahora: ahora.toISOString(),
  });
  return normalizarRespuesta(respuesta, 'hu39_reservar_consumo');
}

/** CA1: confirma el envío aceptado y, una sola vez, devuelve el cruce del 80 %. */
export async function confirmarConsumo(tenant, { canal, referencia, ahora = new Date() }) {
  const respuesta = await tenant.rpc('hu39_confirmar_consumo', {
    p_canal: canal,
    p_referencia: String(referencia),
    p_mes: fechaMes(mesBogota(ahora)),
    p_ahora: ahora.toISOString(),
  });
  return normalizarRespuesta(respuesta, 'hu39_confirmar_consumo');
}

/** El proveedor falló: libera la reserva para no contarla ni bloquear el cupo. */
export async function liberarConsumo(tenant, { canal, referencia, ahora = new Date() }) {
  const respuesta = await tenant.rpc('hu39_liberar_consumo', {
    p_canal: canal,
    p_referencia: String(referencia),
    p_mes: fechaMes(mesBogota(ahora)),
    p_ahora: ahora.toISOString(),
  });
  return normalizarRespuesta(respuesta, 'hu39_liberar_consumo');
}

/** Texto de la alerta del 80 %: lleva todos los datos que pide CA1. */
export function textoAlerta80(detalle, nombreEstablecimiento) {
  const plan = etiquetaPlan(detalle.plan);
  return [
    `Establecimiento: ${nombreEstablecimiento}`,
    `Plan contratado: ${plan}`,
    `Cupo mensual de SMS: ${detalle.cupo}`,
    `Consumo actual: ${detalle.consumo}`,
    `Porcentaje utilizado: ${detalle.porcentaje} %`,
    `SMS restantes: ${detalle.restantes}`,
    `Periodo: ${detalle.mes}`,
    '',
    'Este aviso se envía una sola vez por mes y establecimiento.',
  ].join('\n');
}

async function correosPorId(db) {
  const usuarios = new Map();
  try {
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    for (const usuario of data?.users ?? []) usuarios.set(usuario.id, usuario.email ?? null);
  } catch (err) {
    console.error('[HU-39] No se pudieron consultar los correos de los administradores:', err?.message ?? err);
  }
  return usuarios;
}

async function destinatariosAlerta(db, establecimientoId) {
  const [sede, plataforma] = await Promise.all([
    db.from('perfiles').select('id, nombre').eq('rol', 'admin').eq('establecimiento_id', establecimientoId).eq('activo', true),
    db.from('perfiles').select('id, nombre').eq('rol', 'superadmin').is('establecimiento_id', null).eq('activo', true),
  ]);
  if (sede.error) throw sede.error;
  if (plataforma.error) throw plataforma.error;
  const correos = await correosPorId(db);
  return [
    ...(sede.data ?? []).map((p) => ({ tipo: 'sede', id: p.id, correo: correos.get(p.id) ?? null })),
    ...(plataforma.data ?? []).map((p) => ({ tipo: 'plataforma', id: p.id, correo: correos.get(p.id) ?? null })),
  ];
}

async function filasAlerta(db, establecimientoId, mes, detalle, destinatarios) {
  if (!destinatarios.length) return [];
  const ids = destinatarios.map((d) => d.id);
  const { data: todas, error } = await db
    .from('consumo_alertas')
    .select('*')
    .eq('establecimiento_id', establecimientoId)
    .eq('mes', fechaMes(mes));
  if (error) throw error;

  // Si el mes ya se notificó, no se reenvía aunque falte algún destinatario: el reintento
  // de entregas fallidas lo hace el worker sobre las mismas filas, no una alerta nueva.
  if ((todas ?? []).some((f) => f.estado === 'enviada')) return [];

  const vistos = new Set((todas ?? []).map((f) => `${f.destinatario_tipo}:${f.destinatario_id}`));
  const nuevos = destinatarios
    .filter((d) => !vistos.has(`${d.tipo}:${d.id}`))
    .map((d) => ({
      establecimiento_id: establecimientoId,
      mes: fechaMes(mes),
      destinatario_tipo: d.tipo,
      destinatario_id: d.id,
      detalle: { ...detalle, correo: null },
    }));
  if (nuevos.length) {
    const { error: errorInsercion } = await db.from('consumo_alertas').insert(nuevos);
    // Otra alerta concurrente pudo ganar: la unicidad es la última barrera.
    if (errorInsercion && errorInsercion.code !== '23505') throw errorInsercion;
  }

  const { data: filasFinales, error: errorLectura } = await db
    .from('consumo_alertas')
    .select('*')
    .eq('establecimiento_id', establecimientoId)
    .eq('mes', fechaMes(mes));
  if (errorLectura) throw errorLectura;
  const finales = filasFinales?.length ? filasFinales : todas;
  const porCorreo = new Map(destinatarios.map((d) => [d.id, d.correo]));
  return (finales ?? []).map((f) => ({ ...f, correo: porCorreo.get(f.destinatario_id) ?? null }));
}

async function entregarAlerta(db, proveedor, alerta, nombre, detalle) {
  const asunto = `ZARU · 80 % del cupo de SMS alcanzado (${detalle.mes})`;
  const texto = textoAlerta80({ ...detalle, ...(alerta.detalle ?? {}) }, nombre);
  if (!alerta.correo) {
    const { error } = await db.from('consumo_alertas').update({
      estado: 'fallida',
      intentos: alerta.intentos + 1,
      error: 'El administrador no tiene correo registrado',
      actualizado_at: new Date().toISOString(),
    }).eq('id', alerta.id);
    if (error) console.error('[HU-39] No se pudo registrar el fallo de la alerta:', error.message);
    return { estado: 'fallida', motivo: 'sin_correo' };
  }
  try {
    await proveedor.enviar({ para: alerta.correo, asunto, texto, referencia: `hu39-alerta80-${alerta.id}` });
    const { error } = await db.from('consumo_alertas').update({
      estado: 'enviada',
      intentos: alerta.intentos + 1,
      error: null,
      enviada_at: new Date().toISOString(),
      actualizado_at: new Date().toISOString(),
    }).eq('id', alerta.id);
    if (error) throw error;
    return { estado: 'enviada' };
  } catch (err) {
    const { error } = await db.from('consumo_alertas').update({
      estado: 'fallida',
      intentos: alerta.intentos + 1,
      error: String(err?.message ?? err).slice(0, 500),
      actualizado_at: new Date().toISOString(),
    }).eq('id', alerta.id);
    if (error) console.error('[HU-39] No se pudo registrar el fallo de la alerta:', error.message);
    return { estado: 'fallida', motivo: err?.message ?? err };
  }
}

/**
 * CA1: notifica al administrador de la sede y al de la plataforma. Los destinos son perfiles reales
 * y los correos se leen de Supabase Auth. Cada entrega queda en `consumo_alertas`, de modo que dos
 * workers que crucen el 80 % al mismo tiempo no envían dos veces.
 */
export async function notificarAlerta80(detalle, { db = supabase, proveedor } = {}) {
  const mes = validarMes(detalle?.mes);
  const establecimientoId = detalle?.establecimientoId;
  if (!esUuid(establecimientoId)) return { destinatarios: 0, enviadas: 0, fallidas: 0 };

  const proveedorCorreo = proveedor ?? crearProveedorCorreo();
  const [{ data: establecimiento }, destinatarios] = await Promise.all([
    db.from('establecimientos').select('nombre').eq('id', establecimientoId).maybeSingle(),
    destinatariosAlerta(db, establecimientoId),
  ]);
  const nombre = establecimiento?.nombre ?? 'Establecimiento Zaru';
  const filas = await filasAlerta(db, establecimientoId, mes, detalle, destinatarios);
  const pendientes = filas.filter((f) => f.estado !== 'enviada');

  const resultados = [];
  for (const alerta of pendientes) {
    resultados.push(await entregarAlerta(db, proveedorCorreo, alerta, nombre, detalle));
  }

  const { error: errorAuditoria } = await db.from('auditoria').insert({
    establecimiento_id: establecimientoId,
    usuario_id: null,
    actor_tipo: 'sistema',
    rol: null,
    accion: 'hu39.alerta80.enviada',
    recurso: 'consumo_mensual',
    recurso_id: establecimientoId,
    resultado: 'permitido',
    detalle: {
      mes,
      canal: 'sms',
      consumo: detalle.consumo,
      cupo: detalle.cupo,
      porcentaje: detalle.porcentaje,
      destinatarios: pendientes.length,
      enviadas: resultados.filter((r) => r.estado === 'enviada').length,
    },
  });
  if (errorAuditoria) console.error('[HU-39] No se pudo auditar la alerta del 80 %:', errorAuditoria.message);

  return {
    destinatarios: pendientes.length,
    enviadas: resultados.filter((r) => r.estado === 'enviada').length,
    fallidas: resultados.filter((r) => r.estado === 'fallida').length,
  };
}

/** El worker reintenta entregas fallidas; la alerta ya no se vuelve a generar. */
export async function reenviarAlertasPendientes({ db = supabase, proveedor } = {}) {
  const { data: pendientes, error } = await db
    .from('consumo_alertas')
    .select('*')
    .in('estado', ['pendiente', 'fallida']);
  if (error) throw error;
  const proveedorCorreo = proveedor ?? crearProveedorCorreo();
  const porSede = new Map();
  const correos = pendientes?.some((a) => a.correo === undefined) ? await correosPorId(db) : new Map();
  let enviadas = 0;
  for (const alerta of (pendientes ?? []).filter((a) => Number(a.intentos ?? 0) < MAX_INTENTOS_ALERTA)) {
    if (!porSede.has(alerta.establecimiento_id)) {
      const { data } = await db.from('establecimientos').select('nombre').eq('id', alerta.establecimiento_id).maybeSingle();
      porSede.set(alerta.establecimiento_id, data?.nombre ?? 'Establecimiento Zaru');
    }
    const correo = alerta.correo ?? correos.get(alerta.destinatario_id) ?? null;
    const detalle = { mes: String(alerta.mes ?? '').slice(0, 7), ...(alerta.detalle ?? {}), correo };
    const resultado = await entregarAlerta(
      db,
      proveedorCorreo,
      { ...alerta, correo },
      porSede.get(alerta.establecimiento_id),
      detalle,
    );
    if (resultado.estado === 'enviada') enviadas += 1;
  }
  return { pendientes: (pendientes ?? []).length, enviadas };
}

const COLUMNAS_ALERTA = [
  'id, establecimiento_id, mes, destinatario_tipo, estado, intentos,',
  'detalle, error, enviada_at, created_at, actualizado_at',
].join(' ');

/** La tabla `detalle` es de auditoría: solo se exponen cifras, nunca el correo del destinatario. */
function alertaPublica(fila) {
  const detalle = fila.detalle && typeof fila.detalle === 'object' ? fila.detalle : {};
  return {
    id: fila.id,
    establecimientoId: fila.establecimiento_id,
    mes: String(fila.mes ?? '').slice(0, 7),
    destinatarioTipo: fila.destinatario_tipo,
    estado: fila.estado,
    intentos: Number(fila.intentos ?? 0),
    detalle: {
      canal: detalle.canal ?? 'sms',
      consumo: detalle.consumo ?? null,
      cupo: detalle.cupo ?? null,
      porcentaje: detalle.porcentaje ?? null,
      restantes: detalle.restantes ?? null,
    },
    error: fila.error ?? null,
    enviadaAt: fila.enviada_at ?? null,
    creadaAt: fila.created_at ?? null,
  };
}

/** CA1: el registro persistente de la alerta se consulta, no solo se escribe. */
export async function consultarAlertasPropias(tenant, { mes, db = supabase } = {}) {
  const periodo = validarMes(mes ?? mesBogota());
  const { data, error } = await tenant.listar('consumo_alertas', COLUMNAS_ALERTA)
    .eq('mes', fechaMes(periodo))
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { mes: periodo, alertas: (data ?? []).map(alertaPublica) };
}

/** CA1/CA3: la plataforma consulta las alertas de todas las sedes; el filtro sigue siendo del backend. */
export async function consultarAlertasGlobales({ mes, establecimientoId, db = supabase } = {}) {
  const periodo = validarMes(mes ?? mesBogota());
  if (establecimientoId !== undefined && !esUuid(establecimientoId)) throw noEncontrado('Establecimiento');
  let consulta = db.from('consumo_alertas').select(COLUMNAS_ALERTA).eq('mes', fechaMes(periodo));
  if (establecimientoId) consulta = consulta.eq('establecimiento_id', establecimientoId);
  const { data, error } = await consulta.order('created_at', { ascending: false });
  if (error) throw error;
  return { mes: periodo, alertas: (data ?? []).map(alertaPublica) };
}

function filaConsumo(plan, consumoPorCanal) {
  const sms = informacionCanal(plan?.cupo_sms_mes, consumoPorCanal?.sms ?? 0);
  const correo = informacionCanal(plan?.cupo_correo_mes, consumoPorCanal?.correo ?? 0);
  return { sms, correo, estado: estadoConsumo(sms) };
}

/** CA3: reporte global. Solo se llama desde rutas de superadministrador. */
export async function consultarReporte({ mes, db = supabase } = {}) {
  const periodo = validarMes(mes);
  const fecha = fechaMes(periodo);
  const [establecimientos, planes, consumos] = await Promise.all([
    db.from('establecimientos').select('id, nombre, plan, estado').order('nombre'),
    db.from('planes').select('nombre, cupo_sms_mes, cupo_correo_mes'),
    db.from('consumo_mensual').select('establecimiento_id, canal, cantidad').eq('mes', fecha),
  ]);
  for (const consulta of [establecimientos, planes, consumos]) if (consulta.error) throw consulta.error;

  const porPlan = new Map((planes.data ?? []).map((p) => [p.nombre, p]));
  const porEstablecimiento = new Map();
  for (const fila of consumos.data ?? []) {
    if (!porEstablecimiento.has(fila.establecimiento_id)) porEstablecimiento.set(fila.establecimiento_id, {});
    porEstablecimiento.get(fila.establecimiento_id)[fila.canal] = fila.cantidad;
  }

  const filas = (establecimientos.data ?? [])
    .filter((e) => porPlan.has(e.plan))
    .map((e) => {
      const plan = porPlan.get(e.plan);
      const consumo = filaConsumo(plan, porEstablecimiento.get(e.id));
      return {
        establecimientoId: e.id,
        nombre: e.nombre,
        plan: e.plan,
        etiquetaPlan: etiquetaPlan(e.plan),
        estadoEstablecimiento: e.estado,
        ...consumo,
      };
    });

  const resumen = {
    establecimientos: filas.length,
    smsConsumidos: filas.reduce((suma, f) => suma + f.sms.usados, 0),
    correosConsumidos: filas.reduce((suma, f) => suma + f.correo.usados, 0),
    cercanosAlLimite: filas.filter((f) => f.estado === 'advertencia').length,
    cupoAgotado: filas.filter((f) => f.estado === 'agotado').length,
  };

  return { mes: periodo, resumen, establecimientos: filas };
}

/** RF-F7-23: consumo propio de la sede, sin confiar en un id del frontend. */
export async function consultarConsumoPropio(tenant, { mes, db = supabase } = {}) {
  const periodo = validarMes(mes);
  const fecha = fechaMes(periodo);
  const [sede, consumos, planes] = await Promise.all([
    tenant.listar('establecimientos', 'id, nombre, plan').maybeSingle(),
    tenant.listar('consumo_mensual', 'canal, cantidad').eq('mes', fecha),
    db.from('planes').select('nombre, cupo_sms_mes, cupo_correo_mes'),
  ]);
  if (planes.error) throw planes.error;
  if (!sede.data) throw noEncontrado('Establecimiento');
  const plan = (planes.data ?? []).find((p) => p.nombre === sede.data.plan);
  if (!plan) throw new AppError('VALIDACION', 'La sede no tiene un plan de consumo configurado');
  const usados = {};
  for (const fila of consumos.data ?? []) usados[fila.canal] = fila.cantidad;
  return {
    mes: periodo,
    establecimientoId: sede.data.id,
    nombre: sede.data.nombre,
    plan: plan.nombre,
    etiquetaPlan: etiquetaPlan(plan.nombre),
    ...filaConsumo(plan, usados),
    // Push se contabiliza pero no tiene cupo: se muestra para que la sede vea su consumo real.
    push: informacionCanal(null, usados.push ?? 0),
  };
}

/**
 * HU-39 CA2: ¿el SMS de la sede ya agotó el cupo antes de encolar un aviso?
 * Solo consulta; no aparta ni cuenta consumo. Si la consulta falla, se continúa con la reserva
 * atómica del envío (que sí es la fuente de verdad) para no interrumpir una notificación operativa.
 */
export async function smsSinCupo(tenant, { ahora = new Date(), db = supabase } = {}) {
  // Sin conexión configurada no hay cupo consultable; se deja que la reserva atómica decida al enviar.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { sinCupo: false, detalle: null };
  }
  try {
    const consumo = await consultarConsumoPropio(tenant, { mes: mesBogota(ahora), db });
    return { sinCupo: Boolean(consumo.sms?.agotado), detalle: consumo.sms };
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[HU-39] No se pudo consultar el cupo de SMS al preparar el aviso:', err?.message ?? err);
    }
    return { sinCupo: false, detalle: null };
  }
}

/** Detalle de una sede para el panel global, con historial de periodos anteriores. */
export async function consultarDetalle({ establecimientoId, mes, db = supabase } = {}) {
  const periodo = validarMes(mes);
  if (!esUuid(establecimientoId)) throw noEncontrado('Establecimiento');
  const fecha = fechaMes(periodo);
  const [sede, planes, consumos, historial] = await Promise.all([
    db.from('establecimientos').select('id, nombre, plan').eq('id', establecimientoId).maybeSingle(),
    db.from('planes').select('nombre, cupo_sms_mes, cupo_correo_mes'),
    db.from('consumo_mensual').select('canal, cantidad').eq('establecimiento_id', establecimientoId).eq('mes', fecha),
    db.from('consumo_mensual')
      .select('mes, canal, cantidad')
      .eq('establecimiento_id', establecimientoId)
      .lte('mes', fecha)
      .order('mes', { ascending: false })
      .limit(36),
  ]);
  for (const consulta of [sede, planes, consumos, historial]) if (consulta.error) throw consulta.error;
  if (!sede.data) throw noEncontrado('Establecimiento');
  const plan = (planes.data ?? []).find((p) => p.nombre === sede.data.plan);
  if (!plan) throw new AppError('VALIDACION', 'La sede no tiene un plan de consumo configurado');

  const usados = {};
  for (const fila of consumos.data ?? []) usados[fila.canal] = fila.cantidad;

  const porMes = new Map();
  for (const fila of historial.data ?? []) {
    const clave = fila.mes.slice(0, 7);
    if (!porMes.has(clave)) porMes.set(clave, { mes: clave, sms: 0, correo: 0, push: 0 });
    porMes.get(clave)[fila.canal] = fila.cantidad;
  }

  return {
    mes: periodo,
    establecimientoId: sede.data.id,
    nombre: sede.data.nombre,
    plan: plan.nombre,
    etiquetaPlan: etiquetaPlan(plan.nombre),
    ...filaConsumo(plan, usados),
    historial: [...porMes.values()],
  };
}

/** Catálogo de planes y sus cupos actuales. */
export async function listarPlanes({ db = supabase } = {}) {
  const { data, error } = await db.from('planes').select('nombre, cupo_sms_mes, cupo_correo_mes, actualizado_at').order('nombre');
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, etiqueta: etiquetaPlan(p.nombre) }));
}

/** Ajuste de cupos hecho por el administrador de plataforma (nunca modifica consumption). */
export async function actualizarPlan(nombre, { cupoSmsMes, cupoCorreoMes }, { db = supabase } = {}) {
  if (!PLANES.includes(nombre)) throw noEncontrado('Plan');
  const cambios = { actualizado_at: new Date().toISOString() };
  if (cupoSmsMes !== undefined) cambios.cupo_sms_mes = cupoSmsMes;
  if (cupoCorreoMes !== undefined) cambios.cupo_correo_mes = cupoCorreoMes;
  const { data, error } = await db.from('planes').update(cambios).eq('nombre', nombre).select().maybeSingle();
  if (error) throw error;
  if (!data) throw noEncontrado('Plan');
  return { ...data, etiqueta: etiquetaPlan(data.nombre) };
}
