// Cliente de Supabase falso para pruebas unitarias: registra cada llamada del query builder
// y devuelve la respuesta configurada. Permite verificar qué filtros aplica la capa de datos.

export function crearSupabaseFalso(respuesta = { data: null, error: null }) {
  const llamadas = [];
  const builder = new Proxy(
    {},
    {
      get(_, metodo) {
        if (metodo === 'then') {
          return (resolver, rechazar) => Promise.resolve(respuesta).then(resolver, rechazar);
        }
        return (...args) => {
          llamadas.push([metodo, ...args]);
          return builder;
        };
      },
    },
  );
  return {
    llamadas,
    from(tabla) {
      llamadas.push(['from', tabla]);
      return builder;
    },
    rpc(funcion, argumentos) {
      llamadas.push(['rpc', funcion, argumentos]);
      return builder;
    },
    responder(nueva) {
      respuesta = nueva;
    },
  };
}
