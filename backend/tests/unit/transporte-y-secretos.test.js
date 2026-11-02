// HU-50 CA1 y CA3: HTTPS obligatorio en producción, configuración validada y ningún secreto en el código.
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { exigirHttps } from '../../src/middlewares/https.js';
import { manejarErrores } from '../../src/middlewares/errorHandler.js';
import { validarEntorno } from '../../src/config/env.js';

describe('CA1: solo HTTPS en producción', () => {
  const crearApp = (produccion) => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(exigirHttps({ produccion }));
    app.get('/api/v1/clientes', (req, res) => res.json({ ok: true }));
    app.get('/api/v1/health', (req, res) => res.json({ ok: true }));
    app.use(manejarErrores);
    return app;
  };

  it('rechaza con 426 una petición que llegó por HTTP', async () => {
    const res = await request(crearApp(true)).get('/api/v1/clientes').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(426);
    expect(res.headers.upgrade).toMatch(/TLS/);
    expect(res.body.error).toMatchObject({ codigo: 'HTTPS_REQUERIDO', mensaje: 'Conexión no cifrada rechazada: usa https://' });
  });

  it('acepta la petición que llegó por HTTPS a través del proxy', async () => {
    const res = await request(crearApp(true)).get('/api/v1/clientes').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
  });

  it('el health check interno del proveedor no exige HTTPS', async () => {
    const res = await request(crearApp(true)).get('/api/v1/health').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(200);
  });

  it('en desarrollo local se permite HTTP', async () => {
    const res = await request(crearApp(false)).get('/api/v1/clientes');
    expect(res.status).toBe(200);
  });

  it('la API envía HSTS por un año', async () => {
    process.env.ZARU_CLAVE_CIFRADO ||= randomBytes(32).toString('base64');
    const { default: app } = await import('../../src/app.js');
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });
});

describe('CA3: configuración y secretos', () => {
  const valido = {
    SUPABASE_URL: 'https://proyecto.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40),
    ZARU_CLAVE_CIFRADO: randomBytes(32).toString('base64'),
  };

  it('acepta una configuración completa', () => {
    expect(validarEntorno(valido)).toMatchObject({ NODE_ENV: 'development', PORT: 4000 });
  });

  it('el servidor no arranca si falta un secreto y el error nombra la variable sin mostrar valores', () => {
    const { SUPABASE_SERVICE_ROLE_KEY, ...sinClave } = valido;
    expect(() => validarEntorno(sinClave)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => validarEntorno({ ...valido, ZARU_CLAVE_CIFRADO: 'corta' })).toThrow(/ZARU_CLAVE_CIFRADO: debe ser una clave de 32 bytes/);
    try {
      validarEntorno({ ...valido, ZARU_CLAVE_CIFRADO: 'corta' });
    } catch (e) {
      expect(e.message).not.toContain(valido.SUPABASE_SERVICE_ROLE_KEY);
    }
  });

  it('exige https para Supabase y, en producción, para el frontend', () => {
    expect(() => validarEntorno({ ...valido, SUPABASE_URL: 'http://proyecto.supabase.co' })).toThrow(/SUPABASE_URL: debe usar https/);
    expect(() => validarEntorno({ ...valido, NODE_ENV: 'production', FRONTEND_URL: 'http://zaru.app' })).toThrow(/FRONTEND_URL/);
  });

  it('ningún archivo versionado contiene secretos', () => {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const archivos = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean);
    const PATRONES = [
      ['clave secreta de Supabase', /sb_secret_[A-Za-z0-9_-]{16,}/],
      ['llave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ['token de GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/],
      ['clave de AWS', /AKIA[0-9A-Z]{16}/],
      ['variable secreta con valor', /^(SUPABASE_SERVICE_ROLE_KEY|ZARU_CLAVE_CIFRADO)=(?!pega-aqui|$).+/m],
    ];
    const hallazgos = [];
    for (const archivo of archivos) {
      if (/\.(png|jpg|ico|woff2?)$|package-lock\.json$/.test(archivo)) continue;
      const texto = readFileSync(join(raiz, archivo), 'utf8');
      for (const [nombre, patron] of PATRONES) if (patron.test(texto)) hallazgos.push(`${archivo}: ${nombre}`);
      // Un JWT con rol service_role es una clave secreta; el rol anon es público por diseño.
      for (const jwt of texto.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g) ?? []) {
        const carga = Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8');
        if (carga.includes('"service_role"')) hallazgos.push(`${archivo}: JWT service_role`);
      }
    }
    expect(hallazgos).toEqual([]);
  });
});
