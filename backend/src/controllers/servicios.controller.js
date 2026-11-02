// HU-07 — Lógica del catálogo de servicios.
// TODO CA2: cambiar el precio NO altera órdenes pasadas (ya se guarda el precio en orden_servicios).
// TODO CA3: los servicios con activo=false no se ofrecen en nuevas órdenes.
import { pendiente } from './pendiente.js';

export async function listar(req, res, next) {
  try {
    const { data, error } = await req.tenant.listar('servicios').order('nombre');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export const crear = pendiente('HU-07');
export const actualizar = pendiente('HU-07');
