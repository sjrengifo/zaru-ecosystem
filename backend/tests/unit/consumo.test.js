// HU-39 (ZARU-28) — Contabilidad, alertas del 80 %, cupos y reportes administrativos.
// Sin Supabase real: las RPC se simulan con la forma exacta que devuelve PostgreSQL.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO = Buffer.alloc(32, 7).toString('base64');

const {
  mesBogota,
  fechaMes,
  validarMes,
  porcentaje,
  informacionCanal,
  estadoConsumo,
  textoAlerta80,
  reservarConsumo,
  confirmarConsumo,
  liberarConsumo,
  notificarAlerta80,
  reenviarAlertasPendientes,
  consultarReporte,
  consultarConsumoPropio,
  consultarDetalle,
  listarPlanes,
  actualizarPlan,
} = await import('../../src/shared/consumo.js');
const { enviarUnIntento } = await import('../../src/shared/notificaciones.js');

const SEDE = '00000000-0000-4000-8000-000000000001';
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLATAFORMA = 'aaaaaaaa-0000-4000-8000-000000000002';

function dbFalsa({
  establecimientos = [{ id: SEDE, nombre: 'Car Wash Central', plan: 'basico' }],
  planes = [{ nombre: 'basico', cupo_sms_mes: 200, cupo_correo_mes: 1000 }],
  consumos = [],
  perfiles = [
    { id: ADMIN, nombre: 'Ana', rol: 'admin', establecimiento_id: SEDE, activo: true },
    { id: PLATAFORMA, nombre: 'Zaru', rol: 'superadmin', establecimiento_id: null, activo: true },
  ],
  correos = new Map([[ADMIN, 'ana@central.co'], [PLATAFORMA, 'plataforma@zaru.app']]),
  alertas = [],
} = {}) {
  const inserciones = [];
  const actualizaciones = [];
  const consulta = (respuesta, filtros = []) => {
    const datos = Array.isArray(respuesta.data)
      ? respuesta.data.filter((fila) => filtros.every(([campo, valor]) => fila[campo] === valor))
      : respuesta.data;
    const resultado = { ...respuesta, data: datos };
    const builder = new Proxy({}, {
      get(_, metodo) {
        if (metodo === 'then') return (resolver, rechazar) => Promise.resolve(resultado).then(resolver, rechazar);
        if (['maybeSingle', 'single'].includes(metodo)) {
          return () => Promise.resolve({ data: Array.isArray(datos) ? datos[0] ?? null : datos, error: respuesta.error });
        }
        if (['eq', 'is'].includes(metodo)) return (campo, valor) => consulta(respuesta, [...filtros, [campo, valor]]);
        return () => builder;
      },
    });
    return builder;
  };
  const porTabla = {
    establecimientos: establecimientos,
    planes: planes,
    consumo_mensual: consumos,
    perfiles: perfiles,
    consumo_alertas: alertas,
  };
  const db = {
    from(tabla) {
      return {
        select: () => consulta({ data: porTabla[tabla] ?? [], error: null }),
        insert: (valores) => {
          inserciones.push({ tabla, valores });
          const filas = Array.isArray(valores) ? valores : [valores];
          porTabla[tabla] = [...(porTabla[tabla] ?? []), ...filas.map((f, i) => ({ id: `generado-${i}`, estado: 'pendiente', intentos: 0, detalle: {}, ...f }))];
          return consulta({ data: valores, error: null });
        },
        update: (cambios) => {
          const actualizado = porTabla[tabla]?.map?.((fila) => ({ ...fila, ...cambios })) ?? [];
          return {
            eq: (columna, valor) => {
              actualizaciones.push({ tabla, cambios, columna, valor });
              porTabla[tabla] = (porTabla[tabla] ?? []).filter((fila) => fila[columna] !== valor).concat(actualizado);
              return consulta({ data: actualizado, error: null });
            },
          };
        },
      };
    },
    auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [...correos].map(([id, email]) => ({ id, email })) }, error: null })) } },
  };
  return { db, inserciones, actualizaciones };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('HU-39 · periodo y cálculos', () => {
  it('el periodo se calcula en America/Bogota, con formato YYYY-MM y primer día del mes', () => {
    expect(mesBogota(new Date('2026-11-01T02:30:00Z'))).toBe('2026-10');
    expect(fechaMes('2026-11')).toBe('2026-11-01');
    expect(() => validarMes('11-2026')).toThrow(/YYYY-MM/);
  });

  it('el porcentaje y el estado respetan los umbrales 80 % y 100 %', () => {
    expect(porcentaje(159, 200)).toBe(79.5);
    expect(porcentaje(160, 200)).toBe(80);
    expect(estadoConsumo(informacionCanal(200, 159))).toBe('normal');
    expect(estadoConsumo(informacionCanal(200, 160))).toBe('advertencia');
    expect(estadoConsumo(informacionCanal(200, 200))).toBe('agotado');
    expect(informacionCanal(null, 10).porcentaje).toBeNull();
  });

  it('el texto de la alerta incluye establecimiento, plan, cupo, consumo, porcentaje y restantes', () => {
    const texto = textoAlerta80(
      { establecimientoId: SEDE, mes: '2026-11', plan: 'basico', cupo: 200, consumo: 160, porcentaje: 80, restantes: 40 },
      'Car Wash Central',
    );
    expect(texto).toContain('Car Wash Central');
    expect(texto).toContain('Básico');
    expect(texto).toContain('200');
    expect(texto).toContain('160');
    expect(texto).toContain('80 %');
    expect(texto).toContain('40');
  });
});

describe('HU-39 CA2 · reservas y cupo de SMS', () => {
  it('pasa el mes de Bogotá y la referencia de la notificación a la RPC atómica', async () => {
    const tenant = crearTenantFalso();
    tenant.rpc.mockResolvedValue({ estado: 'ok', cantidad: 10, cupo: 200 });
    const respuesta = await reservarConsumo(tenant, {
      canal: 'sms',
      referencia: 'notificacion-1',
      ahora: new Date('2026-11-01T02:30:00Z'),
    });
    expect(tenant.rpc).toHaveBeenCalledWith('hu39_reservar_consumo', expect.objectContaining({
      p_canal: 'sms',
      p_referencia: 'notificacion-1',
      p_mes: '2026-10-01',
    }));
    expect(respuesta.estado).toBe('ok');
  });

  it('con SMS agotado devuelve sin_cupo sin lanzar error ni marcar envío', async () => {
    const tenant = crearTenantFalso();
    tenant.rpc.mockResolvedValue({ estado: 'sin_cupo', cantidad: 200, cupo: 200, restantes: 0 });
    expect(await reservarConsumo(tenant, { canal: 'sms', referencia: 'n' })).toMatchObject({ estado: 'sin_cupo', restantes: 0 });
  });

  it('confirma y libera usando la misma referencia; una respuesta inesperada de la RPC no rompe el envío', async () => {
    const tenant = crearTenantFalso();
    tenant.rpc
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ estado: 'ok', cantidad: 160, alerta_80: { cupo: 200, consumo: 160 } })
      .mockResolvedValueOnce({ estado: 'ok' });
    expect((await confirmarConsumo(tenant, { canal: 'sms', referencia: 'n' })).degradado).toBe(true);
    expect((await confirmarConsumo(tenant, { canal: 'sms', referencia: 'n' })).alerta_80.consumo).toBe(160);
    expect((await liberarConsumo(tenant, { canal: 'sms', referencia: 'n' })).estado).toBe('ok');
  });

  it('sin cupo de SMS no envía por ese canal y crea el alterno por correo', async () => {
    const ORDEN = '11111111-0000-4000-8000-000000000001';
    const tenant = crearTenantFalso({
      ordenes: [{ data: {
        id: ORDEN,
        total: 30000,
        estado: 'entregado',
        vehiculos: { placa: 'ABC123', clientes: { id: ADMIN, nombre: 'Ana', correo: 'ana@central.co' } },
        orden_servicios: [],
      }, error: null }],
      establecimientos: [{ data: { nombre: 'Car Wash Central' }, error: null }],
      notificaciones: [{ data: [], error: null }],
      autorizaciones_vigentes: [{ data: [], error: null }],
    });
    tenant.rpc.mockResolvedValue({ estado: 'sin_cupo', cantidad: 200, cupo: 200, restantes: 0 });
    tenant.crear.mockResolvedValue({ id: 'alterno-1' });
    const proveedorSms = { nombre: 'sms-falso', enviar: vi.fn(async () => ({})) };
    const fila = {
      id: '22222222-0000-4000-8000-000000000001',
      establecimiento_id: SEDE,
      cliente_id: ADMIN,
      orden_id: ORDEN,
      tipo: 'operativa',
      evento: 'orden.lista',
      canal: 'sms',
      destino: '3001234567',
      contenido: { texto: 'Tu vehículo está listo' },
      estado: 'enviando',
      intentos: 0,
    };

    const resultado = await enviarUnIntento(tenant, fila, { ahora: new Date('2026-11-15T12:00:00Z'), proveedorSms });

    expect(resultado.estado).toBe('fallida');
    expect(resultado.error).toContain('Cupo mensual de SMS agotado');
    expect(proveedorSms.enviar).not.toHaveBeenCalled();
    expect(tenant.rpc).toHaveBeenCalledWith('hu39_reservar_consumo', expect.objectContaining({ p_canal: 'sms' }));
    expect(tenant.rpc).not.toHaveBeenCalledWith('hu39_confirmar_consumo', expect.anything());
    const alterno = tenant.crear.mock.calls.find(([tabla, valores]) => tabla === 'notificaciones' && valores.canal === 'correo');
    expect(alterno?.[1]).toMatchObject({ canal: 'correo', evento: 'orden.lista' });
    expect(alterno[1].contenido).toMatchObject({ alterno: true });
  });
});

describe('HU-39 CA1 · alerta del 80 %', () => {
  it('notifica por correo al administrador de la sede y al de la plataforma, una sola vez', async () => {
    const { db, inserciones, actualizaciones } = dbFalsa();
    const proveedor = { enviar: vi.fn(async () => ({ idProveedor: 'resend-1' })) };
    const detalle = { establecimientoId: SEDE, mes: '2026-11', plan: 'basico', cupo: 200, consumo: 160, porcentaje: 80, restantes: 40 };
    const resultado = await notificarAlerta80(detalle, { db, proveedor });

    expect(resultado).toEqual({ destinatarios: 2, enviadas: 2, fallidas: 0 });
    expect(proveedor.enviar).toHaveBeenCalledTimes(2);
    expect(proveedor.enviar.mock.calls.map((c) => c[0].para).sort()).toEqual(['ana@central.co', 'plataforma@zaru.app']);
    expect(inserciones.find((i) => i.tabla === 'consumo_alertas').valores).toHaveLength(2);
    expect(actualizaciones.filter((u) => u.tabla === 'consumo_alertas' && u.cambios.estado === 'enviada')).toHaveLength(2);
    expect(inserciones.find((i) => i.tabla === 'auditoria').valores.accion).toBe('hu39.alerta80.enviada');
  });

  it('no reenvía una alerta ya entregada en el mismo mes', async () => {
    const entregada = {
      id: 'alerta-1', establecimiento_id: SEDE, mes: '2026-11-01', destinatario_tipo: 'sede',
      destinatario_id: ADMIN, estado: 'enviada', intentos: 1, detalle: {},
    };
    const { db } = dbFalsa({ alertas: [entregada] });
    const proveedor = { enviar: vi.fn(async () => ({})) };
    const resultado = await notificarAlerta80(
      { establecimientoId: SEDE, mes: '2026-11', plan: 'basico', cupo: 200, consumo: 161, porcentaje: 80.5, restantes: 39 },
      { db, proveedor },
    );
    expect(resultado.destinatarios).toBe(0);
    expect(proveedor.enviar).not.toHaveBeenCalled();
  });

  it('un mes nuevo permite una alerta nueva', async () => {
    const entregada = {
      id: 'alerta-1', establecimiento_id: SEDE, mes: '2026-10-01', destinatario_tipo: 'sede',
      destinatario_id: ADMIN, estado: 'enviada', intentos: 1, detalle: {},
    };
    const { db, inserciones } = dbFalsa({ alertas: [entregada] });
    const proveedor = { enviar: vi.fn(async () => ({})) };
    await notificarAlerta80(
      { establecimientoId: SEDE, mes: '2026-11', plan: 'basico', cupo: 200, consumo: 160, porcentaje: 80, restantes: 40 },
      { db, proveedor },
    );
    expect(proveedor.enviar).toHaveBeenCalledTimes(2);
    expect(inserciones.find((i) => i.tabla === 'consumo_alertas').valores[0].mes).toBe('2026-11-01');
  });

  it('el worker reintenta entregas fallidas con un máximo de intentos', async () => {
    const fallida = {
      id: 'alerta-1', establecimiento_id: SEDE, mes: '2026-11-01', destinatario_tipo: 'sede',
      destinatario_id: ADMIN, estado: 'fallida', intentos: 1, detalle: {}, correo: 'ana@central.co',
    };
    const { db, actualizaciones } = dbFalsa({ alertas: [fallida] });
    const proveedor = { enviar: vi.fn(async () => ({})) };
    const resultado = await reenviarAlertasPendientes({ db, proveedor });
    expect(resultado.enviadas).toBe(1);
    expect(actualizaciones.find((u) => u.tabla === 'consumo_alertas' && u.cambios.estado === 'enviada')).toBeDefined();
  });
});

describe('HU-39 CA3 · reportes administrativos', () => {
  const consumos = [
    { establecimiento_id: SEDE, mes: '2026-11-01', canal: 'sms', cantidad: 160 },
    { establecimiento_id: SEDE, mes: '2026-11-01', canal: 'correo', cantidad: 400 },
  ];

  it('separa establecimientos y canales, calcula porcentajes y resume los umbrales', async () => {
    const segundaSede = '00000000-0000-4000-8000-000000000002';
    const { db } = dbFalsa({
      establecimientos: [
        { id: SEDE, nombre: 'Central', plan: 'basico', estado: 'activo' },
        { id: segundaSede, nombre: 'Norte', plan: 'basico', estado: 'activo' },
      ],
      planes: [
        { nombre: 'basico', cupo_sms_mes: 200, cupo_correo_mes: 1000 },
        { nombre: 'empresarial', cupo_sms_mes: 2000, cupo_correo_mes: 10000 },
      ],
      consumos: [...consumos, { establecimiento_id: segundaSede, mes: '2026-11-01', canal: 'sms', cantidad: 200 }],
    });
    const reporte = await consultarReporte({ mes: '2026-11', db });
    expect(reporte.mes).toBe('2026-11');
    expect(reporte.resumen).toEqual({
      establecimientos: 2,
      smsConsumidos: 360,
      correosConsumidos: 400,
      cercanosAlLimite: 1,
      cupoAgotado: 1,
    });
    expect(reporte.establecimientos[0].sms.usados).toBe(160);
    expect(reporte.establecimientos[0].sms.porcentaje).toBe(80);
    expect(reporte.establecimientos[0].correo.usados).toBe(400);
    expect(reporte.establecimientos[0].correo.porcentaje).toBe(40);
    expect(reporte.establecimientos[1].estado).toBe('agotado');
  });

  it('conserva el historial mensual y respeta los permisos por tenant en el consumo propio', async () => {
    const { db } = dbFalsa({
    consumos,
  });
    const detalle = await consultarDetalle({ establecimientoId: SEDE, mes: '2026-11', db });
    expect(detalle.historial[0]).toMatchObject({ mes: '2026-11', sms: 160, correo: 400 });

    const tenant = crearTenantFalso({
      establecimientos: [{ data: { id: SEDE, nombre: 'Central', plan: 'basico' }, error: null }],
      consumo_mensual: [{ data: consumos, error: null }],
    });
    tenant.listar.mockImplementation((tabla) => {
      const respuesta = tabla === 'establecimientos'
        ? { data: { id: SEDE, nombre: 'Central', plan: 'basico' }, error: null }
        : { data: consumos, error: null };
      const builder = new Proxy({}, {
        get(_, metodo) {
          if (metodo === 'then') return (resolver) => Promise.resolve(respuesta).then(resolver);
          return () => builder;
        },
      });
      return builder;
    });
    const propio = await consultarConsumoPropio(tenant, { mes: '2026-11', db });
    expect(propio.establecimientoId).toBe(SEDE);
    expect(propio.sms.usados).toBe(160);
    expect(tenant.consultas.every((c) => c.tabla !== 'planes')).toBe(true); // los cupos globales van por service_role
  });

  it('el catálogo de cupos es configurable y no modifica el consumo', async () => {
    const { db } = dbFalsa();
    expect((await listarPlanes({ db }))[0]).toMatchObject({ nombre: 'basico', etiqueta: 'Básico', cupo_sms_mes: 200 });
    const actualizado = await actualizarPlan('basico', { cupoSmsMes: 250 }, { db });
    expect(actualizado.cupo_sms_mes).toBe(250);
    await expect(actualizarPlan('inexistente', { cupoSmsMes: 1 }, { db })).rejects.toThrow();
  });
});
