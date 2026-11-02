// HU-13 — Lógica del establecimiento y su branding (logo y colores).
// - Multi-tenant (HU-41): la tabla y el bucket `logos` se usan con req.tenant; los archivos quedan en
//   logos/{establecimientoId}/.
// - Validación (HU-43): los colores llegan validados por schemas/establecimiento.schemas.js y el
//   archivo por shared/logo.js (recibirLogo) antes de llegar aquí.
import { formatoDeLogo, logoInvalido } from '../shared/logo.js';

/** El establecimiento de la sesión: en esta tabla el identificador de tenant es el propio id. */
export async function obtener(req, res, next) {
  try {
    res.json(await req.tenant.obtener('establecimientos', req.tenant.establecimientoId, '*', 'Establecimiento'));
  } catch (err) {
    next(err);
  }
}

/** HU-13 CA1 y CA2: guardar los colores principales (RF-F4-08). */
export async function actualizarBranding(req, res, next) {
  try {
    const { colorPrimario, colorSecundario } = req.body;
    const id = req.tenant.establecimientoId;
    res.json(
      await req.tenant.actualizar('establecimientos', id, { color_primario: colorPrimario, color_secundario: colorSecundario }, '*', 'Establecimiento'),
    );
  } catch (err) {
    next(err);
  }
}

/** HU-13 CA1, CA2 y CA3: subir el logo (PNG o JPG de máximo 2 MB por contenido) y reemplazar el anterior. */
export async function subirLogo(req, res, next) {
  try {
    const tipo = formatoDeLogo(req.file?.buffer);
    if (!tipo) throw logoInvalido(req.file ? 'El archivo no es una imagen PNG o JPG' : 'Selecciona un archivo de logo');

    const id = req.tenant.establecimientoId;
    const logos = req.tenant.archivos('logos');
    const anterior = await req.tenant.obtener('establecimientos', id, 'logo_url', 'Establecimiento');

    const nuevo = await logos.subir(`logo-${Date.now()}.${tipo.formato}`, req.file.buffer, { contentType: tipo.contentType, cacheControl: '31536000' });

    let establecimiento;
    try {
      establecimiento = await req.tenant.actualizar('establecimientos', id, { logo_url: nuevo.url }, '*', 'Establecimiento');
    } catch (err) {
      await logos.borrar(nuevo.ruta); // Sin guardar la URL, el archivo quedaría huérfano.
      throw err;
    }

    // El logo anterior se borra al final: si falla, la sede ya tiene su logo nuevo y solo queda un archivo de más.
    const rutaAnterior = logos.rutaDeUrl(anterior.logo_url);
    const error = rutaAnterior && (await logos.borrar(rutaAnterior));
    if (error) console.error(`[${req.requestId}] No se pudo borrar el logo anterior ${rutaAnterior}`, error.message);

    res.json(establecimiento);
  } catch (err) {
    next(err);
  }
}
