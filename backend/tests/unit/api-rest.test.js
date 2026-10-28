// HU-43 (ZARU-50): documentación, versionado, formato de errores y validación.
// No requiere Supabase: usa rutas públicas, rechazos previos a la sesión y los esquemas directamente.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../../src/app.js';
import rutasV1, { MODULOS } from '../../src/routes/index.js';
import { contrato } from '../../src/docs.js';
import { validar } from '../../src/shared/validar.js';
import { manejarErrores } from '../../src/middlewares/errorHandler.js';
import { requestId } from '../../src/middlewares/requestId.js';
import { clienteNuevo, clienteCambios, busquedaClientes } from '../../src/schemas/clientes.schemas.js';

/** Rutas declaradas en Express, como "GET /clientes/{id}". */
function rutasDeclaradas() {
  const rutas = [];
  const agregar = (prefijo, router) => {
    for (const capa of router.stack) {
      if (!capa.route) continue;
      for (const metodo of Object.keys(capa.route.methods)) {
        const ruta = `${prefijo}${capa.route.path === '/' ? '' : capa.route.path}`.replace(/:(\w+)/g, '{$1}') || '/';
        rutas.push(`${metodo.toUpperCase()} ${ruta}`);
      }
    }
  };
  agregar('', rutasV1);
  for (const [prefijo, router] of MODULOS) agregar(prefijo, router);
  return rutas.sort();
}

const rutasDocumentadas = () =>
  Object.entries(contrato.paths)
    .flatMap(([ruta, operaciones]) =>
      Object.keys(operaciones).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).map((m) => `${m.toUpperCase()} ${ruta}`),
    )
    .sort();

describe('CA1: documentación OpenAPI', () => {
  it('todas las rutas de la API están documentadas y no hay rutas documentadas que no existan', () => {
    expect(rutasDocumentadas()).toEqual(rutasDeclaradas());
  });

  it('cada operación tiene resumen, respuestas y un operationId único', () => {
    const ids = new Set();
    for (const [ruta, operaciones] of Object.entries(contrato.paths)) {
      for (const [metodo, op] of Object.entries(operaciones)) {
        if (metodo === 'parameters') continue;
        expect(op.summary, `${metodo} ${ruta}`).toBeTruthy();
        expect(Object.keys(op.responses ?? {}).length, `${metodo} ${ruta}`).toBeGreaterThan(0);
        expect(ids.has(op.operationId), op.operationId).toBe(false);
        ids.add(op.operationId);
      }
    }
  });

  it('GET /api/openapi.json devuelve el contrato', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/clientes']).toBeDefined();
  });

  it('GET /api/docs/ muestra la documentación interactiva (Swagger UI)', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});

describe('CA2: errores estándar', () => {
  it('una ruta inexistente responde 404 con el formato estándar y requestId', async () => {
    const res2 = await request(app).get('/no-es-api');
    expect(res2.status).toBe(404);
    expect(res2.body.error).toMatchObject({ codigo: 'NO_ENCONTRADO', requestId: res2.headers['x-request-id'] });
  });

  it('una petición sin sesión responde 401 con el formato estándar', async () => {
    const res = await request(app).post('/api/v1/clientes').send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión', requestId: res.headers['x-request-id'] } });
  });

  // Mini aplicación con el validador y el manejador de errores reales.
  const prueba = express();
  prueba.use(requestId, express.json({ limit: '1mb' }));
  prueba.post('/clientes', validar({ body: clienteNuevo }), (req, res) => res.status(201).json(req.body));
  prueba.put('/clientes', validar({ body: clienteCambios }), (req, res) => res.json(req.body));
  prueba.get('/clientes', validar({ query: busquedaClientes }), (req, res) => res.json(req.query));
  prueba.get('/falla', () => {
    throw new Error('detalle interno: conexión a la base rechazada');
  });
  prueba.use(manejarErrores);

  it('un cuerpo incompleto responde 400 VALIDACION y lista cada campo a corregir', async () => {
    const res = await request(prueba).post('/clientes').send({ telefono: '123', autorizacionDatos: false });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect(res.body.error.mensaje).toBe('La solicitud tiene datos inválidos');
    expect(res.body.error.detalles).toEqual([
      { campo: 'nombre', mensaje: 'El nombre es obligatorio' },
      { campo: 'telefono', mensaje: 'El teléfono debe ser un celular colombiano de 10 dígitos que empiece por 3' },
      { campo: 'autorizacionDatos', mensaje: 'La autorización de tratamiento de datos es obligatoria (Ley 1581 de 2012)' },
      { campo: 'politicaVersion', mensaje: 'Indica la versión de la política de datos aceptada' },
    ]);
  });

  it('un correo inválido indica el campo y el formato esperado', async () => {
    const res = await request(prueba).post('/clientes').send({ nombre: 'Ana', telefono: '3001234567', correo: 'ana@', autorizacionDatos: true, politicaVersion: '1.0' });
    expect(res.body.error.detalles).toEqual([{ campo: 'correo', mensaje: 'El correo no tiene un formato válido' }]);
  });

  it('los datos válidos pasan limpios: sin espacios sobrantes ni campos desconocidos', async () => {
    const res = await request(prueba)
      .post('/clientes')
      .send({ nombre: '  Ana Gómez ', telefono: '3001234567', autorizacionDatos: true, politicaVersion: '1.0', establecimiento_id: 'otro' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ nombre: 'Ana Gómez', telefono: '3001234567', autorizacionDatos: true, politicaVersion: '1.0' });
  });

  it('una edición sin datos responde 400 con un mensaje claro', async () => {
    const res = await request(prueba).put('/clientes').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([{ campo: 'body', mensaje: 'Envía al menos un dato para actualizar' }]);
  });

  it('un parámetro de búsqueda demasiado largo responde 400', async () => {
    const res = await request(prueba).get('/clientes').query({ buscar: 'x'.repeat(61) });
    expect(res.status).toBe(400);
    expect(res.body.error.detalles[0].campo).toBe('buscar');
  });

  it('un JSON mal formado responde 400 VALIDACION', async () => {
    const res = await request(prueba).post('/clientes').set('Content-Type', 'application/json').send('{"nombre": "Ana",');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ codigo: 'VALIDACION', mensaje: 'El cuerpo de la solicitud no es un JSON válido' });
  });

  it('un error no controlado responde 500 sin exponer detalles internos', async () => {
    const original = console.error;
    console.error = () => {};
    const res = await request(prueba).get('/falla');
    console.error = original;
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor', requestId: res.headers['x-request-id'] });
    expect(JSON.stringify(res.body)).not.toContain('conexión');
  });
});

describe('CA3: versionado', () => {
  it('la versión actual responde en /api/v1 sin aviso de obsolescencia', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, version: '1.0.0' });
    expect(res.headers.deprecation).toBeUndefined();
  });

  it('la ruta anterior /api sigue funcionando igual y avisa cuál es la versión sucesora', async () => {
    const [anterior, actual] = await Promise.all([request(app).get('/api/health'), request(app).get('/api/v1/health')]);
    expect(anterior.status).toBe(200);
    expect(Object.keys(anterior.body)).toEqual(Object.keys(actual.body));
    expect(anterior.headers.deprecation).toBe('true');
    expect(anterior.headers.link).toBe('</api/v1>; rel="successor-version"');
  });

  it('las rutas privadas también funcionan con y sin versión', async () => {
    const [anterior, actual] = await Promise.all([request(app).get('/api/clientes'), request(app).get('/api/v1/clientes')]);
    expect(anterior.status).toBe(401);
    expect(actual.status).toBe(401);
  });

  it('una versión que no existe responde 404', async () => {
    const res = await request(app).get('/api/v9/health');
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });
});

describe('seguridad HTTP', () => {
  it('incluye encabezados de seguridad y no revela la tecnología del servidor', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
