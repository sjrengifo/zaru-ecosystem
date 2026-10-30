// HU-05 y HU-06 — Lógica de vehículos.
// - Multi-tenant (HU-41): todo acceso a datos pasa por req.tenant.
// - Validación (HU-43): las rutas validan con schemas/vehiculos.schemas.js antes de llegar aquí.
// TODO HU-06: historial = órdenes "entregado" del vehículo con fecha, servicios y valor.
import { AppError } from '../shared/errores.js';
import { pendiente } from './pendiente.js';

/** Vehículos del establecimiento con su cliente; opcionalmente, los que contienen el texto en la placa. */
export async function listar(req, res, next) {
  try {
    let consulta = req.tenant
      .listar('vehiculos', 'id, cliente_id, placa, tipo, marca, color, created_at, clientes(id, nombre)')
      .order('placa');

    if (req.query.placa) {
      const placa = req.query.placa.replace(/[^A-Za-z0-9]/g, '');
      if (!placa) return res.json([]);
      consulta = consulta.ilike('placa', `%${placa}%`);
    }

    const { data, error } = await consulta;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function buscarPorPlaca(tenant, placa) {
  const { data, error } = await tenant.listar('vehiculos', 'clientes(id, nombre)').eq('placa', placa).maybeSingle();
  if (error) throw error;
  return data;
}

const placaRepetida = ({ clientes: dueno }) =>
  new AppError('CONFLICTO', 'Ya existe un vehículo con esa placa', [
    { campo: 'placa', mensaje: `La placa ya está registrada a nombre de ${dueno.nombre}`, clienteId: dueno.id },
  ]);

/** HU-05 CA1 y CA2: registrar un vehículo de un cliente del establecimiento; la placa no se repite. */
export async function crear(req, res, next) {
  try {
    const { clienteId, placa, tipo, marca, color } = req.body;
    await req.tenant.obtener('clientes', clienteId, 'id', 'Cliente');

    const existente = await buscarPorPlaca(req.tenant, placa);
    if (existente) throw placaRepetida(existente);

    let vehiculo;
    try {
      vehiculo = await req.tenant.crear('vehiculos', { cliente_id: clienteId, placa, tipo, marca, color });
    } catch (err) {
      // Dos registros simultáneos pasan la consulta anterior y la base rechaza el segundo:
      // se responde igual que un duplicado normal para indicar a qué cliente pertenece.
      const ganador = err.codigo === 'CONFLICTO' ? await buscarPorPlaca(req.tenant, placa) : null;
      throw ganador ? placaRepetida(ganador) : err;
    }
    res.status(201).json(vehiculo);
  } catch (err) {
    next(err);
  }
}

export const historial = pendiente('HU-06');
