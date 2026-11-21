// HU-35 (ZARU-24) — Campañas de promociones segmentadas.
//
// Solo el administrador de la sede. Todo pasa por req.tenant (HU-41): el establecimiento sale de la
// sesión y el `establecimiento_id` que llegara en el cuerpo se ignora.
//   - POST /campanas/estimar: previsualización con el total y las exclusiones (CA2, CA3).
//   - POST /campanas: crea la campaña y ajusta la hora al horario de Bogotá (CA4).
//   - GET /campanas: historial paginado.
import { AppError } from '../shared/errores.js';
import { estimar as estimarCampana, crear as crearCampana, fotoPromocion, listar as listarCampanas } from '../shared/campanas.js';

const MAX_CLAVE = 200;

/** Encabezado obligatorio para que reintentar la petición no cree dos campañas. */
function claveDeIdempotencia(req) {
  const clave = String(req.get?.('Idempotency-Key') ?? req.headers?.['idempotency-key'] ?? '').trim();
  if (!clave) {
    throw new AppError('VALIDACION', 'Falta el encabezado Idempotency-Key', [
      { campo: 'Idempotency-Key', mensaje: 'Envía una clave única para no duplicar la campaña' },
    ]);
  }
  if (clave.length > MAX_CLAVE) {
    throw new AppError('VALIDACION', 'El encabezado Idempotency-Key es demasiado largo', [
      { campo: 'Idempotency-Key', mensaje: `Máximo ${MAX_CLAVE} caracteres` },
    ]);
  }
  return clave;
}

/** POST /campanas/estimar — no crea nada; solo cuenta destinatarios y exclusiones. */
export async function estimar(req, res, next) {
  try {
    const { promocionId, segmento } = req.body;
    const calculo = await estimarCampana(req.tenant, { promocionId, segmento });
    res.json({
      total: calculo.total,
      exclusiones: calculo.exclusiones,
      promocion: fotoPromocion(calculo.promocion),
    });
  } catch (err) {
    next(err);
  }
}

/** POST /campanas — confirma la campaña con la hora ya ajustada. */
export async function crear(req, res, next) {
  try {
    const claveIdempotencia = claveDeIdempotencia(req);
    const { promocionId, segmento, programadaPara } = req.body;
    const campana = await crearCampana(
      req.tenant,
      { promocionId, segmento, programadaPara },
      { usuarioId: req.ctx?.usuarioId ?? null, claveIdempotencia },
    );
    res.status(201).json(campana);
  } catch (err) {
    next(err);
  }
}

/** GET /campanas — historial de la sede, de la más reciente a la más antigua. */
export async function listar(req, res, next) {
  try {
    res.json(await listarCampanas(req.tenant, req.query));
  } catch (err) {
    next(err);
  }
}
