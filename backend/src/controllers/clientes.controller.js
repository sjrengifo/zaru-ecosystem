// HU-03 y HU-04 — Lógica de clientes.
// Regla de oro multi-tenant: SIEMPRE filtrar por req.usuario.establecimientoId.
import { supabase } from '../config/supabase.js';
import { crearError } from '../middlewares/errorHandler.js';

/** HU-04 CA1: listar y buscar por nombre, teléfono o placa. */
export async function listar(req, res, next) {
  try {
    const { buscar } = req.query;
    let consulta = supabase
      .from('clientes')
      .select('id, nombre, telefono, correo, vehiculos(placa)')
      .eq('establecimiento_id', req.usuario.establecimientoId)
      .order('nombre');

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
    const { data, error } = await supabase
      .from('clientes')
      .select('*, vehiculos(*)')
      .eq('id', req.params.id)
      .eq('establecimiento_id', req.usuario.establecimientoId)
      .single();
    if (error) throw crearError(404, 'Cliente no encontrado');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/** HU-03: registrar cliente con autorización de datos (Ley 1581). */
export async function crear(req, res, next) {
  try {
    const { nombre, telefono, correo, autorizacionDatos } = req.body;

    if (!nombre || !telefono) throw crearError(400, 'Nombre y teléfono son obligatorios');
    // CA2: sin autorización no se registra.
    if (autorizacionDatos !== true) {
      throw crearError(400, 'La autorización de tratamiento de datos es obligatoria');
    }

    // CA3: teléfono repetido en el mismo establecimiento.
    const { data: existente } = await supabase
      .from('clientes')
      .select('id, nombre')
      .eq('establecimiento_id', req.usuario.establecimientoId)
      .eq('telefono', telefono)
      .maybeSingle();
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono', cliente: existente });
    }

    // CA1: se guarda con la fecha de autorización.
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        establecimiento_id: req.usuario.establecimientoId,
        nombre,
        telefono,
        correo,
        autorizacion_datos: true,
        fecha_autorizacion: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

/** HU-04 CA2: editar datos de contacto. */
export async function actualizar(req, res, next) {
  try {
    const { nombre, telefono, correo } = req.body;
    const { data, error } = await supabase
      .from('clientes')
      .update({ nombre, telefono, correo })
      .eq('id', req.params.id)
      .eq('establecimiento_id', req.usuario.establecimientoId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}
