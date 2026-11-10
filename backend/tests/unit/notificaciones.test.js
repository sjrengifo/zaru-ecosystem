// HU-46 — Preparación y envío de correos al cliente (patrón outbox), sin Supabase real.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

beforeAll(() => {
  process.env.ZARU_CLAVE_CIFRADO = Buffer.alloc(32, 7).toString('base64');
});

const { prepararCorreo, enviarCorreo, EVENTOS, MAX_INTENTOS } = await import('../../src/shared/notificaciones.js');
const { cifrar, descifrar, estaCifrado } = await import('../../src/shared/cifrado.js');
const { AppError } = await import('../../src/shared/errores.js');

const ORDEN_ID = '11111111-0000-4000-8000-000000000001';
const CLIENTE_ID = '22222222-0000-4000-8000-000000000002';

function orden(correo) {
  return {
    id: ORDEN_ID,
    estado: 'recibido',
    subtotal: 30000,
    descuento: 0,
    total: 30000,
    created_at: '2026-11-03T15:00:00Z',
    vehiculos: { placa: 'XYZ987', clientes: { id: CLIENTE_ID, nombre: 'Luis Pérez', correo } },
    orden_servicios: [{ precio: 30000, servicios: { nombre: 'Lavado premium' } }],
  };
}

function tenantCon({ correo = cifrar('luis@correo.com'), revocado = false } = {}) {
  const tenant = crearTenantFalso({
    ordenes: [{ data: orden(correo), error: null }],
    // HU-30: autorización vigente de los avisos del servicio (vista autorizaciones_vigentes).
    autorizaciones_vigentes: [{ data: [{ tipo: 'notificaciones_servicio', otorgado: !revocado, canal: 'panel', created_at: '2026-11-01T10:00:00Z' }], error: null }],
    establecimientos: [{ data: { nombre: 'Lavadero Norte', color_primario: '#2563EB' }, error: null }],
  });
  tenant.crear.mockResolvedValue({ id: 'nnnnnnnn-0000-4000-8000-000000000003' });
  return tenant;
}

const proveedorOk = () => ({ nombre: 'falso', enviar: vi.fn().mockResolvedValue({ idProveedor: 'p-1' }) });

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

describe('HU-46 · preparar el correo', () => {
  it('CA1: deja la notificación pendiente con destino cifrado, evento y clave anti-duplicados', async () => {
    const tenant = tenantCon();
    const { resumen, enviar } = await prepararCorreo(tenant, { evento: EVENTOS.RECIBIDA, ordenId: ORDEN_ID });

    expect(resumen).toEqual({ canal: 'correo', estado: 'pendiente', id: 'nnnnnnnn-0000-4000-8000-000000000003', destino: 'l***@correo.com' });
    const [tabla, fila] = tenant.crear.mock.calls[0];
    expect(tabla).toBe('notificaciones');
    expect(fila).toMatchObject({
      cliente_id: CLIENTE_ID,
      orden_id: ORDEN_ID,
      tipo: 'operativa',
      evento: 'orden.recibida',
      canal: 'correo',
      estado: 'pendiente',
      clave_dedupe: `${ORDEN_ID}:orden.recibida:correo`,
    });
    expect(estaCifrado(fila.destino)).toBe(true); // HU-50: el correo no queda en texto plano
    expect(descifrar(fila.destino)).toBe('luis@correo.com');
    expect(fila.contenido.asunto).toContain('XYZ987');
    expect(typeof enviar).toBe('function');
  });

  it('un correo antiguo sin cifrar se cifra antes de guardarlo como destino', async () => {
    const tenant = tenantCon({ correo: 'luis@correo.com' });
    await prepararCorreo(tenant, { evento: EVENTOS.LISTA, ordenId: ORDEN_ID });
    expect(estaCifrado(tenant.crear.mock.calls[0][1].destino)).toBe(true);
  });

  it('CA3: si el cliente no tiene correo no crea notificación y lo informa', async () => {
    const tenant = tenantCon({ correo: null });
    const { resumen, enviar } = await prepararCorreo(tenant, { evento: EVENTOS.LISTA, ordenId: ORDEN_ID });

    expect(resumen).toEqual({ canal: 'correo', estado: 'omitida', motivo: 'sin_correo' });
    expect(tenant.crear).not.toHaveBeenCalled();
    await expect(enviar()).resolves.toBeNull();
  });

  it('HU-30: no envía si el titular revocó o no autorizó los avisos del servicio', async () => {
    const tenant = tenantCon({ revocado: true });
    const { resumen } = await prepararCorreo(tenant, { evento: EVENTOS.LISTA, ordenId: ORDEN_ID });
    expect(resumen).toMatchObject({ estado: 'omitida', motivo: 'revocado' });
    expect(tenant.crear).not.toHaveBeenCalled();
  });

  it('el mismo evento de la misma orden no genera un segundo correo', async () => {
    const tenant = tenantCon();
    tenant.crear.mockRejectedValue(new AppError('CONFLICTO', 'El registro ya existe'));
    const { resumen } = await prepararCorreo(tenant, { evento: EVENTOS.LISTA, ordenId: ORDEN_ID });
    expect(resumen.estado).toBe('duplicada');
  });

  it('CA3: un error de la base al preparar nunca se propaga al controlador', async () => {
    const tenant = crearTenantFalso({ ordenes: [{ data: null, error: new Error('conexión perdida') }] });
    const { resumen } = await prepararCorreo(tenant, { evento: EVENTOS.LISTA, ordenId: ORDEN_ID });
    expect(resumen).toEqual({ canal: 'correo', estado: 'error', motivo: 'preparacion' });
  });

  it('solo consulta datos del establecimiento de la sesión (usa req.tenant)', async () => {
    const tenant = tenantCon();
    await prepararCorreo(tenant, { evento: EVENTOS.RECIBIDA, ordenId: ORDEN_ID });
    expect(tenant.consultas.map((c) => c.tabla)).toEqual(['ordenes', 'autorizaciones_vigentes', 'establecimientos']);
  });
});

describe('HU-46 · enviar el correo', () => {
  const mensaje = { asunto: 'Listo', html: '<p>ok</p>', texto: 'ok' };
  const ID = 'nnnnnnnn-0000-4000-8000-000000000003';

  it('CA1/CA2: envía al correo descifrado y marca la notificación como enviada', async () => {
    const tenant = tenantCon();
    const proveedor = proveedorOk();
    const { enviar } = await prepararCorreo(tenant, { evento: EVENTOS.LISTA, ordenId: ORDEN_ID }, { proveedor });

    await expect(enviar()).resolves.toEqual({ estado: 'enviada', intentos: 1 });
    expect(proveedor.enviar).toHaveBeenCalledWith(expect.objectContaining({ para: 'luis@correo.com', asunto: expect.stringContaining('listo') }));
    const ultimo = tenant.actualizar.mock.calls.at(-1);
    expect(ultimo[2]).toMatchObject({ estado: 'enviada', error: null, contenido: { proveedor: 'falso', idProveedor: 'p-1' } });
  });

  it('reintenta ante un fallo temporal del proveedor', async () => {
    const tenant = crearTenantFalso();
    const proveedor = { nombre: 'falso', enviar: vi.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValue({ idProveedor: 'p-2' }) };

    const resultado = await enviarCorreo(tenant, { id: ID, para: 'a@b.co', mensaje }, { proveedor, esperasMs: [0, 0] });

    expect(resultado).toEqual({ estado: 'enviada', intentos: 2 });
    const estados = tenant.actualizar.mock.calls.map((c) => c[2].estado);
    expect(estados).toEqual(['enviando', 'pendiente', 'enviando', 'enviada']);
  });

  it('CA3: si falla en todos los intentos queda "fallida" con el error, sin lanzar excepción', async () => {
    const tenant = crearTenantFalso();
    const proveedor = { nombre: 'falso', enviar: vi.fn().mockRejectedValue(new Error('SMTP rechazado')) };

    const resultado = await enviarCorreo(tenant, { id: ID, para: 'a@b.co', mensaje }, { proveedor, esperasMs: [0, 0] });

    expect(resultado).toMatchObject({ estado: 'fallida', intentos: MAX_INTENTOS, error: 'SMTP rechazado' });
    expect(proveedor.enviar).toHaveBeenCalledTimes(MAX_INTENTOS);
    expect(tenant.actualizar.mock.calls.at(-1)[2]).toMatchObject({ estado: 'fallida', error: 'SMTP rechazado' });
  });

  it('CA3: un proveedor colgado no deja el envío esperando para siempre', async () => {
    const tenant = crearTenantFalso();
    const proveedor = { nombre: 'lento', enviar: () => new Promise(() => {}) };
    const resultado = await enviarCorreo(tenant, { id: ID, para: 'a@b.co', mensaje }, { proveedor, esperasMs: [0, 0], tiempoMaximoMs: 10 });
    expect(resultado.estado).toBe('fallida');
    expect(resultado.error).toContain('no respondió');
  });

  it('si no se puede actualizar la fila de seguimiento, el correo se envía igual', async () => {
    const tenant = crearTenantFalso();
    tenant.actualizar.mockRejectedValue(new Error('sin conexión'));
    const proveedor = proveedorOk();
    await expect(enviarCorreo(tenant, { id: ID, para: 'a@b.co', mensaje }, { proveedor })).resolves.toMatchObject({ estado: 'enviada' });
  });
});
