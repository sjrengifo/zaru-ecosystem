// HU-38 — Centro de notificaciones del cliente en la app (RF-F6-22, RF-F6-23 · ESC-F6-13).
// Todo con tenant falso: no hay Supabase ni sesión de panel.
import { describe, it, expect } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

const { listarCentro, marcarLeida, destinoDe, desde, DIAS_CENTRO, ESTADOS_RECIBIDOS } = await import(
  '../../src/shared/centroNotificaciones.js'
);
const { idNotificacionCliente } = await import('../../src/schemas/cliente.schemas.js');

const CLIENTE = '22222222-0000-4000-8000-000000000002';
const OTRO_CLIENTE = '22222222-0000-4000-8000-000000000099';
const ORDEN_EN_CURSO = '11111111-0000-4000-8000-000000000001';
const ORDEN_ENTREGADA = '11111111-0000-4000-8000-000000000002';
const AHORA = new Date('2026-11-10T15:00:00Z');

const aviso = (n, extra = {}) => ({
  id: `33333333-0000-4000-8000-00000000000${n}`,
  tipo: 'operativa',
  evento: 'orden.recibida',
  canal: 'correo',
  contenido: { asunto: `Aviso ${n}` },
  orden_id: ORDEN_EN_CURSO,
  leida_at: null,
  created_at: `2026-11-0${n}T12:00:00Z`,
  ...extra,
});

const ordenes = [
  { id: ORDEN_EN_CURSO, estado: 'en_lavado', codigo_seguimiento: 'SEG12345', vehiculo: { placa: 'ABC123', cliente_id: CLIENTE } },
  { id: ORDEN_ENTREGADA, estado: 'entregado', codigo_seguimiento: 'SEG67890', vehiculo: { placa: 'XYZ987', cliente_id: CLIENTE } },
];

const filtros = (tenant, tabla) => tenant.consultas.find((c) => c.tabla === tabla)?.filtros ?? [];

describe('HU-38 CA1 · lista de notificaciones del cliente', () => {
  it('pide solo los avisos recibidos por el cliente en los últimos 90 días, del más reciente al más antiguo', async () => {
    const tenant = crearTenantFalso({ notificaciones: [{ data: [], error: null }] });

    await listarCentro(tenant, CLIENTE, { ahora: AHORA });

    const aplicados = filtros(tenant, 'notificaciones');
    expect(aplicados).toContainEqual(['eq', 'cliente_id', CLIENTE]);
    expect(aplicados).toContainEqual(['in', 'estado', ESTADOS_RECIBIDOS]);
    expect(aplicados).toContainEqual(['gte', 'created_at', '2026-08-12T15:00:00.000Z']);
    expect(aplicados).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(desde(AHORA).getTime()).toBe(AHORA.getTime() - DIAS_CENTRO * 24 * 60 * 60 * 1000);
    // Un aviso fallido o en cola no le llegó al cliente.
    expect(ESTADOS_RECIBIDOS).toEqual(['enviada', 'entregada']);
  });

  it('diferencia las leídas de las no leídas y conserva el orden recibido', async () => {
    const tenant = crearTenantFalso({
      notificaciones: [{ data: [aviso(3), aviso(2, { leida_at: '2026-11-02T13:00:00Z' }), aviso(1)], error: null }],
      ordenes: [{ data: ordenes, error: null }],
    });

    const { notificaciones } = await listarCentro(tenant, CLIENTE, { ahora: AHORA });

    expect(notificaciones.map((n) => [n.titulo, n.leida])).toEqual([
      ['Aviso 3', false],
      ['Aviso 2', true],
      ['Aviso 1', false],
    ]);
    expect(notificaciones[0]).toMatchObject({ categoria: 'Estado del servicio', placa: 'ABC123', fecha: '2026-11-03T12:00:00Z', canal: 'correo' });
  });

  it('usa un título por evento cuando el aviso no guardó asunto', async () => {
    const tenant = crearTenantFalso({
      notificaciones: [{ data: [aviso(1, { evento: 'orden.lista', contenido: {} })], error: null }],
      ordenes: [{ data: ordenes, error: null }],
    });

    const { notificaciones } = await listarCentro(tenant, CLIENTE, { ahora: AHORA });
    expect(notificaciones[0].titulo).toBe('Tu vehículo está listo para recoger');
  });

  it('sin avisos responde una lista vacía sin consultar órdenes', async () => {
    const tenant = crearTenantFalso({ notificaciones: [{ data: [], error: null }] });

    expect(await listarCentro(tenant, CLIENTE, { ahora: AHORA })).toEqual({ notificaciones: [], noLeidas: 0 });
    expect(tenant.consultas.map((c) => c.tabla)).toEqual(['notificaciones']);
  });
});

describe('HU-38 CA2 · contador de pendientes (ESC-F6-13)', () => {
  it('con 3 avisos sin leer responde noLeidas: 3', async () => {
    const tenant = crearTenantFalso({
      notificaciones: [{ data: [aviso(3), aviso(2), aviso(1)], error: null }],
      ordenes: [{ data: ordenes, error: null }],
    });

    expect((await listarCentro(tenant, CLIENTE, { ahora: AHORA })).noLeidas).toBe(3);
  });

  it('al marcar una como leída, la siguiente consulta responde noLeidas: 2', async () => {
    const tenant = crearTenantFalso({
      notificaciones: [
        { data: { id: aviso(3).id, estado: 'enviada', leida_at: null }, error: null },
        { data: [aviso(3, { leida_at: AHORA.toISOString() }), aviso(2), aviso(1)], error: null },
      ],
      ordenes: [{ data: ordenes, error: null }],
    });
    tenant.actualizar.mockResolvedValue({ id: aviso(3).id, leida_at: AHORA.toISOString() });

    await marcarLeida(tenant, CLIENTE, aviso(3).id, { ahora: AHORA });
    expect((await listarCentro(tenant, CLIENTE, { ahora: AHORA })).noLeidas).toBe(2);
  });
});

describe('HU-38 CA3 · a dónde lleva un aviso de estado', () => {
  it('con el vehículo en servicio lleva al seguimiento; ya entregado, al detalle del historial', async () => {
    const tenant = crearTenantFalso({
      notificaciones: [{ data: [aviso(2, { orden_id: ORDEN_ENTREGADA, evento: 'orden.lista' }), aviso(1)], error: null }],
      ordenes: [{ data: ordenes, error: null }],
    });

    const { notificaciones } = await listarCentro(tenant, CLIENTE, { ahora: AHORA });

    expect(notificaciones[0].destino).toEqual({ pantalla: 'historial', ordenId: ORDEN_ENTREGADA });
    expect(notificaciones[1].destino).toEqual({ pantalla: 'seguimiento', codigo: 'SEG12345' });
    expect(filtros(tenant, 'ordenes')).toContainEqual(['in', 'id', [ORDEN_ENTREGADA, ORDEN_EN_CURSO]]);
  });

  it('una promoción o un aviso sin orden no lleva a otra pantalla', () => {
    expect(destinoDe({ tipo: 'comercial' }, ordenes[0])).toBeNull();
    expect(destinoDe({ tipo: 'operativa' }, undefined)).toBeNull();
    expect(destinoDe({ tipo: 'operativa' }, { id: ORDEN_EN_CURSO, estado: 'recibido', codigo_seguimiento: null })).toBeNull();
  });

  it('una orden que no es del cliente nunca da destino ni placa', async () => {
    const tenant = crearTenantFalso({
      notificaciones: [{ data: [aviso(1)], error: null }],
      ordenes: [{ data: [{ ...ordenes[0], vehiculo: { placa: 'ABC123', cliente_id: OTRO_CLIENTE } }], error: null }],
    });

    const { notificaciones } = await listarCentro(tenant, CLIENTE, { ahora: AHORA });
    expect(notificaciones[0]).toMatchObject({ destino: null, placa: null });
  });
});

describe('HU-38 · marcar como leída', () => {
  it('guarda la fecha de lectura solo en un aviso del cliente del pase', async () => {
    const tenant = crearTenantFalso({ notificaciones: [{ data: { id: aviso(1).id, estado: 'entregada', leida_at: null }, error: null }] });
    tenant.actualizar.mockResolvedValue({ id: aviso(1).id, leida_at: AHORA.toISOString() });

    const resultado = await marcarLeida(tenant, CLIENTE, aviso(1).id, { ahora: AHORA });

    expect(resultado).toEqual({ id: aviso(1).id, leida: true, leidaAt: AHORA.toISOString() });
    expect(filtros(tenant, 'notificaciones')).toContainEqual(['eq', 'cliente_id', CLIENTE]);
    expect(tenant.actualizar).toHaveBeenCalledWith(
      'notificaciones',
      aviso(1).id,
      { leida_at: AHORA.toISOString() },
      'id, leida_at',
      'Notificación',
      { cliente_id: CLIENTE },
    );
  });

  it('repetirlo no cambia la fecha en que se leyó', async () => {
    const tenant = crearTenantFalso({
      notificaciones: [{ data: { id: aviso(1).id, estado: 'enviada', leida_at: '2026-11-01T10:00:00Z' }, error: null }],
    });

    const resultado = await marcarLeida(tenant, CLIENTE, aviso(1).id, { ahora: AHORA });

    expect(resultado.leidaAt).toBe('2026-11-01T10:00:00Z');
    expect(tenant.actualizar).not.toHaveBeenCalled();
  });

  it('un aviso ajeno, inexistente, que no llegó o con id inválido responde el mismo 404', async () => {
    const casos = [
      { id: aviso(1).id, respuesta: { data: null, error: null } },
      { id: aviso(1).id, respuesta: { data: { id: aviso(1).id, estado: 'fallida', leida_at: null }, error: null } },
      { id: 'no-es-uuid', respuesta: null },
    ];
    for (const { id, respuesta } of casos) {
      const tenant = crearTenantFalso({ notificaciones: respuesta ? [respuesta] : [] });
      await expect(marcarLeida(tenant, CLIENTE, id)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
      expect(tenant.actualizar).not.toHaveBeenCalled();
    }
  });

  it('valida que el id de la ruta sea un UUID', () => {
    expect(idNotificacionCliente.safeParse({ id: aviso(1).id }).success).toBe(true);
    expect(idNotificacionCliente.safeParse({ id: '123' }).success).toBe(false);
  });
});
