import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storage } = vi.hoisted(() => ({
  storage: {
    upload: vi.fn(),
    remove: vi.fn(),
    createSignedUrls: vi.fn(),
  },
}));
const { subirFotos, listar } = await import('../../src/controllers/novedades.controller.js');
const { formatoDeEvidencia } = await import('../../src/shared/evidencias.js');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function tenantPara(novedad, fotos = []) {
  const builder = {
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: novedad, error: null })),
    then: (resolver) => Promise.resolve({ data: fotos, error: null }).then(resolver),
  };
  return {
    establecimientoId: 'eeeeeeee-0000-4000-8000-000000000001',
    obtener: vi.fn(async () => ({ id: 'orden-1' })),
    listar: vi.fn(() => builder),
    actualizar: vi.fn(async (_tabla, id, cambios) => ({ id, ...cambios })),
    archivos: vi.fn(() => ({
      subirEn: async (ruta, buffer, opciones) => {
        const { error } = await storage.upload(ruta, buffer, opciones);
        if (error) throw error;
      },
      urlsFirmadas: async (rutas) => {
        const { data, error } = await storage.createSignedUrls(rutas, 3600);
        if (error) throw error;
        return data.map((fila, indice) => ({ ruta: rutas[indice], url: fila.signedUrl }));
      },
      borrarVarias: async (rutas) => {
        const { error } = await storage.remove(rutas);
        return error;
      },
    })),
  };
}

const respuesta = () => ({ status: vi.fn(function status(n) { this.codigo = n; return this; }), json: vi.fn(function json(d) { this.datos = d; return this; }) });

describe('HU-37 evidencia fotográfica', () => {
  beforeEach(() => {
    storage.upload.mockReset().mockResolvedValue({ error: null });
    storage.remove.mockReset().mockResolvedValue({ error: null });
    storage.createSignedUrls.mockReset().mockImplementation(async (rutas) => ({
      data: rutas.map((ruta) => ({ signedUrl: `https://storage.local/${ruta}?token=firmado` })),
      error: null,
    }));
  });

  it('reconoce PNG por su firma real', () => {
    expect(formatoDeEvidencia(PNG)).toEqual({ extension: 'png', contentType: 'image/png' });
    expect(formatoDeEvidencia(Buffer.from('no es una foto'))).toBeNull();
  });

  it('sube las fotos a almacenamiento privado y guarda sus rutas en el historial', async () => {
    const tenant = tenantPara({ id: 'novedad-1', tipo: 'dano_preexistente', fotos: [] });
    const req = {
      params: { id: 'orden-1', novedadId: 'novedad-1' },
      tenant,
      files: [{ buffer: PNG }, { buffer: PNG }],
    };
    const res = respuesta();
    let error;

    await subirFotos(req, res, (e) => { error = e; });

    expect(error).toBeUndefined();
    expect(storage.upload).toHaveBeenCalledTimes(2);
    const [rutas] = storage.createSignedUrls.mock.calls[0];
    expect(rutas).toHaveLength(2);
    expect(rutas.every((ruta) => ruta.startsWith(`${tenant.establecimientoId}/orden-1/novedad-1/`))).toBe(true);
    expect(tenant.actualizar).toHaveBeenCalledWith('novedades', 'novedad-1', { fotos: rutas }, '*', 'Novedad');
    expect(res.codigo).toBe(201);
    expect(res.datos.fotos).toHaveLength(2);
  });

  it('rechaza evidencia para novedades que no son daño preexistente', async () => {
    const tenant = tenantPara({ id: 'novedad-1', tipo: 'demora', fotos: [] });
    let error;
    await subirFotos({ params: { id: 'orden-1', novedadId: 'novedad-1' }, tenant, files: [{ buffer: PNG }] }, respuesta(), (e) => { error = e; });
    expect(error.codigo).toBe('VALIDACION');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('devuelve URLs firmadas al consultar las novedades del historial', async () => {
    const tenant = tenantPara(null, [{ id: 'novedad-1', tipo: 'dano_preexistente', mensaje: 'Rayón', minutos_extra: null, fotos: ['sede/orden/novedad/foto.png'], created_at: '2026-11-19T12:00:00Z' }]);
    const res = respuesta();
    let error;
    await listar({ params: { id: 'orden-1' }, tenant }, res, (e) => { error = e; });
    expect(error).toBeUndefined();
    expect(res.datos[0].fotos[0].url).toContain('token=firmado');
  });
});
