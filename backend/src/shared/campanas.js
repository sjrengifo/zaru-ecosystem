// HU-35 (ZARU-24) — Campañas de promociones segmentadas.
//
// Flujo:
//   1. `estimar`: valida que la promoción siga vigente y llama al segmentador SQL
//      (`public.segmento_campana`). Devuelve el total y las exclusiones, sin crear nada (CA2, CA3).
//   2. `crear`: vuelve a estimar al confirmar, guarda la foto de la promoción y la hora ya ajustada
//      al horario de Bogotá (CA4). La clave de idempotencia evita campañas duplicadas.
//   3. `materializarCampanas`: paso del worker. Revalida la promoción y el segmento, y crea una
//      notificación `comercial` por destinatario con prioridad 2 (RNF-F7-02). El envío real lo hace
//      la cola de notificaciones, que además revalida autorización y límite antes de cada mensaje.
//
// La zona America/Bogota no tiene horario de verano: el desfase es siempre -05:00.
import { randomUUID } from 'node:crypto';
import { AppError, noEncontrado } from './errores.js';
import { cifrar, descifrar, estaCifrado } from './cifrado.js';
import { crearAccesoTenant } from './tenant.js';

export const ZONA = 'America/Bogota';
export const HORA_INICIO = 7;
export const HORA_FIN = 20;
export const MAX_DESTINATARIOS_SEMANA = 2;

const DESFASE_BOGOTA_MS = 5 * 60 * 60 * 1000;
const MOTIVOS = {
  sin_autorizacion: 'sinAutorizacion',
  limite_semanal: 'limiteSemanal',
  sin_correo: 'sinCanal',
};

/** Estados posibles de una campaña (coinciden con el check de la migración). */
export const ESTADOS_CAMPANA = ['programada', 'enviando', 'enviada', 'cancelada'];

/**
 * RF-F7-09 / HU-35 CA4: si la hora cae entre las 8:00 p. m. y las 7:00 a. m. de Bogotá, se mueve a
 * las 7:00 a. m. del día siguiente. Una hora en el pasado se envía de inmediato (y también se ajusta
 * si ese momento cae en la franja nocturna).
 * @returns {{ programadaPara: Date, ajustada: boolean }}
 */
export function ajustarHorario(fecha, ahora = new Date()) {
  const solicitada = fecha instanceof Date ? new Date(fecha.getTime()) : new Date(fecha);
  if (Number.isNaN(solicitada.getTime())) {
    throw new AppError('VALIDACION', 'La fecha de programación no es válida', [
      { campo: 'programadaPara', mensaje: 'La fecha de programación no es válida' },
    ]);
  }

  const base = solicitada.getTime() < ahora.getTime() ? new Date(ahora.getTime()) : solicitada;
  // La hora local de Bogotá se obtiene restando el desfase fijo y leyendo en UTC.
  const local = new Date(base.getTime() - DESFASE_BOGOTA_MS);
  const hora = local.getUTCHours();

  if (hora >= HORA_INICIO && hora < HORA_FIN) {
    return { programadaPara: base, ajustada: base.getTime() !== solicitada.getTime() };
  }

  const siguienteDia = hora >= HORA_FIN;
  // 07:00 en Bogotá equivale a las 12:00 UTC (Colombia no cambia de hora).
  const ajustada = new Date(Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + (siguienteDia ? 1 : 0),
    HORA_INICIO + 5,
    0,
    0,
  ));
  return { programadaPara: ajustada, ajustada: true };
}

/** Promoción vigente del establecimiento o un error claro para el panel. */
async function promocionVigente(tenant, promocionId) {
  const { data, error } = await tenant
    .listar(
      'promociones_con_estado',
      'id, nombre, descripcion, condiciones, descuento_pct, fecha_inicio, fecha_fin, estado, servicios',
    )
    .eq('id', promocionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw noEncontrado('Promoción');
  if (data.estado !== 'vigente') {
    throw new AppError('VALIDACION', 'La promoción no está vigente', [
      { campo: 'promocionId', mensaje: 'Elige una promoción vigente para la campaña' },
    ]);
  }
  return data;
}

/** RF-F7-06: foto de la promoción que se guarda con la campaña y viaja en el correo. */
export function fotoPromocion(promocion) {
  return {
    id: promocion.id,
    nombre: promocion.nombre,
    descripcion: promocion.descripcion ?? null,
    condiciones: promocion.condiciones ?? null,
    descuentoPct: Number(promocion.descuento_pct ?? 0),
    fechaInicio: promocion.fecha_inicio,
    fechaFin: promocion.fecha_fin,
    servicios: (promocion.servicios ?? []).map((s) => s.nombre),
  };
}

/**
 * Solo para validar en local: traduce las opciones del panel a minutos.
 *   HU35_ESCALA_MINUTOS=1,5,10 → 30 días = 1 min, 60 días = 5 min, 90 días = 10 min.
 * Un solo número aplica el mismo corte a las tres opciones. En producción siempre null.
 * El panel sigue mostrando 30, 60 y 90 días.
 * @returns {{ 30: number, 60: number, 90: number } | null}
 */
export function escalaMinutosPruebas() {
  // Nunca en producción: la validación con minutos es solo para entornos locales o de prueba.
  if (process.env.NODE_ENV === 'production') return null;
  const valor = (process.env.HU35_ESCALA_MINUTOS ?? '').trim();
  if (!valor) return null;
  const minutos = valor.split(',').map((parte) => Number.parseInt(parte.trim(), 10));
  if (minutos.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  if (minutos.length === 1) return { 30: minutos[0], 60: minutos[0], 90: minutos[0] };
  if (minutos.length === 3) return { 30: minutos[0], 60: minutos[1], 90: minutos[2] };
  return null;
}

/**
 * Llama al segmentador SQL y separa destinatarios de exclusiones.
 * @returns {Promise<{ total: number, exclusiones: object, elegibles: string[] }>}
 */
async function calcularSegmento(tenant, segmento, ahora) {
  const dias = segmento.diasSinVisita ?? 30;
  const escala = escalaMinutosPruebas();
  const minutos = escala?.[dias] ?? null;
  const filas = await tenant.rpc('segmento_campana', {
    // Con la escala de pruebas se piden todos los que tuvieron visita y el corte se aplica abajo,
    // para no cambiar la función SQL que en producción trabaja con días.
    p_dias_sin_visita: minutos !== null ? 0 : dias,
    // Una lista vacía se envía como null para que PostgREST no dude del tipo del arreglo.
    p_servicio_ids: segmento.servicioIds?.length ? segmento.servicioIds : null,
    p_tipos_vehiculo: segmento.tiposVehiculo?.length ? segmento.tiposVehiculo : null,
    p_ahora: ahora.toISOString(),
  });

  const corte = minutos !== null ? ahora.getTime() - minutos * 60_000 : null;
  const exclusiones = {};
  const elegibles = [];
  for (const fila of Array.isArray(filas) ? filas : []) {
    // Una visita reciente no es una exclusión: simplemente no pertenece al segmento.
    if (corte !== null && new Date(fila.ultima_visita).getTime() > corte) continue;
    const clave = MOTIVOS[fila.motivo];
    if (clave) exclusiones[clave] = (exclusiones[clave] ?? 0) + 1;
    else elegibles.push(fila.cliente_id);
  }
  return { total: elegibles.length, exclusiones, elegibles };
}

/** ISO 8601 en UTC: PostgREST devuelve `+00:00` y el panel espera el mismo formato en todas las fechas. */
function iso(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/** Forma pública de una campaña para el panel. */
export function campanaPublica(fila) {
  const solicitada = new Date(fila.programada_solicitada);
  const programada = new Date(fila.programada_para);
  return {
    id: fila.id,
    promocionId: fila.promocion_id,
    promocion: fila.promocion_snapshot ?? {},
    segmento: fila.segmento ?? {},
    estado: fila.estado,
    programadaPara: iso(fila.programada_para),
    programadaSolicitada: iso(fila.programada_solicitada),
    ajustada: solicitada.getTime() !== programada.getTime(),
    totalDestinatarios: fila.total_destinatarios ?? 0,
    exclusiones: fila.exclusiones ?? {},
    omitidos: fila.omitidos ?? {},
    materializadaAt: iso(fila.materializada_at),
    error: fila.error ?? null,
    createdAt: iso(fila.created_at),
  };
}

/**
 * POST /campanas/estimar (RF-F7-07, RF-F7-08 · HU-35 CA2, CA3).
 * No crea nada: solo devuelve el total y el detalle de exclusiones.
 */
export async function estimar(tenant, { promocionId, segmento }, { ahora = new Date() } = {}) {
  const promocion = await promocionVigente(tenant, promocionId);
  const calculo = await calcularSegmento(tenant, segmento, ahora);
  return { ...calculo, promocion };
}

/**
 * POST /campanas (RF-F7-09, RF-F7-10 · HU-35 CA1, CA4).
 * La promoción y el segmento se revalidan al confirmar. Si la clave de idempotencia ya existe,
 * devuelve la campaña creada antes en lugar de duplicarla.
 */
export async function crear(
  tenant,
  { promocionId, segmento, programadaPara },
  { usuarioId = null, claveIdempotencia, ahora = new Date() } = {},
) {
  const clave = String(claveIdempotencia ?? '').trim() || randomUUID();
  const { programadaPara: ajustada } = ajustarHorario(programadaPara ?? ahora, ahora);
  const calculo = await estimar(tenant, { promocionId, segmento }, { ahora });
  const solicitada = programadaPara ? new Date(programadaPara) : new Date(ahora);

  try {
    const creada = await tenant.crear('campanas', {
      promocion_id: promocionId,
      promocion_snapshot: fotoPromocion(calculo.promocion),
      segmento,
      estado: 'programada',
      programada_para: ajustada.toISOString(),
      programada_solicitada: solicitada.toISOString(),
      total_destinatarios: calculo.total,
      exclusiones: calculo.exclusiones,
      omitidos: {},
      clave_idempotencia: clave,
      creada_por: usuarioId,
    }, '*');
    return campanaPublica(creada);
  } catch (err) {
    if (err?.codigo === 'CONFLICTO') {
      const { data } = await tenant.listar('campanas', '*').eq('clave_idempotencia', clave).maybeSingle();
      if (data) return campanaPublica(data);
    }
    throw err;
  }
}

/** GET /campanas — historial paginado de la sede. */
export async function listar(tenant, { pagina, porPagina }) {
  const inicio = (pagina - 1) * porPagina;
  const { data, error, count } = await tenant
    .listar('campanas', '*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(inicio, inicio + porPagina - 1);
  if (error) throw error;
  const total = count ?? 0;
  return {
    campanas: (data ?? []).map(campanaPublica),
    paginacion: { pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina) },
  };
}

function destinoPlano(valor) {
  try {
    return descifrar(valor) ?? '';
  } catch {
    return String(valor ?? '');
  }
}

/** Correos cifrados de los destinatarios, en lotes para no armar una consulta gigante. */
async function correosDeClientes(tenant, ids) {
  const mapa = new Map();
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 200) {
    const lote = unicos.slice(i, i + 200);
    const { data, error } = await tenant.listar('clientes', 'id, correo').in('id', lote);
    if (error) throw error;
    for (const cliente of data ?? []) mapa.set(cliente.id, cliente.correo);
  }
  return mapa;
}

/** Cierra una campaña sin propagar el error al worker. */
async function cerrar(db, campana, cambios) {
  const { error } = await db
    .from('campanas')
    .update({ ...cambios, materializada_at: cambios.materializada_at ?? new Date().toISOString() })
    .eq('id', campana.id);
  if (error) console.error(`[HU-35] No se pudo cerrar la campaña ${campana.id}:`, error.message);
}

/**
 * Materializa una campaña vencida: recalcula el segmento y encola una notificación comercial por
 * cliente. La clave `campana:<id>:<cliente>` impide duplicados si la campaña se reintenta.
 * Se exporta para poder probar una campaña aislada sin procesar toda la tabla.
 */
export async function materializarCampana(db, campana, { ahora = new Date() } = {}) {
  const tenant = crearAccesoTenant(db, { establecimientoId: campana.establecimiento_id });
  try {
    const promocion = await promocionVigente(tenant, campana.promocion_id);
    const calculo = await calcularSegmento(tenant, campana.segmento ?? {}, ahora);
    const correos = await correosDeClientes(tenant, calculo.elegibles);
    const foto = campana.promocion_snapshot?.nombre ? campana.promocion_snapshot : fotoPromocion(promocion);

    let creadas = 0;
    let duplicadas = 0;
    let sinCorreo = 0;

    for (const clienteId of calculo.elegibles) {
      const correoGuardado = correos.get(clienteId);
      const correo = correoGuardado ? destinoPlano(correoGuardado).trim() : '';
      if (!correo) {
        sinCorreo += 1;
        continue;
      }
      try {
        await tenant.crear('notificaciones', {
          cliente_id: clienteId,
          tipo: 'comercial',
          evento: 'campana.promocion',
          canal: 'correo',
          destino: estaCifrado(correoGuardado) ? correoGuardado : cifrar(correo),
          // Solo la promoción y el asunto: el cuerpo se reconstruye al enviar, con los datos
          // vigentes del cliente y el enlace de baja.
          contenido: { asunto: foto.nombre, promocion: foto, campana: true },
          estado: 'pendiente',
          prioridad: 2,
          programada_para: ahora.toISOString(),
          clave_dedupe: `campana:${campana.id}:${clienteId}`,
          campana_id: campana.id,
        }, 'id');
        creadas += 1;
      } catch (err) {
        if (err?.codigo === 'CONFLICTO') {
          duplicadas += 1;
          continue;
        }
        throw err;
      }
    }

    const omitidos = { ...calculo.exclusiones };
    if (sinCorreo) omitidos.sinCanal = (omitidos.sinCanal ?? 0) + sinCorreo;
    if (duplicadas) omitidos.duplicados = duplicadas;

    await cerrar(db, campana, {
      estado: 'enviada',
      total_destinatarios: creadas,
      exclusiones: calculo.exclusiones,
      omitidos,
      error: null,
      materializada_at: ahora.toISOString(),
    });
    return { id: campana.id, estado: 'enviada', creadas, omitidos };
  } catch (err) {
    const motivo = String(err?.message ?? err).slice(0, 500);
    console.error(`[HU-35] No se pudo materializar la campaña ${campana.id}:`, motivo);
    await cerrar(db, campana, {
      estado: 'cancelada',
      error: motivo,
      materializada_at: ahora.toISOString(),
    });
    return { id: campana.id, estado: 'cancelada', creadas: 0, error: motivo };
  }
}

/**
 * Paso del worker: toma las campañas vencidas y las materializa. El reclamo es atómico para que
 * dos workers no procesen la misma campaña.
 * @param {import('@supabase/supabase-js').SupabaseClient} db cliente con service_role
 */
export async function materializarCampanas(db, { ahora = new Date(), limite = 10 } = {}) {
  const { data: pendientes, error } = await db
    .from('campanas')
    .select('*')
    .eq('estado', 'programada')
    .lte('programada_para', ahora.toISOString())
    .order('programada_para', { ascending: true })
    .limit(limite);
  if (error) throw error;

  const resultados = [];
  for (const campana of pendientes ?? []) {
    const { data: reclamada, error: errorReclamo } = await db
      .from('campanas')
      .update({ estado: 'enviando' })
      .eq('id', campana.id)
      .eq('estado', 'programada')
      .select('*')
      .maybeSingle();
    if (errorReclamo) {
      console.error('[HU-35] No se pudo reclamar la campaña:', errorReclamo.message);
      continue;
    }
    if (!reclamada) continue; // otro worker la tomó
    resultados.push(await materializarCampana(db, reclamada, { ahora }));
  }
  return resultados;
}
