// HU-30 CA3 — "Dejar de recibir" desde el enlace del correo, sin iniciar sesión.
//
// GET  /publico/baja/{token}  qué autorización se va a revocar y de qué sede (para confirmar).
// POST /publico/baja/{token}  revoca y confirma. Es un POST a propósito: los filtros antispam y las
//                             vistas previas de los correos abren los enlaces (GET) por su cuenta, y eso
//                             no debe dar de baja a nadie.
import { confirmarBaja, consultarBaja } from '../shared/bajaPublica.js';
import { crearLimiteIntentos } from '../shared/limiteIntentos.js';

export const limiteEnlaces = crearLimiteIntentos({ maximo: 10 });
const origenDe = (req) => req.ip ?? 'desconocido';

async function conLimite(req, accion) {
  const origen = origenDe(req);
  limiteEnlaces.verificar(origen);
  try {
    return await accion();
  } catch (err) {
    if (err?.codigo === 'NO_ENCONTRADO') limiteEnlaces.registrarFallo(origen);
    throw err;
  }
}

export async function consultar(req, res, next) {
  try {
    const resultado = await conLimite(req, () => consultarBaja(req.params.token));
    res.set('Cache-Control', 'no-store');
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function confirmar(req, res, next) {
  try {
    const resultado = await conLimite(req, () => confirmarBaja(req.params.token, { ip: req.ip ?? null }));
    res.set('Cache-Control', 'no-store');
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}
