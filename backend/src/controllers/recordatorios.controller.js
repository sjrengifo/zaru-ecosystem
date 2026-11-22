// HU-36 CA3 — Baja de los recordatorios de un vehículo desde el enlace del correo.
//
// GET  /publico/recordatorios/{token}/desactivar  muestra el vehículo y su estado.
// POST /publico/recordatorios/{token}/desactivar  desactiva solo esos recordatorios.
import { consultarRecordatorio, desactivarRecordatorio } from '../shared/recordatorioPublico.js';
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
    const resultado = await conLimite(req, () => consultarRecordatorio(req.params.token));
    res.set('Cache-Control', 'no-store');
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function desactivar(req, res, next) {
  try {
    const resultado = await conLimite(req, () => desactivarRecordatorio(req.params.token));
    res.set('Cache-Control', 'no-store');
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}
