// HU-32 — Plantillas de notificación con la marca de la sede (ZARU-21 · RF-F7-01 a RF-F7-05).
// Solo el administrador de la sede (módulo "notificaciones"). Todo pasa por req.tenant (HU-41):
// una sede nunca ve ni cambia las plantillas de otra. La lógica está en shared/plantillasNotificacion.js.
import * as plantillas from '../shared/plantillasNotificacion.js';

/** GET /plantillas — las de la sede y, donde no personalizó, las de la plataforma (RF-F7-05). */
export async function listar(req, res, next) {
  try {
    res.json(await plantillas.listarPlantillas(req.tenant));
  } catch (err) {
    next(err);
  }
}

/** PUT /plantillas/:estado/:canal — guarda; 400 con la variable inválida y su posición (CA4). */
export async function guardar(req, res, next) {
  try {
    const { estado, canal } = req.params;
    res.json(await plantillas.guardarPlantilla(req.tenant, req.usuario?.id, { estado, canal, ...req.body }));
  } catch (err) {
    next(err);
  }
}

/** DELETE /plantillas/:estado/:canal — vuelve al texto de la plataforma. */
export async function restaurar(req, res, next) {
  try {
    res.json(await plantillas.restaurarPlantilla(req.tenant, req.params));
  } catch (err) {
    next(err);
  }
}

/** POST /plantillas/vista-previa — push, SMS y correo con datos de ejemplo y la marca (CA3). */
export async function vistaPrevia(req, res, next) {
  try {
    res.json(await plantillas.vistaPrevia(req.tenant, req.body));
  } catch (err) {
    next(err);
  }
}
