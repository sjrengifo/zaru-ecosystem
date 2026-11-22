// HU-36 — Cálculo y programación del recordatorio del próximo lavado.
//
// Se calcula con los servicios ya entregados del vehículo: promedio entre la primera y la última
// entrega. El recordatorio se encola a las 09:00 de Bogotá un día antes de la fecha estimada. Al
// registrar un servicio nuevo se cancela el vigente; al entregarlo se vuelve a calcular.
import { cifrar } from './cifrado.js';
import { puedeRecibir, TIPOS } from './autorizaciones.js';
import { cancelarAvisoProgramado } from './notificaciones.js';

const DIA_MS = 86_400_000;
const CINCO_HORAS_MS = 5 * 3_600_000;
const MAX_CARACTERES_MOTIVO = 200;

const fecha = (valor) => {
  const d = valor ? new Date(valor) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const diaBogota = (d) => {
  const local = new Date(d.getTime() - CINCO_HORAS_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
};

/** Promedio de días entre visitas consecutivas, con mínimo de 3 servicios y 1 día. */
export function calcularPromedioDias(entregas) {
  const fechas = entregas
    .map((entrega) => fecha(entrega.entregada_at ?? entrega.created_at))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (fechas.length < 3) return null;
  const intervalos = fechas.slice(1).reduce((total, actual, indice) => total + (actual - fechas[indice]), 0);
  const dias = Math.max(1, Math.round(intervalos / (fechas.length - 1) / DIA_MS));
  return { promedioDias: dias, serviciosBase: fechas.length, ultimaEntrega: fechas.at(-1) };
}

/** 09:00 de Bogotá del día anterior a la fecha estimada. */
export function fechaProgramada(fechaEstimada) {
  const [anio, mes, dia] = String(fechaEstimada).split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia - 1, 14, 0, 0));
}

/** Si la hora ideal ya pasó, usa la siguiente ventana permitida (07:00–20:00 de Bogotá). */
export function siguienteVentana(ahora = new Date()) {
  const local = new Date(ahora.getTime() - CINCO_HORAS_MS);
  const hora = local.getUTCHours();
  if (hora >= 7 && hora < 20) return new Date(ahora.getTime() + 5 * 60_000);
  const dia = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  if (hora >= 20) dia.setUTCDate(dia.getUTCDate() + 1);
  return new Date(dia.getTime() + 7 * 3_600_000 + 5 * 60_000);
}

const programadaPara = (fechaEstimada, ahora = new Date()) => {
  const ideal = fechaProgramada(fechaEstimada);
  return ideal > ahora ? ideal : siguienteVentana(ahora);
};

const isoDia = (d) => new Date(d.getTime() + CINCO_HORAS_MS).toISOString().slice(0, 10);

function primeraFila(respuesta) {
  const filas = respuesta?.data;
  return Array.isArray(filas) ? filas[0] ?? null : filas ?? null;
}

const motivo = (texto) => String(texto ?? '').slice(0, MAX_CARACTERES_MOTIVO);

/** Cancela el recordatorio programado del vehículo y su correo en cola. */
export async function cancelarRecordatorio(tenant, vehiculoId, motivoCancelacion) {
  const { data: filas, error } = await tenant
    .listar('recordatorios', 'id, notificacion_id')
    .eq('vehiculo_id', vehiculoId)
    .eq('estado', 'programado');
  if (error) throw error;
  const recordatorio = Array.isArray(filas) ? filas[0] ?? null : filas ?? null;
  if (!recordatorio) return null;

  await tenant.actualizar('recordatorios', recordatorio.id, {
    estado: 'cancelado',
    motivo_cancelacion: motivo(motivoCancelacion),
    updated_at: new Date().toISOString(),
  });
  if (recordatorio.notificacion_id) {
    await cancelarAvisoProgramado(tenant, recordatorio.notificacion_id, motivo(motivoCancelacion));
  }
  return recordatorio;
}

/**
 * Recalcula el recordatorio al entregar una orden. Nunca lanza por datos insuficientes: devuelve el
 * motivo por el que no se programó para que la operación de la orden no dependa de un correo.
 */
export async function programarRecordatorio(tenant, vehiculoId, { ahora = new Date() } = {}) {
  const { data: vehiculo, error } = await tenant
    .listar('vehiculos', 'id, placa, cliente_id, recordatorios_activos')
    .eq('id', vehiculoId)
    .maybeSingle();
  if (error) throw error;
  if (!vehiculo) return { estado: 'omitido', motivo: 'vehiculo_no_encontrado' };
  if (!vehiculo.recordatorios_activos) {
    await cancelarRecordatorio(tenant, vehiculoId, 'cliente_desactivo_recordatorios');
    return { estado: 'omitido', motivo: 'recordatorios_desactivados' };
  }

  const { data: cliente, error: errorCliente } = await tenant
    .listar('clientes', 'id, nombre, correo')
    .eq('id', vehiculo.cliente_id)
    .maybeSingle();
  if (errorCliente) throw errorCliente;

  const { data: ordenes, error: errorOrdenes } = await tenant
    .listar('ordenes', 'id, entregada_at, created_at')
    .eq('vehiculo_id', vehiculoId)
    .eq('estado', 'entregado');
  if (errorOrdenes) throw errorOrdenes;

  const calculo = calcularPromedioDias(ordenes ?? []);
  if (!calculo) {
    await cancelarRecordatorio(tenant, vehiculoId, 'servicios_insuficientes');
    return { estado: 'omitido', motivo: 'servicios_insuficientes' };
  }
  if (!cliente?.correo) {
    await cancelarRecordatorio(tenant, vehiculoId, 'cliente_sin_correo');
    return { estado: 'omitido', motivo: 'cliente_sin_correo' };
  }

  if (!(await puedeRecibir(tenant, cliente.id, TIPOS.comerciales))) {
    await cancelarRecordatorio(tenant, vehiculoId, 'sin_autorizacion_comercial');
    return { estado: 'omitido', motivo: 'sin_autorizacion_comercial' };
  }

  await cancelarRecordatorio(tenant, vehiculoId, 'recalculo');

  const fechaEstimada = isoDia(new Date(calculo.ultimaEntrega.getTime() + calculo.promedioDias * DIA_MS));
  const programada = programadaPara(fechaEstimada, ahora);
  const recordatorio = await tenant.crear('recordatorios', {
    cliente_id: cliente.id,
    vehiculo_id: vehiculo.id,
    fecha_estimada: fechaEstimada,
    fecha_programada: programada.toISOString(),
    promedio_dias: calculo.promedioDias,
    servicios_base: calculo.serviciosBase,
  });

  try {
    const notificacion = await tenant.crear('notificaciones', {
      cliente_id: cliente.id,
      tipo: 'recordatorio',
      evento: 'recordatorio.proximo_lavado',
      canal: 'correo',
      destino: cifrar(cliente.correo),
      contenido: { recordatorioId: recordatorio.id },
      estado: 'programada',
      programada_para: programada.toISOString(),
      clave_dedupe: `recordatorio:${recordatorio.id}`,
    });
    await tenant.actualizar('recordatorios', recordatorio.id, { notificacion_id: notificacion.id });
    return { estado: 'programado', recordatorio: { ...recordatorio, notificacion_id: notificacion.id } };
  } catch (error) {
    await tenant.actualizar('recordatorios', recordatorio.id, {
      estado: 'cancelado',
      motivo_cancelacion: 'no_se_pudo_encolar',
      updated_at: new Date().toISOString(),
    });
    throw error;
  }
}

/** HU-36 CA2: al registrar un servicio nuevo se cancela el recordatorio vigente. */
export async function cancelarPorNuevoServicio(tenant, vehiculoId) {
  return cancelarRecordatorio(tenant, vehiculoId, 'nuevo_servicio');
}

/** Datos que el worker necesita para reconstruir el correo sin guardar el cuerpo en la cola. */
export async function datosRecordatorio(tenant, recordatorioId) {
  const { data: recordatorio, error } = await tenant
    .listar('recordatorios', 'id, establecimiento_id, cliente_id, vehiculo_id, fecha_estimada, estado, fecha_programada')
    .eq('id', recordatorioId)
    .maybeSingle();
  if (error) throw error;
  if (!recordatorio) return null;

  const [{ data: vehiculo, error: errorVehiculo }, { data: sede, error: errorSede }] = await Promise.all([
    tenant.listar('vehiculos', 'id, placa, recordatorios_activos').eq('id', recordatorio.vehiculo_id).maybeSingle(),
    tenant.listar('establecimientos', 'nombre, telefono, direccion').maybeSingle(),
  ]);
  if (errorVehiculo) throw errorVehiculo;
  if (errorSede) throw errorSede;
  return { ...recordatorio, vehiculo: vehiculo ?? null, sede: sede ?? {} };
}
