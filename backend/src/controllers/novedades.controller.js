// HU-37 CA2 — Evidencia privada de novedades del operario.
import { randomUUID } from 'node:crypto';
import { AppError } from '../shared/errores.js';
import { formatoDeEvidencia } from '../shared/evidencias.js';

const NO_ENCONTRADA = () => new AppError('NO_ENCONTRADO', 'Novedad no encontrada');

export async function subirFotos(req, res, next) {
  const cargadas = [];
  try {
    const { id: ordenId, novedadId } = req.params;
    const evidencias = req.tenant.archivos('evidencias');
    await req.tenant.obtener('ordenes', ordenId, 'id', 'Orden');
    const { data: novedad, error } = await req.tenant
      .listar('novedades', 'id, tipo, fotos')
      .eq('id', novedadId)
      .eq('orden_id', ordenId)
      .maybeSingle();
    if (error) throw error;
    if (!novedad) throw NO_ENCONTRADA();
    if (novedad.tipo !== 'dano_preexistente') {
      throw new AppError('VALIDACION', 'Las fotos solo se pueden adjuntar a daños preexistentes', [{ campo: 'fotos', mensaje: 'Tipo de novedad no admite fotos' }]);
    }

    const anteriores = novedad.fotos ?? [];
    if (anteriores.length + req.files.length > 3) {
      throw new AppError('VALIDACION', 'Una novedad admite máximo 3 fotos', [{ campo: 'fotos', mensaje: 'Se excedió el máximo de 3 fotos' }]);
    }

    for (const archivo of req.files) {
      const tipo = formatoDeEvidencia(archivo.buffer);
      if (!tipo) throw new AppError('VALIDACION', 'Cada archivo debe ser una imagen JPG o PNG válida', [{ campo: 'fotos', mensaje: 'Formato de imagen no válido' }]);
      const ruta = `${req.tenant.establecimientoId}/${ordenId}/${novedadId}/${randomUUID()}.${tipo.extension}`;
      await evidencias.subirEn(ruta, archivo.buffer, {
        contentType: tipo.contentType,
        cacheControl: '3600',
      });
      cargadas.push(ruta);
    }

    const fotos = [...anteriores, ...cargadas];
    const fotosFirmadas = await evidencias.urlsFirmadas(fotos, 60 * 60);
    await req.tenant.actualizar('novedades', novedadId, { fotos }, '*', 'Novedad');
    res.status(201).json({ fotos: fotosFirmadas });
  } catch (err) {
    if (cargadas.length) await req.tenant.archivos('evidencias').borrarVarias(cargadas).catch(() => {});
    next(err);
  }
}

export async function listar(req, res, next) {
  try {
    const { id: ordenId } = req.params;
    const evidencias = req.tenant.archivos('evidencias');
    await req.tenant.obtener('ordenes', ordenId, 'id', 'Orden');
    const { data, error } = await req.tenant
      .listar('novedades', 'id, tipo, mensaje, minutos_extra, fotos, created_at')
      .eq('orden_id', ordenId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const novedades = await Promise.all((data ?? []).map(async (novedad) => ({
      id: novedad.id,
      tipo: novedad.tipo,
      mensaje: novedad.mensaje,
      minutosExtra: novedad.minutos_extra,
      createdAt: novedad.created_at,
      fotos: await evidencias.urlsFirmadas(novedad.fotos ?? [], 60 * 60),
    })));
    res.json(novedades);
  } catch (err) {
    next(err);
  }
}
