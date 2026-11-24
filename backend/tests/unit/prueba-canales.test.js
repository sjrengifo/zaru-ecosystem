// HU-31/HU-39 — Prueba real de envío: fallback, destinos del backend y contabilidad por intento.
import { describe, it, expect, vi } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

const { enviarPruebaCanales, ordenDesde } = await import('../../src/shared/pruebaCanales.js');

const SEDE = 'eeeeeeee-0000-4000-8000-000000000001';

function proveedores({ smsFalla = false } = {}) {
  const correo = { nombre: 'consola', configurado: true, enviar: vi.fn(async () => ({ idProveedor: 'correo-1' })) };
  const sms = {
    nombre: 'twilio',
    configurado: true,
    enviar: smsFalla
      ? vi.fn(async () => { throw new Error('Twilio rechazó el mensaje'); })
      : vi.fn(async () => ({ idProveedor: 'sms-1' })),
  };
  const push = { nombre: 'no_configurado', configurado: false, enviar: vi.fn(async () => { throw new Error('push'); }) };
  return { correo, sms, push };
}

function tenantFalso({ sinCupo = false, confirmar = true } = {}) {
  const tenant = crearTenantFalso({
    config_canales: [{ data: [], error: null }],
    establecimientos: [{ data: { id: SEDE, nombre: 'Central' }, error: null }],
  });
  const reservas = [];
  const confirmaciones = [];
  const liberaciones = [];
  tenant.rpc = vi.fn(async (funcion, args) => {
    if (funcion === 'hu39_reservar_consumo') {
      reservas.push(args);
      if (sinCupo && args.p_canal === 'sms') return { estado: 'sin_cupo', cantidad: 200, cupo: 200 };
      return { estado: 'ok' };
    }
    if (funcion === 'hu39_confirmar_consumo') {
      confirmaciones.push(args);
      return confirmar ? { estado: 'ok', alerta_80: null } : { estado: 'ok', degradado: true };
    }
    if (funcion === 'hu39_liberar_consumo') {
      liberaciones.push(args);
      return { estado: 'ok' };
    }
    throw new Error(`RPC inesperada: ${funcion}`);
  });
  return { tenant, reservas, confirmaciones, liberaciones };
}

function dbFalso() {
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { id: 'u1', email: 'admin@zaru.app', phone: '+573001234567' } },
          error: null,
        })),
      },
    },
  };
}

describe('HU-39 · prueba de envío con fallback y consumo', () => {
  it('el orden empieza en el canal elegido y continúa por el alterno', () => {
    expect(ordenDesde('sms')).toEqual(['sms', 'correo']);
    expect(ordenDesde('push')).toEqual(['push', 'sms', 'correo']);
    expect(ordenDesde('correo')).toEqual(['correo']);
  });

  it('envía por SMS real, enmascara el destino y confirma una sola vez el consumo', async () => {
    const proveedoresReales = proveedores();
    const { tenant, reservas, confirmaciones } = tenantFalso();
    const db = dbFalso();
    const resultado = await enviarPruebaCanales({
      tenant,
      db,
      usuarioId: 'u1',
      canal: 'sms',
      proveedores: proveedoresReales,
      notificar80: vi.fn(),
    });

    expect(resultado.estado).toBe('entregado');
    expect(resultado.canalEntregado).toBe('sms');
    expect(resultado.resultados).toHaveLength(1);
    expect(resultado.resultados[0]).toMatchObject({
      canal: 'sms',
      estado: 'enviado',
      aceptado: true,
      destino: '300****567',
      consumo: { reservado: true, contado: true, liberado: false },
    });
    expect(proveedoresReales.sms.enviar).toHaveBeenCalledTimes(1);
    expect(proveedoresReales.correo.enviar).not.toHaveBeenCalled();
    expect(reservas[0].p_canal).toBe('sms');
    expect(confirmaciones[0].p_referencia).toBe(reservas[0].p_referencia);
  });

  it('si el SMS falla, libera su reserva y entrega por correo', async () => {
    const proveedoresReales = proveedores({ smsFalla: true });
    const { tenant, reservas, confirmaciones, liberaciones } = tenantFalso();
    const db = dbFalso();
    const resultado = await enviarPruebaCanales({
      tenant,
      db,
      usuarioId: 'u1',
      canal: 'sms',
      proveedores: proveedoresReales,
      notificar80: vi.fn(),
    });

    expect(resultado.estado).toBe('entregado');
    expect(resultado.canalEntregado).toBe('correo');
    expect(resultado.resultados.map((r) => r.estado)).toEqual(['fallido', 'enviado']);
    expect(resultado.resultados[0].consumo).toEqual({ reservado: true, contado: false, liberado: true });
    expect(reservas.map((r) => r.p_canal)).toEqual(['sms', 'correo']);
    expect(liberaciones).toHaveLength(1);
    expect(liberaciones[0].p_referencia).toBe(reservas[0].p_referencia);
    expect(confirmaciones).toHaveLength(1);
    expect(confirmaciones[0].p_canal).toBe('correo');
    expect(resultado.resultados[1].destino).toBe('adm****@zaru.app');
  });

  it('sin cupo de SMS no llama al proveedor ni descuenta el envío, y continúa por correo', async () => {
    const proveedoresReales = proveedores();
    const { tenant, liberaciones } = tenantFalso({ sinCupo: true });
    const notificar80 = vi.fn();
    const resultado = await enviarPruebaCanales({
      tenant,
      db: dbFalso(),
      usuarioId: 'u1',
      canal: 'sms',
      proveedores: proveedoresReales,
      notificar80,
    });

    expect(resultado.resultados[0]).toMatchObject({ canal: 'sms', estado: 'sin_cupo', aceptado: false });
    expect(proveedoresReales.sms.enviar).not.toHaveBeenCalled();
    expect(liberaciones).toHaveLength(0);
    expect(resultado.canalEntregado).toBe('correo');
    expect(notificar80).not.toHaveBeenCalled();
  });

  it('si la RPC no confirma el consumo lo informa aunque el proveedor aceptó', async () => {
    const proveedoresReales = proveedores();
    const { tenant } = tenantFalso({ confirmar: false });
    const resultado = await enviarPruebaCanales({
      tenant,
      db: dbFalso(),
      usuarioId: 'u1',
      canal: 'correo',
      proveedores: proveedoresReales,
      notificar80: vi.fn(),
    });

    expect(resultado.estado).toBe('entregado');
    expect(resultado.resultados[0].consumo.contado).toBe(false);
    expect(resultado.resultados[0].advertencia).toMatch(/no se pudo registrar el consumo/);
  });

  it('un canal inactivo se omite sin alterar los avisos operativos', async () => {
    const proveedoresReales = proveedores();
    const { tenant } = tenantFalso();
    tenant.listar = vi.fn((tabla) => ({
      maybeSingle: () => Promise.resolve({ data: { nombre: 'Central' }, error: null }),
      then: (resolver) => Promise.resolve(
        tabla === 'config_canales'
          ? { data: [{ canal: 'sms', activo: false }], error: null }
          : { data: [], error: null },
      ).then(resolver),
    }));
    const resultado = await enviarPruebaCanales({
      tenant,
      db: dbFalso(),
      usuarioId: 'u1',
      canal: 'sms',
      proveedores: proveedoresReales,
      notificar80: vi.fn(),
    });

    expect(resultado.resultados[0]).toMatchObject({ canal: 'sms', estado: 'inactivo', aceptado: false });
    expect(resultado.canalEntregado).toBe('correo');
    expect(proveedoresReales.sms.enviar).not.toHaveBeenCalled();
  });
});
