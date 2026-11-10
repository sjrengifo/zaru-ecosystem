// HU-17 — Acceso del cliente final a la plataforma móvil (sin sesión ni contraseña).
//
// GET  /publico/sedes/{slug}         nombre y marca de la sede para la pantalla de inicio (CA2, CA3).
// POST /publico/sedes/{slug}/buscar  { placa } o { celular } → código de seguimiento de la orden
//                                    activa (CA1, CA2) o 404 "El vehículo no se encuentra en servicio
//                                    actualmente" (CA4).
//
// Seguridad (RNF-F5-01, HU-59 CA1): tras 5 búsquedas sin resultado en 10 minutos desde un mismo
// origen, se responde 429 hasta que pasa la ventana. Así no se puede recorrer la lista de placas
// o celulares de una sede.
import { buscarOrdenActiva, cargarSede, sedePublica } from '../shared/accesoCliente.js';
import { crearLimiteIntentos } from '../shared/limiteIntentos.js';
import { AppError } from '../shared/errores.js';

export const limiteBusquedas = crearLimiteIntentos({ maximo: 5 });
const origenDe = (req) => req.ip ?? 'desconocido';

const MENSAJE_LIMITE = 'Hiciste demasiadas búsquedas sin resultado. Espera unos minutos e inténtalo de nuevo';

/** Nombre y marca de la sede del enlace. */
export async function sede(req, res, next) {
  try {
    const encontrada = await cargarSede(req.params.slug);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(sedePublica(encontrada));
  } catch (err) {
    next(err);
  }
}

/** Busca la orden activa de la placa o del celular en la sede. */
export async function buscar(req, res, next) {
  const origen = origenDe(req);
  try {
    try {
      limiteBusquedas.verificar(origen);
    } catch {
      throw new AppError('LIMITE_EXCEDIDO', MENSAJE_LIMITE);
    }
    const resultado = await buscarOrdenActiva(req.params.slug, req.body);
    res.set('Cache-Control', 'no-store');
    res.json(resultado);
  } catch (err) {
    if (err?.codigo === 'NO_ENCONTRADO') limiteBusquedas.registrarFallo(origen);
    next(err);
  }
}
