// HU-13: branding de la sede. Colores, formato real del logo y reemplazo en Storage, sin Supabase:
// usa la capa multi-tenant real sobre un Storage simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { branding } from '../../src/schemas/establecimiento.schemas.js';
import { formatoDeLogo, recibirLogo, REQUISITOS_LOGO } from '../../src/shared/logo.js';
import { subirLogo, actualizarBranding } from '../../src/controllers/establecimiento.controller.js';
import { crearAccesoTenant } from '../../src/shared/tenant.js';
import { requestId } from '../../src/middlewares/requestId.js';
import { manejarErrores } from '../../src/middlewares/errorHandler.js';

const logos = { upload: vi.fn(), getPublicUrl: vi.fn(), remove: vi.fn() };
const buckets = [];
const dbFalsa = { storage: { from: (bucket) => (buckets.push(bucket), logos) } };

const SEDE = 'aaaaaaaa-0000-4000-8000-000000000013';
const URL_BASE = 'https://proyecto.supabase.co/storage/v1/object/public/logos/';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const GIF = Buffer.from('GIF89a', 'ascii');
const conTamano = (cabecera, bytes) => Buffer.concat([cabecera, Buffer.alloc(bytes - cabecera.length)]);

describe('RF-F4-08: colores #RRGGBB', () => {
  const errores = (datos) => branding.safeParse({ colorPrimario: '#2563EB', colorSecundario: '#0EA5E9', ...datos }).error?.issues.map((i) => i.path[0]);

  it('acepta mayúsculas o minúsculas y guarda en mayúsculas', () => {
    expect(branding.parse({ colorPrimario: ' #0f766e ', colorSecundario: '#F59e0B' })).toEqual({ colorPrimario: '#0F766E', colorSecundario: '#F59E0B' });
  });

  it.each(['#FFF', '#12345', 'azul', '#GGGGGG', '2563EB', '#2563EB0'])('rechaza %s indicando el formato', (color) => {
    const { error } = branding.safeParse({ colorPrimario: color, colorSecundario: '#0EA5E9' });
    expect(error.issues[0].message).toBe('El color primario debe tener el formato #RRGGBB, por ejemplo #2563EB');
  });

  it('ambos colores son obligatorios', () => {
    expect(errores({ colorPrimario: undefined, colorSecundario: undefined })).toEqual(['colorPrimario', 'colorSecundario']);
  });
});

describe('RNF-F4-01: el formato se decide por el contenido', () => {
  it('reconoce PNG y JPG por su firma', () => {
    expect(formatoDeLogo(PNG)).toEqual({ formato: 'png', contentType: 'image/png' });
    expect(formatoDeLogo(JPG)).toEqual({ formato: 'jpg', contentType: 'image/jpeg' });
  });

  it.each([
    ['un texto renombrado a .png', Buffer.from('esto no es una imagen')],
    ['un GIF', GIF],
    ['un archivo vacío', Buffer.alloc(0)],
    ['un PNG cortado', PNG.subarray(0, 4)],
  ])('rechaza %s', (_, buffer) => {
    expect(formatoDeLogo(buffer)).toBeNull();
  });
});

/** Mini aplicación con el lector de multipart, el controlador y el manejador de errores reales. */
function crearApp(tenant) {
  const app = express();
  app.use(requestId, express.json());
  app.use((req, res, next) => ((req.tenant = tenant), next()));
  app.post('/logo', recibirLogo, subirLogo);
  app.put('/branding', actualizarBranding);
  app.use(manejarErrores);
  return app;
}

/** Acceso multi-tenant real (incluido `archivos`); solo la tabla se simula. */
function tenantFalso(logoActual) {
  return Object.assign(crearAccesoTenant(dbFalsa, { establecimientoId: SEDE }), {
    obtener: vi.fn(async () => ({ logo_url: logoActual })),
    actualizar: vi.fn(async (tabla, id, cambios) => ({ id, nombre: 'Lavadero', ...cambios })),
  });
}

const subir = (app, buffer, nombre) => request(app).post('/logo').attach('logo', buffer, nombre);

beforeEach(() => {
  vi.clearAllMocks();
  buckets.length = 0;
  logos.upload.mockResolvedValue({ data: {}, error: null });
  logos.remove.mockResolvedValue({ data: [], error: null });
  logos.getPublicUrl.mockImplementation((ruta) => ({ data: { publicUrl: URL_BASE + ruta } }));
});

describe('ESC-F4-05: logo válido (HU-13 CA1, CA2)', () => {
  it('un PNG de 500 KB se guarda en la carpeta de la sede, queda su URL pública y se borra el anterior', async () => {
    const tenant = tenantFalso(`${URL_BASE}${SEDE}/logo-1.png`);
    const res = await subir(crearApp(tenant), conTamano(PNG, 500 * 1024), 'logo.png');

    expect(res.status).toBe(200);
    const [ruta, , opciones] = logos.upload.mock.calls[0];
    expect(buckets).toEqual(['logos']);
    expect(ruta).toMatch(new RegExp(`^${SEDE}/logo-\\d+\\.png$`));
    expect(opciones).toMatchObject({ contentType: 'image/png', upsert: false });
    expect(res.body.logo_url).toBe(URL_BASE + ruta);
    expect(tenant.actualizar).toHaveBeenCalledWith('establecimientos', SEDE, { logo_url: URL_BASE + ruta }, '*', 'Establecimiento');
    expect(logos.remove).toHaveBeenCalledWith([`${SEDE}/logo-1.png`]);
  });

  it('un JPG con extensión .png se guarda como .jpg: manda el contenido, no el nombre', async () => {
    await subir(crearApp(tenantFalso(null)), JPG, 'foto.png');
    expect(logos.upload.mock.calls[0][0]).toMatch(/\.jpg$/);
    expect(logos.upload.mock.calls[0][2].contentType).toBe('image/jpeg');
  });

  it('no borra un logo anterior que no está en la carpeta de la sede', async () => {
    await subir(crearApp(tenantFalso(`${URL_BASE}otra-sede/logo-1.png`)), PNG, 'logo.png');
    await subir(crearApp(tenantFalso(`${URL_BASE}${SEDE}/../otra-sede/logo-1.png`)), PNG, 'logo.png');
    await subir(crearApp(tenantFalso('https://ejemplo.com/logo.png')), PNG, 'logo.png');
    expect(logos.remove).not.toHaveBeenCalled();
  });

  it('si no se puede guardar la URL, borra el archivo recién subido', async () => {
    const tenant = tenantFalso(null);
    tenant.actualizar.mockRejectedValue(new Error('base caída'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await subir(crearApp(tenant), PNG, 'logo.png');

    expect(res.status).toBe(500);
    expect(logos.remove).toHaveBeenCalledWith([logos.upload.mock.calls[0][0]]);
  });
});

describe('ESC-F4-06: logo inválido (HU-13 CA3)', () => {
  it.each([
    ['un .png que no es imagen', Buffer.from('esto no es una imagen'), 'falso.png', 'El archivo no es una imagen PNG o JPG'],
    ['un GIF', GIF, 'logo.gif', 'El archivo no es una imagen PNG o JPG'],
    ['un PNG de 3 MB', conTamano(PNG, 3 * 1024 * 1024), 'grande.png', 'El archivo supera 2 MB'],
  ])('%s responde 400 con los requisitos y no sube nada', async (_, buffer, nombre, mensaje) => {
    const res = await subir(crearApp(tenantFalso(null)), buffer, nombre);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ codigo: 'VALIDACION', mensaje, detalles: [{ campo: 'logo', mensaje: REQUISITOS_LOGO }] });
    expect(logos.upload).not.toHaveBeenCalled();
  });

  it('una petición sin archivo pide seleccionarlo', async () => {
    const res = await request(crearApp(tenantFalso(null))).post('/logo').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('Selecciona un archivo de logo');
  });

  it('un archivo en otro campo se rechaza con los requisitos', async () => {
    const res = await request(crearApp(tenantFalso(null))).post('/logo').attach('imagen', PNG, 'logo.png');
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'logo', mensaje: REQUISITOS_LOGO }]);
  });
});

describe('PUT /establecimiento/branding', () => {
  it('guarda los colores en el establecimiento de la sesión', async () => {
    const tenant = tenantFalso(null);
    const app = express();
    app.use(express.json(), (req, res, next) => ((req.tenant = tenant), next()));
    app.put('/branding', (req, res, next) => ((req.body = branding.parse(req.body)), next()), actualizarBranding);

    const res = await request(app).put('/branding').send({ colorPrimario: '#0f766e', colorSecundario: '#f59e0b' });
    expect(res.status).toBe(200);
    expect(tenant.actualizar).toHaveBeenCalledWith('establecimientos', SEDE, { color_primario: '#0F766E', color_secundario: '#F59E0B' }, '*', 'Establecimiento');
  });
});
