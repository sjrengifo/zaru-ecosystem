// HU-34 — Reintentos, errores permanentes y canal alterno en el envío de un intento.
// Usa un req.tenant falso y proveedores simulados; nunca toca Supabase ni un proveedor real.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');
process.env.SMS_PROVEEDOR = 'consola';

const { enviarUnIntento, MAX_INTENTOS } = await import('../../src/shared/notificaciones.js');
const { cifrar, descifrar } = await import('../../src/shared/cifrado.js');

const ORDEN_ID = '11111111-0000-4000-8000-000000000001';
const CLIENTE_ID = '22222222-0000-4000-8000-000000000002';
const FILA_ID = '33333333-0000-4000-8000-000000000003';

function orden(eventoEstado = 'listo') {
  return {
    id: ORDEN_ID,
    estado: eventoEstado,
    subtotal: 30000,
    descuento: 0,
    total: 30000,
    created_at: '2026-11-10T15:00:00Z',
    codigo_seguimiento: 'ABC12345',
    vehiculos: {
      placa: 'XYZ987',
      clientes: { id: CLIENTE_ID, nombre: 'Luis Pérez', correo: cifrar('luis@correo.com'), telefono: '3001234567' },
    },
    orden_servicios: [{ precio: 30000, servicios: { nombre: 'Lavado premium' } }],
  };
}

function fila(extra = {}) {
  return {
    id: FILA_ID,
    establecimiento_id: 'eeeeeeee-0000-4000-8000-000000000001',
    orden_id: ORDEN_ID,
    evento: 'orden.lista',
    canal: 'correo',
    estado: 'pendiente',
    intentos: 0,
    destino: cifrar('luis@correo.com'),
    contenido: { asunto: 'Tu vehículo está listo' },
    ...extra,
  };
}

function tenantCon(extra = {}) {
  return crearTenantFalso({
    ordenes: [{ data: orden(), error: null }, ...(extra.ordenes ?? [])],
    establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }, ...(extra.establecimientos ?? [])],
    // HU-30: por defecto el cliente autorizó los avisos del servicio (vista autorizaciones_vigentes).
    autorizaciones_vigentes: extra.autorizaciones_vigentes ?? [
      { data: [{ tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', created_at: '2026-11-01T10:00:00Z' }], error: null },
    ],
    notificaciones: extra.notificaciones ?? [{ data: null, error: null }],
  });
}

const proveedorOk = () => ({ nombre: 'smtp', enviar: vi.fn().mockResolvedValue({ idProveedor: 'p-1' }) });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('HU-34 RF-F6-15/19 · un intento de correo', () => {
  it('envía el mensaje real y deja la notificación "enviada" (aceptada por el proveedor)', async () => {
    const tenant = tenantCon();
    tenant.crear.mockResolvedValue({ id: 'i-1' });
    const proveedor = proveedorOk();

    const resultado = await enviarUnIntento(tenant, fila(), { proveedor, ahora: new Date('2026-11-10T19:05:00Z') });

    expect(resultado).toEqual({ estado: 'enviada', intentos: 1 });
    expect(proveedor.enviar).toHaveBeenCalledWith(expect.objectContaining({ para: 'luis@correo.com', asunto: expect.any(String) }));
    expect(tenant.actualizar.mock.calls.at(-1)[2]).toMatchObject({
      estado: 'enviada',
      intentos: 1,
      error: null,
      proximo_intento_at: null,
      contenido: { proveedor: 'smtp', idProveedor: 'p-1', entregaConfirmada: false },
    });
    const intento = tenant.crear.mock.calls.find(([tabla]) => tabla === 'notificacion_intentos')[1];
    expect(intento).toMatchObject({ resultado: 'enviado', canal: 'correo', proveedor: 'smtp', entregado: false });
  });

  it('un error recuperable deja la fila pendiente con espera exponencial, no fallida', async () => {
    const tenant = tenantCon();
    const proveedor = { nombre: 'smtp', enviar: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')) };
    const ahora = new Date('2026-11-10T19:05:00Z');

    const resultado = await enviarUnIntento(tenant, fila(), { proveedor, ahora });

    expect(resultado).toMatchObject({ estado: 'pendiente', intentos: 1, error: '503 Service Unavailable' });
    const cambios = tenant.actualizar.mock.calls.at(-1)[2];
    expect(cambios.estado).toBe('pendiente');
    expect(cambios.proximo_intento_at).not.toBeNull();
    expect(new Date(cambios.proximo_intento_at).getTime()).toBeGreaterThan(ahora.getTime());
    expect(tenant.crear.mock.calls.find(([tabla]) => tabla === 'notificacion_intentos')[1]).toMatchObject({
      resultado: 'fallido',
      recuperable: true,
      error: '503 Service Unavailable',
    });
  });

  it('un error permanente falla de inmediato y no reintenta', async () => {
    const tenant = tenantCon();
    const proveedor = { nombre: 'smtp', enviar: vi.fn().mockRejectedValue(new Error('401 Unauthorized')) };

    const resultado = await enviarUnIntento(tenant, fila({ evento: 'orden.recibida' }), { proveedor });

    expect(resultado).toMatchObject({ estado: 'fallida', intentos: 1, error: '401 Unauthorized' });
    expect(proveedor.enviar).toHaveBeenCalledTimes(1);
    expect(tenant.actualizar.mock.calls.at(-1)[2]).toMatchObject({ estado: 'fallida', proximo_intento_at: null });
  });

  it('nunca supera MAX_INTENTOS ni crea un canal alterno desde un evento que no es "listo"', async () => {
    const tenant = tenantCon();
    const proveedor = { nombre: 'smtp', enviar: vi.fn().mockRejectedValue(new Error('timeout')) };

    const resultado = await enviarUnIntento(tenant, fila({ evento: 'orden.recibida', intentos: MAX_INTENTOS - 1 }), { proveedor });

    expect(resultado).toMatchObject({ estado: 'fallida', intentos: MAX_INTENTOS });
    expect(tenant.crear.mock.calls.filter(([tabla]) => tabla === 'notificaciones')).toHaveLength(0);
  });

  it('un destino vacío falla sin intentar el correo (el canal alterno sí puede intentarse)', async () => {
    const tenant = tenantCon();
    const proveedor = proveedorOk();
    const resultado = await enviarUnIntento(tenant, fila({ destino: null }), { proveedor });

    expect(resultado).toMatchObject({ estado: 'fallida' });
    expect(proveedor.enviar).not.toHaveBeenCalled();
    expect(tenant.actualizar.mock.calls.at(-1)[2].error).toContain('correo de destino');
  });

  it('un intento sobre una notificación ya enviada o entregada no se repite', async () => {
    for (const estado of ['enviada', 'entregada', 'cancelada']) {
      const tenant = tenantCon();
      const proveedor = proveedorOk();
      const resultado = await enviarUnIntento(tenant, fila({ estado }), { proveedor });

      expect(resultado).toMatchObject({ estado, omitida: true });
      expect(proveedor.enviar).not.toHaveBeenCalled();
      expect(tenant.actualizar).not.toHaveBeenCalled();
    }
  });
});

describe('HU-34 RF-F6-17 · canal alterno al agotar el correo de "listo"', () => {
  it('crea un SMS con clave anti-duplicados y celular cifrado, enlazado al aviso original', async () => {
    const tenant = tenantCon({
      ordenes: [{ data: orden(), error: null }],
      establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }],
    });
    tenant.crear.mockImplementation((tabla) => ({ id: tabla === 'notificaciones' ? 'alt-1' : 'i-1' }));
    const proveedor = { nombre: 'smtp', enviar: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')) };
    const ahora = new Date('2026-11-10T19:05:00Z');

    const resultado = await enviarUnIntento(tenant, fila({ intentos: MAX_INTENTOS - 1 }), { proveedor, ahora });

    expect(resultado).toMatchObject({ estado: 'fallida', intentos: MAX_INTENTOS });
    const alterno = tenant.crear.mock.calls.find(([tabla]) => tabla === 'notificaciones')?.[1];
    expect(alterno).toMatchObject({
      cliente_id: CLIENTE_ID,
      orden_id: ORDEN_ID,
      evento: 'orden.lista',
      canal: 'sms',
      estado: 'pendiente',
      clave_dedupe: `${ORDEN_ID}:orden.lista:sms`,
      notificacion_origen_id: FILA_ID,
      programada_para: ahora.toISOString(),
      contenido: { alterno: true },
    });
    expect(descifrar(alterno.destino)).toBe('3001234567');
    expect(alterno.contenido.texto).toContain('XYZ987');
  });

  it('no duplica el SMS si ya existe uno en la cadena (y no lo cuenta como fallo definitivo)', async () => {
    const tenant = tenantCon({
      ordenes: [{ data: orden(), error: null }],
      establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }],
      // HU-33: la cadena del aviso ya tiene un SMS alterno pendiente.
      notificaciones: [{ data: [{ id: FILA_ID, canal: 'correo', estado: 'fallida' }, { id: 'alt-existente', canal: 'sms', estado: 'pendiente' }], error: null }],
    });
    const proveedor = { nombre: 'smtp', enviar: vi.fn().mockRejectedValue(new Error('503')) };

    const resultado = await enviarUnIntento(tenant, fila({ intentos: MAX_INTENTOS - 1 }), { proveedor });

    expect(resultado.estado).toBe('fallida');
    expect(tenant.crear.mock.calls.filter(([tabla]) => tabla === 'notificaciones')).toHaveLength(0);
    expect(tenant.actualizar.mock.calls.some(([, , cambios]) => cambios.fallo_definitivo_at)).toBe(false);
  });

  it('no crea el SMS si el cliente revocó los avisos', async () => {
    const tenant = tenantCon({
      ordenes: [{ data: orden(), error: null }],
      establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }],
      autorizaciones_vigentes: [
        { data: [{ tipo: 'notificaciones_servicio', otorgado: false, canal: 'enlace_baja', created_at: '2026-11-05T14:30:00Z' }], error: null },
      ],
    });
    const proveedor = { nombre: 'smtp', enviar: vi.fn().mockRejectedValue(new Error('503')) };

    await enviarUnIntento(tenant, fila({ intentos: MAX_INTENTOS - 1 }), { proveedor });

    expect(tenant.crear.mock.calls.filter(([tabla]) => tabla === 'notificaciones')).toHaveLength(0);
  });

  it('un SMS ya creado se envía con el celular descifrado y queda enviado', async () => {
    const tenant = crearTenantFalso({
      ordenes: [{ data: { id: ORDEN_ID, total: 30000, vehiculos: { placa: 'XYZ987' } }, error: null }],
      establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }],
    });
    const sms = { nombre: 'consola', enviar: vi.fn().mockResolvedValue({ idProveedor: 'sms-1' }) };
    const filaSms = fila({ canal: 'sms', destino: cifrar('3001234567'), contenido: {} });

    const resultado = await enviarUnIntento(tenant, filaSms, { proveedorSms: sms, ahora: new Date('2026-11-10T19:05:00Z') });

    expect(resultado).toEqual({ estado: 'enviada', intentos: 1 });
    expect(sms.enviar).toHaveBeenCalledWith(expect.objectContaining({ para: '3001234567', texto: expect.stringContaining('XYZ987') }));
    expect(tenant.actualizar.mock.calls.at(-1)[2]).toMatchObject({ estado: 'enviada', contenido: { proveedor: 'consola', entregaConfirmada: false } });
  });
});
