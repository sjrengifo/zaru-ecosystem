// HU-36 CA3 — Página pública para dejar de recibir el recordatorio del próximo lavado.
//
// El enlace identifica un vehículo y solo desactiva sus recordatorios. No toca los avisos del
// servicio ni las promociones, que el cliente controla por separado en HU-30.
import { supabase } from '../config/supabase.js';
import { AppError } from './errores.js';
import { crearAccesoTenant } from './tenant.js';
import { cancelarRecordatorio } from './recordatorios.js';
import { leerTokenRecordatorio } from './tokenRecordatorio.js';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const enlaceNoValido = () => new AppError('NO_ENCONTRADO', 'Este enlace no es válido o ya no está disponible');

const sedePublica = (sede) => ({
  nombre: sede?.nombre ?? 'Zaru',
  logoUrl: sede?.logo_url ?? null,
  colorPrimario: COLOR_HEX.test(sede?.color_primario ?? '') ? sede.color_primario : null,
  colorSecundario: COLOR_HEX.test(sede?.color_secundario ?? '') ? sede.color_secundario : null,
});

async function contexto(token, db) {
  const datos = leerTokenRecordatorio(token);
  if (!datos) throw enlaceNoValido();
  const tenant = crearAccesoTenant(db, { establecimientoId: datos.establecimientoId });

  const [{ data: cliente, error: errorCliente }, { data: vehiculo, error: errorVehiculo }] = await Promise.all([
    tenant.listar('clientes', 'id').eq('id', datos.clienteId).maybeSingle(),
    tenant.listar('vehiculos', 'id, placa, cliente_id, recordatorios_activos').eq('id', datos.vehiculoId).maybeSingle(),
  ]);
  if (errorCliente) throw errorCliente;
  if (errorVehiculo) throw errorVehiculo;
  if (!cliente || !vehiculo || vehiculo.cliente_id !== datos.clienteId) throw enlaceNoValido();

  const { data: sede } = await tenant
    .listar('establecimientos', 'nombre, logo_url, color_primario, color_secundario')
    .maybeSingle();
  return { ...datos, tenant, vehiculo, sede: sede ?? {} };
}

async function proximaFecha(tenant, vehiculoId) {
  const { data, error } = await tenant
    .listar('recordatorios', 'fecha_estimada')
    .eq('vehiculo_id', vehiculoId)
    .eq('estado', 'programado')
    .maybeSingle();
  if (error) throw error;
  return data?.fecha_estimada ?? null;
}

/** Datos para la pantalla de confirmación, sin datos personales. */
export async function consultarRecordatorio(token, { db = supabase } = {}) {
  const { tenant, vehiculo, sede } = await contexto(token, db);
  return {
    vehiculo: { placa: vehiculo.placa },
    activos: vehiculo.recordatorios_activos,
    proximaFecha: vehiculo.recordatorios_activos ? await proximaFecha(tenant, vehiculo.id) : null,
    sede: sedePublica(sede),
  };
}

/** Desactiva los recordatorios del vehículo y cancela el correo que estuviera programado. */
export async function desactivarRecordatorio(token, { db = supabase } = {}) {
  const { tenant, vehiculo, sede } = await contexto(token, db);
  const ahora = new Date().toISOString();
  if (vehiculo.recordatorios_activos) {
    await tenant.actualizar('vehiculos', vehiculo.id, { recordatorios_activos: false });
    await cancelarRecordatorio(tenant, vehiculo.id, 'solicitud_del_cliente');
  }
  return {
    vehiculo: { placa: vehiculo.placa },
    activos: false,
    desactivadoAt: ahora,
    sede: sedePublica(sede),
  };
}
