// HU-07 — Lógica del catálogo de servicios.
// CA2: cambiar el precio no altera órdenes pasadas (cada orden_servicios guarda su precio y duración).
// CA3: los servicios con activo=false no se ofrecen en nuevas órdenes; GET ?activo=true los excluye.

/** Traduce el cuerpo camelCase del API a las columnas snake_case de la tabla. */
function columnas({ nombre, precio, duracionMin, activo }) {
  return Object.fromEntries(
    Object.entries({ nombre, precio, duracion_min: duracionMin, activo }).filter(([, valor]) => valor !== undefined),
  );
}

/** Catálogo del establecimiento, de la A a la Z, opcionalmente solo activos o solo inactivos. */
export async function listar(req, res, next) {
  try {
    let consulta = req.tenant.listar('servicios').order('nombre');
    if (req.query.activo !== undefined) consulta = consulta.eq('activo', req.query.activo);
    const { data, error } = await consulta;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/** CA1: crear un servicio del establecimiento de la sesión. */
export async function crear(req, res, next) {
  try {
    const servicio = await req.tenant.crear('servicios', columnas(req.body));
    res.status(201).json(servicio);
  } catch (err) {
    next(err);
  }
}

/** CA2 y CA3: editar nombre, precio o duración, y activar/desactivar sin tocar órdenes pasadas. */
export async function actualizar(req, res, next) {
  try {
    const servicio = await req.tenant.actualizar('servicios', req.params.id, columnas(req.body), '*', 'Servicio');
    res.json(servicio);
  } catch (err) {
    next(err);
  }
}
