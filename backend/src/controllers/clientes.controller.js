// HU-03 y HU-04 — Lógica de clientes.
// Multi-tenant (HU-41): todo acceso a datos pasa por req.tenant, que filtra por el establecimiento de la sesión.
import { AppError } from '../shared/errores.js';

/** Quita los caracteres que alteran la sintaxis de filtros de PostgREST (coma, paréntesis, comodines). */
const textoBuscable = (texto) => String(texto).replace(/[,()*%\\]/g, ' ').trim();

/** HU-04 CA1: listar y buscar por nombre o teléfono. */
export async function listar(req, res, next) {
  try {
    let consulta = req.tenant
      .listar('clientes', 'id, nombre, telefono, correo, vehiculos(placa)')
      .order('nombre');

    const buscar = req.query.buscar ? textoBuscable(req.query.buscar) : '';
    if (buscar) {
      consulta = consulta.or(`nombre.ilike.%${buscar}%,telefono.ilike.%${buscar}%`);
    }

    const { data, error } = await consulta;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function obtener(req, res, next) {
  try {
    res.json(await req.tenant.obtener('clientes', req.params.id, '*, vehiculos(*)', 'Cliente'));
  } catch (err) {
    next(err);
  }
}

/** HU-03: registrar cliente con autorización de datos (Ley 1581). */
export async function crear(req, res, next) {
  try {
    const { nombre, telefono, correo, autorizacionDatos } = req.body;

    if (!nombre || !telefono) throw new AppError('VALIDACION', 'Nombre y teléfono son obligatorios');
    // CA2: sin autorización no se registra.
    if (autorizacionDatos !== true) {
      throw new AppError('VALIDACION', 'La autorización de tratamiento de datos es obligatoria');
    }

    // CA3: teléfono repetido en el mismo establecimiento.
    const { data: existente } = await req.tenant
      .listar('clientes', 'id, nombre')
      .eq('telefono', telefono)
      .maybeSingle();
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono', codigo: 'CONFLICTO', cliente: existente });
    }

    // CA1: se guarda con la fecha de autorización.
    const cliente = await req.tenant.crear('clientes', {
      nombre,
      telefono,
      correo,
      autorizacion_datos: true,
      fecha_autorizacion: new Date().toISOString(),
    });
    res.status(201).json(cliente);
  } catch (err) {
    next(err);
  }
}

/** HU-04 CA2: editar datos de contacto. */
export async function actualizar(req, res, next) {
  try {
    const { nombre, telefono, correo } = req.body;
    res.json(await req.tenant.actualizar('clientes', req.params.id, { nombre, telefono, correo }, '*', 'Cliente'));
  } catch (err) {
    next(err);
  }
}
