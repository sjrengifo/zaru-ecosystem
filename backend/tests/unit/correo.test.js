// HU-46 — Proveedores de correo y plantillas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { crearProveedorCorreo, conTiempoMaximo, enmascararCorreo } from '../../src/shared/correo.js';
import { plantillaIngreso, plantillaListo, escaparHtml, formatoPesos } from '../../src/shared/plantillasCorreo.js';
import { validarEntorno } from '../../src/config/env.js';

const ENV_BASE = {
  SUPABASE_URL: 'https://ejemplo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40),
  ZARU_CLAVE_CIFRADO: Buffer.alloc(32, 1).toString('base64'),
};

afterEach(() => vi.restoreAllMocks());

describe('HU-46 · proveedores de correo', () => {
  it('por defecto usa "consola": no envía nada y no muestra el correo completo en el log', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const proveedor = crearProveedorCorreo({});
    const { idProveedor } = await proveedor.enviar({ para: 'juan.perez@correo.com', asunto: 'Hola', html: '<p>x</p>', texto: 'x' });

    expect(proveedor.nombre).toBe('consola');
    expect(idProveedor).toMatch(/^consola-/);
    expect(log.mock.calls[0][0]).toContain('j***@correo.com');
    expect(log.mock.calls[0][0]).not.toContain('juan.perez');
  });

  it('resend: llama a la API con remitente, destino, asunto, HTML y texto', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'res_123' }) });
    const proveedor = crearProveedorCorreo(
      { CORREO_PROVEEDOR: 'resend', RESEND_API_KEY: 're_test', CORREO_REMITENTE: 'Zaru <no-responder@zaru.app>' },
      { fetch },
    );

    const resultado = await proveedor.enviar({ para: 'ana@correo.com', asunto: 'Listo', html: '<b>ok</b>', texto: 'ok' });

    expect(resultado).toEqual({ idProveedor: 'res_123' });
    const [url, opciones] = fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opciones.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(opciones.body)).toEqual({
      from: 'Zaru <no-responder@zaru.app>', to: ['ana@correo.com'], subject: 'Listo', html: '<b>ok</b>', text: 'ok',
    });
  });

  it('resend: un error del proveedor se convierte en excepción para poder reintentar', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'dominio no verificado' }) });
    const proveedor = crearProveedorCorreo({ CORREO_PROVEEDOR: 'resend', RESEND_API_KEY: 'k' }, { fetch });

    await expect(proveedor.enviar({ para: 'a@b.co', asunto: 'x', html: '', texto: '' })).rejects.toThrow('422: dominio no verificado');
  });

  it('CA3: un proveedor que no responde se corta por tiempo máximo', async () => {
    await expect(conTiempoMaximo(new Promise(() => {}), 20)).rejects.toThrow('no respondió');
  });

  it('enmascara correos para logs y para el panel', () => {
    expect(enmascararCorreo('maria@gmail.com')).toBe('m***@gmail.com');
    expect(enmascararCorreo('sin-arroba')).toBe('***');
  });

  it('el entorno exige la clave de Resend o el host SMTP según el proveedor elegido', () => {
    expect(validarEntorno(ENV_BASE).CORREO_PROVEEDOR).toBe('consola');
    expect(() => validarEntorno({ ...ENV_BASE, CORREO_PROVEEDOR: 'resend' })).toThrow('RESEND_API_KEY');
    expect(() => validarEntorno({ ...ENV_BASE, CORREO_PROVEEDOR: 'smtp' })).toThrow('SMTP_HOST');
    expect(validarEntorno({ ...ENV_BASE, CORREO_PROVEEDOR: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465' }).SMTP_PORT).toBe(465);
  });
});

describe('HU-46 · plantillas de correo', () => {
  const establecimiento = { nombre: 'Lavadero Central', color_primario: '#0F766E', logo_url: null };
  const cliente = { nombre: 'Ana María Gómez' };
  const vehiculo = { placa: 'ABC123' };
  const orden = { created_at: '2026-11-03T15:00:00Z', subtotal: 45000, descuento: 0, total: 45000 };

  it('CA1: el correo de ingreso confirma la placa, los servicios solicitados y el total', () => {
    const correo = plantillaIngreso({
      establecimiento, cliente, vehiculo, orden,
      servicios: [{ nombre: 'Lavado general', precio: 30000 }, { nombre: 'Aspirado', precio: 15000 }],
    });

    expect(correo.asunto).toBe('Recibimos tu vehículo ABC123 en Lavadero Central');
    for (const parte of [correo.html, correo.texto]) {
      expect(parte).toContain('ABC123');
      expect(parte).toContain('Lavado general');
      expect(parte).toContain('Aspirado');
      expect(parte).toContain(formatoPesos(45000));
    }
    expect(correo.texto).toContain('Hola Ana');
    expect(correo.html).toContain('#0F766E'); // color de la sede (HU-13)
  });

  it('CA1: muestra el descuento solo cuando la orden lo tiene', () => {
    const sin = plantillaIngreso({ establecimiento, cliente, vehiculo, orden, servicios: [] });
    const con = plantillaIngreso({ establecimiento, cliente, vehiculo, orden: { ...orden, descuento: 5000, total: 40000 }, servicios: [] });
    expect(sin.texto).not.toContain('Descuento');
    expect(con.texto).toContain('Descuento');
  });

  it('CA2: el correo de "listo" avisa que puede recoger el vehículo y el valor a pagar', () => {
    const correo = plantillaListo({ establecimiento, cliente, vehiculo, orden });
    expect(correo.asunto).toBe('Tu vehículo ABC123 está listo para recoger');
    expect(correo.html).toContain('listo para recoger');
    expect(correo.texto).toContain(formatoPesos(45000));
  });

  it('escapa los datos guardados para que no se inyecte HTML en el correo', () => {
    const correo = plantillaListo({ establecimiento: { nombre: '<script>alert(1)</script>' }, cliente: { nombre: '<b>Eva</b>' }, vehiculo, orden });
    expect(correo.html).not.toContain('<script>');
    expect(correo.html).toContain('&lt;script&gt;');
    expect(escaparHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });

  it('un color de marca inválido no se inserta en el HTML', () => {
    const correo = plantillaListo({ establecimiento: { nombre: 'X', color_primario: 'red;background:url(x)' }, cliente, vehiculo, orden });
    expect(correo.html).not.toContain('url(x)');
    expect(correo.html).toContain('#2563EB');
  });
});
