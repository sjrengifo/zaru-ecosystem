// HU-51 CA1 — Política de tratamiento de datos que se muestra antes de registrar al titular.
import { obtenerPoliticaVigente } from '../shared/politicas.js';

export async function vigente(req, res, next) {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await obtenerPoliticaVigente());
  } catch (err) {
    next(err);
  }
}
