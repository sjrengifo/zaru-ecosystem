// HU-46: correos al cliente. No requiere Supabase ni un servidor SMTP: usa dobles de prueba.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32).toString('base64');

import { configuracionCorreo, enviarCorreo } from '../../src/shared/correo.js';
import { notificarOrden, redactarCorreo } from '../../src/shared/notificaciones.js';
import { cifrar, descifrar } from '../../src/shared/cifrado.js';
import { AppError } from '../../src/shared/errores.js';

const SMTP = { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'zaru', SMTP_PASS: 'x', CORREO_REMITENTE: 'Zaru <avisos@example.com>' };
const ORDEN_ID = '55555555-5555-4555-8555-555555555555';

function ordenCon(correo) {
  return {
    id: ORDEN_ID,
    codigo_seguimiento: 'ABCDEFGHJK',
    total: 55000,
    entrega_estimada_at: '2026-11-02T15:10:00.000Z',
    vehiculo: { placa: 'XYZ987', cliente: { id: 'c1', nombre: 'Ana Gómez', correo } },
    servicios: [{ servicio: { nombre: 'Lavado básico' } }, { servicio: { nombre: 'Encerado' } }],
  };
}

function tenantFalso({ orden = ordenCon(cifrar('ana@example.com')), crear } = {}) {
  return {
    obtener: vi.fn(async () => orden),
    listar: vi.fn(() => ({ maybeSingle: async () => ({ data: { nombre: 'Lavadero Demo' } }) })),
    crear: vi.fn(crear ?? (async () => ({ id: 'n1' }))),
    actualizar: vi.fn(async () => ({ id: 'n1' })),
  };
}

beforeEach(() => vi.restoreAllMocks());

describe('envío SMTP', () => {
  it('sin configuración completa no intenta enviar y explica el motivo', async () => {
    expect(configuracionCorreo({ SMTP_HOST: 'smtp.example.com' })).toBeNull();
    const crearTransporte = vi.fn();
    const r = await enviarCorreo({ para: 'ana@example.com', asunto: 'a', texto: 't' }, { variables: {}, crearTransporte });
    expect(r).toEqual({ enviado: false, motivo: 'El envío de correos no está configurado (SMTP)' });
    expect(crearTransporte).not.toHaveBeenCalled();
  });

  it('usa el puerto 465 con TLS directo y el remitente configurado', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'm-1' }));
    const crearTransporte = vi.fn(() => ({ sendMail }));
    const r = await enviarCorreo({ para: 'ana@example.com', asunto: 'Hola', texto: 't', html: '<p>t</p>' },
      { variables: { ...SMTP, SMTP_PORT: '465' }, crearTransporte });
    expect(r).toEqual({ enviado: true, id: 'm-1' });
    expect(crearTransporte.mock.calls[0][0]).toMatchObject({ host: 'smtp.example.com', port: 465, secure: true });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: SMTP.CORREO_REMITENTE, to: 'ana@example.com', subject: 'Hola' }));
  });

  it('CA3: un rechazo del proveedor no lanza; devuelve el motivo', async () => {
    const crearTransporte = () => ({ sendMail: async () => { throw new Error('535 credenciales inválidas'); } });
    const r = await enviarCorreo({ para: 'ana@example.com', asunto: 'a', texto: 't' }, { variables: SMTP, crearTransporte });
    expect(r.enviado).toBe(false);
    expect(r.motivo).toContain('535 credenciales inválidas');
  });
});

describe('contenido del correo', () => {
  const datos = { establecimiento: 'Lavadero Demo', cliente: 'Ana Gómez', placa: 'XYZ987', servicios: ['Lavado básico'], total: 55000, codigo: 'ABCDEFGHJK', entregaEstimada: '2026-11-02T15:10:00.000Z' };

  it('CA1: el aviso de ingreso trae placa, servicios, total y código de seguimiento', () => {
    const c = redactarCorreo('ingreso', datos);
    expect(c.asunto).toBe('Recibimos tu vehículo · Lavadero Demo');
    expect(c.texto).toContain('XYZ987');
    expect(c.texto).toContain('Lavado básico');
    expect(c.texto).toMatch(/55\.000/);
    expect(c.texto).toContain('ABCDEFGHJK');
  });

  it('CA2: el aviso de listo invita a recoger el vehículo', () => {
    const c = redactarCorreo('listo', datos);
    expect(c.asunto).toBe('Tu vehículo está listo · Lavadero Demo');
    expect(c.texto).toContain('ya está listo');
  });

  it('escapa el HTML de los datos del cliente', () => {
    expect(redactarCorreo('listo', { ...datos, cliente: '<b>Ana</b>' }).html).not.toContain('<b>Ana</b>');
  });
});

describe('notificarOrden', () => {
  it('CA1: envía al correo descifrado y registra el aviso con el destino cifrado', async () => {
    const tenant = tenantFalso();
    const enviar = vi.fn(async () => ({ enviado: true, id: 'm-1' }));
    const r = await notificarOrden(tenant, ORDEN_ID, 'ingreso', { enviar });

    expect(r).toEqual({ estado: 'enviada' });
    expect(enviar.mock.calls[0][0]).toMatchObject({ para: 'ana@example.com' });
    const [tabla, fila] = tenant.crear.mock.calls[0];
    expect(tabla).toBe('notificaciones');
    expect(fila).toMatchObject({ cliente_id: 'c1', orden_id: ORDEN_ID, canal: 'correo', evento: 'orden.ingreso', estado: 'enviando', clave_dedupe: `${ORDEN_ID}:ingreso` });
    expect(fila.destino).not.toBe('ana@example.com');
    expect(descifrar(fila.destino)).toBe('ana@example.com');
    expect(tenant.actualizar).toHaveBeenCalledWith('notificaciones', 'n1', { estado: 'enviada', intentos: 1, error: null }, 'id', 'Notificación');
  });

  it('CA3: sin correo no envía y deja constancia como cancelada', async () => {
    const tenant = tenantFalso({ orden: ordenCon(null) });
    const enviar = vi.fn();
    const r = await notificarOrden(tenant, ORDEN_ID, 'listo', { enviar });
    expect(r.estado).toBe('cancelada');
    expect(enviar).not.toHaveBeenCalled();
    expect(tenant.crear.mock.calls[0][1]).toMatchObject({ estado: 'cancelada', destino: 'sin-correo' });
  });

  it('CA3: si el envío falla, marca el aviso como fallido con el motivo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tenant = tenantFalso();
    const r = await notificarOrden(tenant, ORDEN_ID, 'listo', { enviar: async () => ({ enviado: false, motivo: 'SMTP caído' }) });
    expect(r).toEqual({ estado: 'fallida', motivo: 'SMTP caído' });
    expect(tenant.actualizar).toHaveBeenCalledWith('notificaciones', 'n1', { estado: 'fallida', intentos: 1, error: 'SMTP caído' }, 'id', 'Notificación');
  });

  it('no repite un aviso ya registrado para la misma orden', async () => {
    const tenant = tenantFalso({ crear: async () => { throw new AppError('CONFLICTO', 'El registro ya existe'); } });
    const enviar = vi.fn();
    const r = await notificarOrden(tenant, ORDEN_ID, 'listo', { enviar });
    expect(r.estado).toBe('omitida');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('CA3: un error inesperado nunca se propaga', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tenant = tenantFalso();
    tenant.obtener.mockRejectedValueOnce(new Error('sin conexión'));
    await expect(notificarOrden(tenant, ORDEN_ID, 'ingreso', { enviar: vi.fn() })).resolves.toMatchObject({ estado: 'fallida' });
  });
});
