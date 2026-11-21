// Acceso de tenant falso (req.tenant) para pruebas unitarias de controladores y servicios.
// - listar(tabla) devuelve un query builder encadenable que resuelve la siguiente respuesta
//   configurada para esa tabla y registra cada filtro aplicado.
// - crear, obtener, actualizar, crearDetalle y eliminar son vi.fn() configurables.
import { vi } from 'vitest';

export function crearTenantFalso(respuestasPorTabla = {}) {
  const colas = Object.fromEntries(Object.entries(respuestasPorTabla).map(([t, r]) => [t, [...r]]));
  const consultas = [];

  function listar(tabla, columnas) {
    const registro = { tabla, columnas, filtros: [] };
    consultas.push(registro);
    const builder = new Proxy({}, {
      get(_, metodo) {
        if (metodo === 'then') {
          const respuesta = colas[tabla]?.shift() ?? { data: [], error: null };
          return (resolver, rechazar) => Promise.resolve(respuesta).then(resolver, rechazar);
        }
        return (...args) => {
          registro.filtros.push([metodo, ...args]);
          return builder;
        };
      },
    });
    return builder;
  }

  return {
    establecimientoId: 'eeeeeeee-0000-4000-8000-000000000001',
    consultas,
    listar: vi.fn(listar),
    obtener: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(async (tabla, id, cambios) => ({ id, ...cambios })),
    crearDetalle: vi.fn(async () => []),
    eliminar: vi.fn(async () => {}),
  };
}

/** Respuesta HTTP falsa de Express. */
export function respuestaFalsa() {
  return {
    statusCode: 200,
    status: vi.fn(function status(codigo) { this.statusCode = codigo; return this; }),
    json: vi.fn(function json(cuerpo) { this.body = cuerpo; return this; }),
    set: vi.fn(function set() { return this; }),
  };
}

/** Ejecuta un controlador (req, res, next) y devuelve la respuesta y el error enviado a next. */
export async function ejecutar(controlador, req) {
  const res = respuestaFalsa();
  let error;
  await controlador(req, res, (e) => { error = e; });
  return { res, error };
}
