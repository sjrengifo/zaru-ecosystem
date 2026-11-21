// HU-35 (ZARU-24) — Campañas de promociones segmentadas, sin Supabase real.
// Cubre CA1 (segmentación y envío), CA2 (autorización comercial), CA3 (límite semanal) y
// CA4 (horario de envío de Bogotá), además de la idempotencia y la materialización en la cola.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

beforeAll(() => {
  process.env.ZARU_CLAVE_CIFRADO = Buffer.alloc(32, 7).toString('base64');
});

const {
  ajustarHorario,
  fotoPromocion,
  campanaPublica,
  estimar,
  crear,
  materializarCampana,
  escalaMinutosPruebas,
  MAX_DESTINATARIOS_SEMANA,
} = await import('../../src/shared/campanas.js');
const { plantillaPromocion, formatoFecha } = await import('../../src/shared/plantillasCorreo.js');
const { enviarUnIntento, procesarCola, ARRIENDO_COMERCIAL_MS } = await import('../../src/shared/notificaciones.js');
const { cifrar, descifrar, estaCifrado } = await import('../../src/shared/cifrado.js');
const { AppError } = await import('../../src/shared/errores.js');

const ESTABLECIMIENTO_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const PROMOCION_ID = '11111111-0000-4000-8000-000000000001';
const CAMPANA_ID = '33333333-0000-4000-8000-000000000003';
const CLIENTE_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const CLIENTE_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const CLIENTE_3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const CLIENTE_4 = 'aaaaaaaa-0000-4000-8000-000000000004';
const CLIENTE_5 = 'aaaaaaaa-0000-4000-8000-000000000005';
const CLIENTE_6 = 'aaaaaaaa-0000-4000-8000-000000000006';
const NOTIFICACION_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const PROMOCION = {
  id: PROMOCION_ID,
  nombre: 'Cambio de aceite',
  descripcion: 'Incluye filtro nuevo',
  condiciones: 'Válido de lunes a jueves',
  descuento_pct: 20,
  fecha_inicio: '2026-11-01',
  fecha_fin: '2026-12-31',
  estado: 'vigente',
  servicios: [{ nombre: 'Lavado premium' }, { nombre: 'Motor' }],
};

/** Builder encadenable que resuelve la respuesta configurada al ser awaited. */
function consultaQueResuelve(respuesta, registro = null) {
  const builder = new Proxy(
    {},
    {
      get(_, metodo) {
        if (metodo === 'then') return (resolver, rechazar) => Promise.resolve(respuesta).then(resolver, rechazar);
        if (metodo === 'maybeSingle') return () => Promise.resolve(respuesta);
        return (...args) => {
          registro?.push([metodo, ...args]);
          return builder;
        };
      },
    },
  );
  return builder;
}

/**
 * Cliente de base falso para `materializarCampana` / `procesarCola`.
 * Registra los inserts de notificaciones y los updates de campañas.
 */
function crearDbFalsa({ promocion = PROMOCION, segmento = [], clientes = [], conflictos = [] } = {}) {
  const inserts = [];
  const updates = [];
  const db = {
    from(tabla) {
      if (tabla === 'promociones_con_estado') return consultaQueResuelve({ data: promocion, error: null });
      if (tabla === 'clientes') return consultaQueResuelve({ data: clientes, error: null });
      if (tabla === 'notificaciones') {
        return {
          insert(valores) {
            const fila = Array.isArray(valores) ? valores[0] : valores;
            inserts.push(fila);
            if (conflictos.includes(fila.cliente_id)) {
              return { select: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicado' } }) };
            }
            return { select: () => Promise.resolve({ data: [{ id: `notif-${inserts.length}` }], error: null }) };
          },
        };
      }
      if (tabla === 'campanas') {
        return {
          update(cambios) {
            return {
              eq(columna, valor) {
                updates.push({ cambios, columna, valor });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(`Tabla inesperada en la prueba: ${tabla}`);
    },
    rpc: vi.fn(async () => ({ data: segmento, error: null })),
  };
  return { db, inserts, updates };
}

function campanaFila(extra = {}) {
  return {
    id: CAMPANA_ID,
    establecimiento_id: ESTABLECIMIENTO_ID,
    promocion_id: PROMOCION_ID,
    promocion_snapshot: fotoPromocion(PROMOCION),
    segmento: { diasSinVisita: 60, servicioIds: [], tiposVehiculo: [] },
    estado: 'programada',
    programada_para: '2026-11-20T17:00:00.000Z',
    programada_solicitada: '2026-11-20T17:00:00.000Z',
    total_destinatarios: 0,
    exclusiones: {},
    omitidos: {},
    clave_idempotencia: 'clave-1',
    creada_por: null,
    materializada_at: null,
    error: null,
    created_at: '2026-11-18T15:00:00.000Z',
    ...extra,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('HU-35 CA4 · horario de envío de Bogotá', () => {
  it('deja igual una hora dentro de la franja permitida (7:00 a. m. a 8:00 p. m.)', () => {
    const solicitada = new Date('2026-11-20T15:00:00-05:00');
    const { programadaPara, ajustada } = ajustarHorario(solicitada, new Date('2026-11-18T09:00:00-05:00'));
    expect(programadaPara.toISOString()).toBe(solicitada.toISOString());
    expect(ajustada).toBe(false);
  });

  it('acepta exactamente las 7:00 a. m.', () => {
    const solicitada = new Date('2026-11-20T07:00:00-05:00');
    const { programadaPara, ajustada } = ajustarHorario(solicitada, new Date('2026-11-18T09:00:00-05:00'));
    expect(programadaPara.toISOString()).toBe(solicitada.toISOString());
    expect(ajustada).toBe(false);
  });

  it('mueve las 9:30 p. m. a las 7:00 a. m. del día siguiente (ESC-F7-05)', () => {
    const solicitada = new Date('2026-11-20T21:30:00-05:00');
    const { programadaPara, ajustada } = ajustarHorario(solicitada, new Date('2026-11-18T09:00:00-05:00'));
    expect(programadaPara.toISOString()).toBe('2026-11-21T12:00:00.000Z'); // 7:00 a. m. en Bogotá
    expect(ajustada).toBe(true);
  });

  it('mueve las 8:00 p. m. exactas al día siguiente', () => {
    const solicitada = new Date('2026-11-20T20:00:00-05:00');
    const { programadaPara, ajustada } = ajustarHorario(solicitada, new Date('2026-11-18T09:00:00-05:00'));
    expect(programadaPara.toISOString()).toBe('2026-11-21T12:00:00.000Z');
    expect(ajustada).toBe(true);
  });

  it('mueve la madrugada a las 7:00 a. m. del mismo día', () => {
    const solicitada = new Date('2026-11-20T03:00:00-05:00');
    const { programadaPara, ajustada } = ajustarHorario(solicitada, new Date('2026-11-18T09:00:00-05:00'));
    expect(programadaPara.toISOString()).toBe('2026-11-20T12:00:00.000Z');
    expect(ajustada).toBe(true);
  });

  it('una hora pasada se envía de inmediato (ahora)', () => {
    const ahora = new Date('2026-11-20T15:00:00-05:00');
    const { programadaPara, ajustada } = ajustarHorario(new Date('2026-11-19T15:00:00-05:00'), ahora);
    expect(programadaPara.toISOString()).toBe(ahora.toISOString());
    expect(ajustada).toBe(true);
  });

  it('rechaza una fecha inválida con error de validación', () => {
    expect(() => ajustarHorario('no-es-fecha')).toThrow(AppError);
    try {
      ajustarHorario('no-es-fecha');
    } catch (err) {
      expect(err.codigo).toBe('VALIDACION');
      expect(err.detalles[0].campo).toBe('programadaPara');
    }
  });

  it('el límite semanal es de 2 promociones por cliente y sede', () => {
    expect(MAX_DESTINATARIOS_SEMANA).toBe(2);
  });
});

describe('HU-35 · foto de la promoción y forma pública', () => {
  it('fotoPromocion copia nombre, descuento, vigencia y nombres de servicios', () => {
    expect(fotoPromocion(PROMOCION)).toEqual({
      id: PROMOCION_ID,
      nombre: 'Cambio de aceite',
      descripcion: 'Incluye filtro nuevo',
      condiciones: 'Válido de lunes a jueves',
      descuentoPct: 20,
      fechaInicio: '2026-11-01',
      fechaFin: '2026-12-31',
      servicios: ['Lavado premium', 'Motor'],
    });
  });

  it('campanaPublica marca ajustada cuando la hora efectiva difiere de la solicitada', () => {
    const publica = campanaPublica(campanaFila({ programada_para: '2026-11-21T12:00:00.000Z' }));
    expect(publica.ajustada).toBe(true);
    expect(publica.programadaSolicitada).toBe('2026-11-20T17:00:00.000Z');
    expect(publica.promocion.nombre).toBe('Cambio de aceite');
  });

  it('campanaPublica tolera una fila sin snapshot ni conteos', () => {
    const publica = campanaPublica({
      id: CAMPANA_ID,
      promocion_id: PROMOCION_ID,
      estado: 'programada',
      programada_para: '2026-11-20T17:00:00.000Z',
      programada_solicitada: '2026-11-20T17:00:00.000Z',
      created_at: '2026-11-18T15:00:00.000Z',
    });
    expect(publica.promocion).toEqual({});
    expect(publica.segmento).toEqual({});
    expect(publica.totalDestinatarios).toBe(0);
    expect(publica.ajustada).toBe(false);
  });
});

describe('HU-35 CA2/CA3 · estimación de destinatarios', () => {
  /** `veces` respuestas de promoción: cada llamada a `estimar` vuelve a consultar la vigencia. */
  function tenantEstimacion(segmento, veces = 1) {
    const tenant = crearTenantFalso({
      promociones_con_estado: Array.from({ length: veces }, () => ({ data: PROMOCION, error: null })),
    });
    tenant.rpc.mockResolvedValue(segmento);
    return tenant;
  }

  it('devuelve el total y separa las exclusiones por motivo', async () => {
    const tenant = tenantEstimacion([
      { cliente_id: CLIENTE_1, motivo: null },
      { cliente_id: CLIENTE_2, motivo: 'sin_autorizacion' },
      { cliente_id: CLIENTE_3, motivo: 'limite_semanal' },
      { cliente_id: CLIENTE_4, motivo: 'sin_correo' },
    ]);

    const calculo = await estimar(tenant, {
      promocionId: PROMOCION_ID,
      segmento: { diasSinVisita: 60, servicioIds: [], tiposVehiculo: [] },
    });

    expect(calculo.total).toBe(1);
    expect(calculo.exclusiones).toEqual({ sinAutorizacion: 1, limiteSemanal: 1, sinCanal: 1 });
    expect(calculo.promocion.nombre).toBe('Cambio de aceite');
  });

  it('envía null en las listas vacías para que PostgREST no dude del tipo', async () => {
    const tenant = tenantEstimacion([]);
    await estimar(tenant, {
      promocionId: PROMOCION_ID,
      segmento: { diasSinVisita: 30, servicioIds: [], tiposVehiculo: [] },
    });

    expect(tenant.rpc).toHaveBeenCalledWith('segmento_campana', {
      p_dias_sin_visita: 30,
      p_servicio_ids: null,
      p_tipos_vehiculo: null,
      p_ahora: expect.any(String),
    });
  });

  it('pasa los filtros de servicios y tipos cuando vienen', async () => {
    const tenant = tenantEstimacion([]);
    await estimar(tenant, {
      promocionId: PROMOCION_ID,
      segmento: { diasSinVisita: 90, servicioIds: ['22222222-0000-4000-8000-000000000002'], tiposVehiculo: ['automovil'] },
    });

    expect(tenant.rpc).toHaveBeenCalledWith(
      'segmento_campana',
      expect.objectContaining({
        p_dias_sin_visita: 90,
        p_servicio_ids: ['22222222-0000-4000-8000-000000000002'],
        p_tipos_vehiculo: ['automovil'],
      }),
    );
  });

  it('ignora HU35_ESCALA_MINUTOS en producción', () => {
    const previo = { nodo: process.env.NODE_ENV, escala: process.env.HU35_ESCALA_MINUTOS };
    process.env.NODE_ENV = 'production';
    process.env.HU35_ESCALA_MINUTOS = '1';
    try {
      expect(escalaMinutosPruebas()).toBeNull();
    } finally {
      if (previo.nodo === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previo.nodo;
      if (previo.escala === undefined) delete process.env.HU35_ESCALA_MINUTOS;
      else process.env.HU35_ESCALA_MINUTOS = previo.escala;
    }
  });

  it('con HU35_ESCALA_MINUTOS mide el segmento en minutos y descarta visitas recientes', async () => {
    const ahora = new Date('2026-11-18T15:00:00.000Z');
    const haceMinutos = (minutos) => new Date(ahora.getTime() - minutos * 60_000).toISOString();
    const tenant = tenantEstimacion(
      [
        { cliente_id: CLIENTE_1, motivo: null, ultima_visita: haceMinutos(3) },
        { cliente_id: CLIENTE_2, motivo: 'sin_autorizacion', ultima_visita: haceMinutos(7) },
        { cliente_id: CLIENTE_3, motivo: null, ultima_visita: haceMinutos(50) },
      ],
      3,
    );

    process.env.HU35_ESCALA_MINUTOS = '1,5,10';
    try {
      const treinta = await estimar(
        tenant,
        { promocionId: PROMOCION_ID, segmento: { diasSinVisita: 30 } },
        { ahora },
      );
      // El SQL recibe 0 días (todos los que visitaron) y el corte de 1 minuto se aplica en el backend.
      expect(tenant.rpc).toHaveBeenLastCalledWith('segmento_campana', expect.objectContaining({ p_dias_sin_visita: 0 }));
      expect(treinta.total).toBe(2);
      expect(treinta.exclusiones).toEqual({ sinAutorizacion: 1 });

      // 60 días = 5 minutos: la visita de hace 3 minutos ya no pertenece al segmento.
      const sesenta = await estimar(
        tenant,
        { promocionId: PROMOCION_ID, segmento: { diasSinVisita: 60 } },
        { ahora },
      );
      expect(sesenta.total).toBe(1);
      expect(sesenta.elegibles).toEqual([CLIENTE_3]);

      // 90 días = 10 minutos: la visita de 7 minutos tampoco entra, así que no cuenta como exclusión.
      const noventa = await estimar(
        tenant,
        { promocionId: PROMOCION_ID, segmento: { diasSinVisita: 90 } },
        { ahora },
      );
      expect(noventa.total).toBe(1);
      expect(noventa.exclusiones).toEqual({});
    } finally {
      delete process.env.HU35_ESCALA_MINUTOS;
    }
  });

  it('no estima si la promoción no existe', async () => {
    const tenant = crearTenantFalso({ promociones_con_estado: [{ data: null, error: null }] });
    await expect(
      estimar(tenant, { promocionId: PROMOCION_ID, segmento: { diasSinVisita: 30 } }),
    ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(tenant.rpc).not.toHaveBeenCalled();
  });

  it('no estima si la promoción dejó de estar vigente', async () => {
    const tenant = crearTenantFalso({
      promociones_con_estado: [{ data: { ...PROMOCION, estado: 'vencida' }, error: null }],
    });
    await expect(
      estimar(tenant, { promocionId: PROMOCION_ID, segmento: { diasSinVisita: 30 } }),
    ).rejects.toMatchObject({ codigo: 'VALIDACION' });
    expect(tenant.rpc).not.toHaveBeenCalled();
  });
});

describe('HU-35 CA1/CA4 · creación de la campaña', () => {
  function tenantCreacion() {
    const tenant = crearTenantFalso({
      promociones_con_estado: [{ data: PROMOCION, error: null }],
      campanas: [],
    });
    tenant.rpc.mockResolvedValue([
      { cliente_id: CLIENTE_1, motivo: null },
      { cliente_id: CLIENTE_2, motivo: 'sin_autorizacion' },
    ]);
    return tenant;
  }

  it('guarda la foto, la hora ajustada, las exclusiones y la clave de idempotencia', async () => {
    const tenant = tenantCreacion();
    tenant.crear.mockImplementation(async (tabla, valores) => campanaFila({ ...valores, id: CAMPANA_ID }));

    const campana = await crear(
      tenant,
      {
        promocionId: PROMOCION_ID,
        segmento: { diasSinVisita: 60, servicioIds: [], tiposVehiculo: [] },
        programadaPara: '2026-11-20T21:30:00-05:00',
      },
      { usuarioId: '99999999-0000-4000-8000-000000000009', claveIdempotencia: 'clave-1', ahora: new Date('2026-11-18T15:00:00Z') },
    );

    const [tabla, fila] = tenant.crear.mock.calls[0];
    expect(tabla).toBe('campanas');
    expect(fila).toMatchObject({
      promocion_id: PROMOCION_ID,
      estado: 'programada',
      total_destinatarios: 1,
      exclusiones: { sinAutorizacion: 1 },
      clave_idempotencia: 'clave-1',
      creada_por: '99999999-0000-4000-8000-000000000009',
    });
    expect(fila.promocion_snapshot.nombre).toBe('Cambio de aceite');
    expect(fila.programada_solicitada).toBe('2026-11-21T02:30:00.000Z');
    expect(fila.programada_para).toBe('2026-11-21T12:00:00.000Z');
    expect(campana.ajustada).toBe(true);
  });

  it('sin fecha usa el momento actual (ajustado si cae de noche)', async () => {
    const tenant = tenantCreacion();
    tenant.crear.mockImplementation(async (tabla, valores) => campanaFila({ ...valores, id: CAMPANA_ID }));

    await crear(
      tenant,
      { promocionId: PROMOCION_ID, segmento: { diasSinVisita: 30 } },
      { ahora: new Date('2026-11-20T23:00:00-05:00') },
    );

    const fila = tenant.crear.mock.calls[0][1];
    expect(fila.programada_para).toBe('2026-11-21T12:00:00.000Z');
  });

  it('con la misma clave devuelve la campaña ya creada, sin duplicarla', async () => {
    const tenant = tenantCreacion();
    const existente = campanaFila();
    tenant.crear.mockRejectedValue({ codigo: 'CONFLICTO', message: 'El registro ya existe' });
    tenant.listar.mockImplementation((tabla) => {
      if (tabla === 'campanas') return consultaQueResuelve({ data: existente, error: null });
      return consultaQueResuelve({ data: PROMOCION, error: null });
    });
    tenant.rpc.mockResolvedValue([]);

    const campana = await crear(
      tenant,
      { promocionId: PROMOCION_ID, segmento: { diasSinVisita: 30 } },
      { claveIdempotencia: 'clave-1' },
    );

    expect(campana.id).toBe(CAMPANA_ID);
    expect(tenant.crear).toHaveBeenCalledTimes(1);
  });
});

describe('HU-35 CA1/CA2/CA3 · materialización en la cola', () => {
  it('encola un correo comercial por cliente elegible y cierra la campaña', async () => {
    const { db, inserts, updates } = crearDbFalsa({
      segmento: [
        { cliente_id: CLIENTE_1, motivo: null },
        { cliente_id: CLIENTE_2, motivo: null },
        { cliente_id: CLIENTE_3, motivo: 'sin_autorizacion' },
        { cliente_id: CLIENTE_4, motivo: 'limite_semanal' },
        { cliente_id: CLIENTE_5, motivo: 'sin_correo' },
        { cliente_id: CLIENTE_6, motivo: null },
      ],
      clientes: [
        { id: CLIENTE_1, correo: cifrar('uno@correo.com') },
        { id: CLIENTE_2, correo: 'dos@correo.com' },
      ],
    });

    const resultado = await materializarCampana(db, campanaFila(), { ahora: new Date('2026-11-21T12:00:00Z') });

    expect(resultado).toMatchObject({ id: CAMPANA_ID, estado: 'enviada', creadas: 2 });
    expect(resultado.omitidos).toEqual({ sinAutorizacion: 1, limiteSemanal: 1, sinCanal: 2 });

    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({
      cliente_id: CLIENTE_1,
      tipo: 'comercial',
      evento: 'campana.promocion',
      canal: 'correo',
      estado: 'pendiente',
      prioridad: 2,
      campana_id: CAMPANA_ID,
      clave_dedupe: `campana:${CAMPANA_ID}:${CLIENTE_1}`,
    });
    expect(estaCifrado(inserts[0].destino)).toBe(true);
    expect(descifrar(inserts[0].destino)).toBe('uno@correo.com');
    // Un correo guardado en texto plano se cifra antes de encolar (HU-50).
    expect(estaCifrado(inserts[1].destino)).toBe(true);
    expect(inserts[0].contenido.promocion.nombre).toBe('Cambio de aceite');
    expect(inserts[0].contenido.campana).toBe(true);

    expect(updates).toHaveLength(1);
    expect(updates[0].cambios).toMatchObject({
      estado: 'enviada',
      total_destinatarios: 2,
      exclusiones: { sinAutorizacion: 1, limiteSemanal: 1, sinCanal: 1 },
    });
  });

  it('cuenta como duplicado un mensaje que ya estaba en la cola', async () => {
    const { db, inserts, updates } = crearDbFalsa({
      segmento: [
        { cliente_id: CLIENTE_1, motivo: null },
        { cliente_id: CLIENTE_2, motivo: null },
      ],
      clientes: [
        { id: CLIENTE_1, correo: cifrar('uno@correo.com') },
        { id: CLIENTE_2, correo: cifrar('dos@correo.com') },
      ],
      conflictos: [CLIENTE_2],
    });

    const resultado = await materializarCampana(db, campanaFila());

    expect(inserts).toHaveLength(2);
    expect(resultado.creadas).toBe(1);
    expect(resultado.omitidos.duplicados).toBe(1);
    expect(updates[0].cambios.total_destinatarios).toBe(1);
  });

  it('usa la foto guardada al confirmar y no la promoción actual', async () => {
    const snapshot = { nombre: 'Promo congelada', descuentoPct: 15, servicios: [] };
    const { db, inserts } = crearDbFalsa({
      segmento: [{ cliente_id: CLIENTE_1, motivo: null }],
      clientes: [{ id: CLIENTE_1, correo: cifrar('uno@correo.com') }],
    });

    await materializarCampana(db, campanaFila({ promocion_snapshot: snapshot }));

    expect(inserts[0].contenido.promocion).toEqual(snapshot);
  });

  it('cancela la campaña si la promoción dejó de estar vigente', async () => {
    const { db, inserts, updates } = crearDbFalsa({ promocion: { ...PROMOCION, estado: 'vencida' } });

    const resultado = await materializarCampana(db, campanaFila());

    expect(inserts).toHaveLength(0);
    expect(resultado.estado).toBe('cancelada');
    expect(resultado.error).toContain('no está vigente');
    expect(updates[0].cambios).toMatchObject({ estado: 'cancelada' });
  });

  it('recalcula el segmento al materializar (no confía en el total guardado)', async () => {
    const { db } = crearDbFalsa({ segmento: [{ cliente_id: CLIENTE_1, motivo: null }], clientes: [] });
    await materializarCampana(db, campanaFila({ total_destinatarios: 99 }));

    expect(db.rpc).toHaveBeenCalledWith(
      'segmento_campana',
      expect.objectContaining({
        p_establecimiento_id: ESTABLECIMIENTO_ID,
        p_dias_sin_visita: 60,
      }),
    );
  });
});

describe('HU-35 · correo de promoción (RF-F7-10)', () => {
  const datos = {
    establecimiento: { nombre: 'Lavadero Norte', color_primario: '#123456' },
    cliente: { nombre: 'Luis Pérez' },
    promocion: {
      nombre: 'Cambio de aceite',
      descuentoPct: 20,
      descripcion: 'Incluye filtro nuevo',
      condiciones: 'Válido de lunes a jueves',
      fechaFin: '2026-12-31',
      servicios: ['Lavado premium', 'Motor'],
    },
    enlaceBaja: 'https://api.zaru.co/api/v1/publico/baja/token',
  };

  it('incluye nombre, descuento, servicios, vigencia y enlace de baja', () => {
    const mensaje = plantillaPromocion(datos);
    expect(mensaje.asunto).toBe('Cambio de aceite · Lavadero Norte');
    expect(mensaje.html).toContain('20% de descuento');
    expect(mensaje.html).toContain('Lavado premium');
    expect(mensaje.html).toContain('Válida hasta el 31 de diciembre de 2026');
    expect(mensaje.html).toContain('Dejar de recibir promociones');
    expect(mensaje.html).toContain(datos.enlaceBaja);
    expect(mensaje.texto).toContain('Cambio de aceite');
    expect(mensaje.texto).toContain('- Motor');
  });

  it('escapa el HTML de los datos que vienen de la base', () => {
    const mensaje = plantillaPromocion({
      ...datos,
      cliente: { nombre: '<script>alert(1)</script>' },
      promocion: { ...datos.promocion, nombre: '<b>Oferta</b>' },
    });
    expect(mensaje.html).not.toContain('<script>');
    expect(mensaje.html).not.toContain('<b>Oferta</b>');
    expect(mensaje.html).toContain('&lt;script&gt;');
    expect(mensaje.html).toContain('&lt;b&gt;Oferta&lt;/b&gt;');
  });

  it('formatoFecha conserva el día de vigencia sin corrimiento de zona', () => {
    expect(formatoFecha('2026-12-31')).toBe('31 de diciembre de 2026');
    expect(formatoFecha('')).toBe('');
  });
});

describe('HU-35 CA2/CA3 · revalidación antes de cada envío', () => {
  const fila = () => ({
    id: NOTIFICACION_ID,
    establecimiento_id: ESTABLECIMIENTO_ID,
    cliente_id: CLIENTE_1,
    tipo: 'comercial',
    evento: 'campana.promocion',
    canal: 'correo',
    destino: cifrar('luis@correo.com'),
    contenido: { promocion: { nombre: 'Cambio de aceite', descuentoPct: 10, servicios: ['Lavado premium'] } },
    estado: 'enviando',
    intentos: 0,
  });

  function tenantEnvio() {
    const tenant = crearTenantFalso({
      clientes: [{ data: { id: CLIENTE_1, nombre: 'Luis Pérez' }, error: null }],
      establecimientos: [{ data: { nombre: 'Lavadero Norte', color_primario: '#123456' }, error: null }],
    });
    tenant.crear.mockResolvedValue({ id: 'intento-1' });
    return tenant;
  }

  it('cancela y deja el motivo visible si el cliente revocó la autorización', async () => {
    const tenant = tenantEnvio();
    tenant.rpc.mockResolvedValue('sin_autorizacion');

    const resultado = await enviarUnIntento(tenant, fila(), { ahora: new Date('2026-11-21T12:00:00Z') });

    expect(resultado).toMatchObject({ estado: 'cancelada', omitida: true, motivo: 'sin_autorizacion' });
    expect(tenant.rpc).toHaveBeenCalledWith('reclamar_comercial', {
      p_notificacion_id: NOTIFICACION_ID,
      p_ahora: '2026-11-21T12:00:00.000Z',
    });
    expect(tenant.actualizar).toHaveBeenCalledWith(
      'notificaciones',
      NOTIFICACION_ID,
      expect.objectContaining({ estado: 'cancelada' }),
      'id',
      'Notificación',
    );
    const intento = tenant.crear.mock.calls.find(([tabla]) => tabla === 'notificacion_intentos');
    expect(intento[1]).toMatchObject({ resultado: 'fallido', recuperable: false, error: expect.stringContaining('revocó') });
  });

  it('cancela si el cliente ya recibió 2 promociones en la semana', async () => {
    const tenant = tenantEnvio();
    tenant.rpc.mockResolvedValue('limite_semanal');

    const resultado = await enviarUnIntento(tenant, fila());

    expect(resultado.estado).toBe('cancelada');
    expect(resultado.motivo).toBe('limite_semanal');
  });

  it('omite el envío si otro worker ya procesó la fila', async () => {
    const tenant = tenantEnvio();
    tenant.rpc.mockResolvedValue('ya_procesada');

    const resultado = await enviarUnIntento(tenant, fila());

    expect(resultado).toMatchObject({ estado: 'enviando', omitida: true });
    expect(tenant.actualizar).not.toHaveBeenCalled();
  });

  it('envía el correo con la promoción y el enlace de baja comercial cuando todo sigue vigente', async () => {
    const tenant = tenantEnvio();
    tenant.rpc.mockResolvedValue('ok');
    const proveedor = { nombre: 'falso', enviar: vi.fn().mockResolvedValue({ idProveedor: 'p-1' }) };

    const resultado = await enviarUnIntento(tenant, fila(), { proveedor, ahora: new Date('2026-11-21T12:00:00Z') });

    expect(resultado).toEqual({ estado: 'enviada', intentos: 1 });
    expect(proveedor.enviar).toHaveBeenCalledTimes(1);
    const envio = proveedor.enviar.mock.calls[0][0];
    expect(envio.para).toBe('luis@correo.com');
    expect(envio.html).toContain('Cambio de aceite');
    expect(envio.html).toContain('Dejar de recibir promociones');
    expect(envio.texto).toContain('Lavado premium');
    expect(tenant.actualizar).toHaveBeenCalledWith(
      'notificaciones',
      NOTIFICACION_ID,
      expect.objectContaining({ estado: 'enviada', proximo_intento_at: null }),
      'id',
      'Notificación',
    );
  });

  it('no envía una fila comercial ya enviada o cancelada', async () => {
    const tenant = tenantEnvio();
    const resultado = await enviarUnIntento(tenant, { ...fila(), estado: 'enviada' });
    expect(resultado).toMatchObject({ estado: 'enviada', omitida: true });
    expect(tenant.rpc).not.toHaveBeenCalled();
  });
});

describe('HU-35 RNF-F7-02 · prioridad de la cola', () => {
  it('procesa primero la prioridad menor y deja arriendo a las comerciales', async () => {
    const filaComercial = {
      id: 'cccccccc-0000-4000-8000-000000000002',
      establecimiento_id: ESTABLECIMIENTO_ID,
      cliente_id: CLIENTE_1,
      tipo: 'comercial',
      evento: 'campana.promocion',
      canal: 'correo',
      destino: cifrar('luis@correo.com'),
      contenido: { promocion: { nombre: 'Promo' } },
      estado: 'pendiente',
      intentos: 0,
    };
    const orden = [];
    const reclamada = [];
    const db = {
      from(tabla) {
        if (tabla === 'notificaciones') {
          return {
            select: () => consultaQueResuelve({ data: [filaComercial], error: null }, orden),
            update(cambios) {
              reclamada.push(cambios);
              return consultaQueResuelve({ data: { ...filaComercial, ...cambios }, error: null });
            },
          };
        }
        if (tabla === 'notificacion_intentos') {
          return { insert: () => ({ select: () => Promise.resolve({ data: [{ id: 'i-1' }], error: null }) }) };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      },
      rpc: vi.fn(async () => ({ data: 'sin_autorizacion', error: null })),
    };

    const ahora = new Date('2026-11-21T12:00:00Z');
    const resultados = await procesarCola(db, { ahora });

    const ordenadas = orden.filter(([metodo]) => metodo === 'order');
    expect(ordenadas[0]).toEqual(['order', 'prioridad', { ascending: true }]);
    expect(ordenadas[1]).toEqual(['order', 'programada_para', { ascending: true }]);
    // El reclamo de una fila comercial deja un arriendo de 10 minutos.
    expect(reclamada[0]).toEqual({
      estado: 'enviando',
      proximo_intento_at: new Date(ahora.getTime() + ARRIENDO_COMERCIAL_MS).toISOString(),
    });
    // La revalidación comercial se hizo antes de decidir y la fila quedó cancelada.
    expect(db.rpc).toHaveBeenCalled();
    expect(resultados[0]).toMatchObject({ id: filaComercial.id, estado: 'cancelada' });
  });
});
