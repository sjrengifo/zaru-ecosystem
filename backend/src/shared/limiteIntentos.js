// Límite de intentos fallidos por origen (RNF-F5-01), en memoria del proceso.
// Evita que alguien pruebe códigos de seguimiento al azar: tras `maximo` fallos dentro de la
// ventana, ese origen recibe 429 hasta que la ventana se vacía. Un acierto no borra los fallos.
import { AppError } from './errores.js';

export function crearLimiteIntentos({ maximo = 10, ventanaMs = 10 * 60 * 1000, ahora = () => Date.now() } = {}) {
  const fallos = new Map();

  const recientes = (origen) => {
    const limite = ahora() - ventanaMs;
    const lista = (fallos.get(origen) ?? []).filter((t) => t > limite);
    if (lista.length) fallos.set(origen, lista);
    else fallos.delete(origen);
    return lista;
  };

  return {
    /** Lanza LIMITE_EXCEDIDO si el origen ya agotó sus intentos. */
    verificar(origen) {
      if (recientes(origen).length >= maximo) {
        throw new AppError('LIMITE_EXCEDIDO', 'Demasiados intentos con códigos no válidos. Espera unos minutos e inténtalo de nuevo');
      }
    },
    registrarFallo(origen) {
      fallos.set(origen, [...recientes(origen), ahora()]);
    },
    reiniciar() {
      fallos.clear();
    },
  };
}
