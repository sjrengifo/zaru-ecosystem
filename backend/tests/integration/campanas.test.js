// HU-35 (ZARU-24): campañas de promociones segmentadas, contra la API y Supabase reales.
//
// Requiere backend/.env, backend/.env.spike.local y la migración
// 20261118090000_hu35_campanas.sql aplicada. Si la migración falta, la prueba falla con un
// mensaje explícito: sin `campanas`, `segmento_campana` y `reclamar_comercial` la HU no funciona.
//
// Aísla sus datos con un tipo de vehículo y un servicio únicos por corrida, de modo que el
// segmentador solo puede devolver a los clientes de esta prueba. No envía correos reales.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';
import { codigoSeguimiento } from '../helpers/ordenes.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const MARCA = Date.now().toString().slice(-8);
const TIPO = `hu35-${MARCA}`;
const ETIQUETA = `[Prueba HU-35 ${MARCA}]`;
const PREFIJO = `hu35-${MARCA}-`;
const TEL = {
  elegible: `31${MARCA}1`,
  revocado: `31${MARCA}2`,
  limite: `31${MARCA}3`,
  sinCorreo: `31${MARCA}4`,
  reciente: `31${MARCA}5`,
  otroServicio: `31${MARCA}6`,
};
const PLACAS = Object.fromEntries(Object.keys(TEL).map((quien, i) => [quien, `H35${MARCA.slice(-4)}${i}`]));

/** Fecha relativa a hoy en Bogotá, en formato AAAA-MM-DD. */
function dia(desplazamiento) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
}

/** Mañana y pasado mañana en Bogotá, para programar una campaña a las 9:30 p. m. */
function proximasFechas() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [anio, mes, d] = hoy.split('-').map(Number);
  const manana = new Date(Date.UTC(anio, mes - 1, d + 1, 12));
  return {
    manana: manana.toISOString().slice(0, 10),
    siguiente: new Date(manana.getTime() + 86_400_000).toISOString().slice(0, 10),
  };
}

const haceDias = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();

describe.skipIf(!hayEntornoIntegracion)(`HU-35 · campañas de promociones${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tenant, enviarUnIntento, materializarCampana;
  let tokenA, tokenB, tokenOperario, politica;
  const operario = { email: `hu35-operario-${MARCA}@zaru.test`, password: `Hu35-${randomUUID()}` };
  const ids = { clientes: {}, campanas: {} };
  let servicio, otroServicio, promocion, promocionEfimera;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const estimar = (cuerpo, token = tokenA) => request(app).post('/api/v1/campanas/estimar').use(con(token)).send(cuerpo);
  const crear = (cuerpo, clave, token = tokenA) => {
    const peticion = request(app).post('/api/v1/campanas').use(con(token));
    if (clave) peticion.set('Idempotency-Key', clave);
    return peticion.send(cuerpo);
  };
  const historial = (token = tokenA) => request(app).get('/api/v1/campanas').use(con(token));
  const segmento = () => ({ diasSinVisita: 60, servicioIds: [servicio.id], tiposVehiculo: [TIPO] });

  async function limpiar() {
    if (!admin) return;
    const { data: clientes } = await admin.from('clientes').select('id').eq('establecimiento_id', EST_A).in('telefono', Object.values(TEL));
    const clienteIds = (clientes ?? []).map((c) => c.id);
    if (clienteIds.length) {
      await admin.from('notificaciones').delete().eq('establecimiento_id', EST_A).in('cliente_id', clienteIds);
      const { data: vehiculos } = await admin.from('vehiculos').select('id').eq('establecimiento_id', EST_A).in('cliente_id', clienteIds);
      if (vehiculos?.length) await admin.from('ordenes').delete().in('vehiculo_id', vehiculos.map((v) => v.id));
      await admin.from('vehiculos').delete().eq('establecimiento_id', EST_A).in('cliente_id', clienteIds);
      await admin.from('clientes').delete().in('id', clienteIds); // consentimientos caen en cascada
    }
    await admin.from('campanas').delete().eq('establecimiento_id', EST_A).like('clave_idempotencia', `${PREFIJO}%`);
    await admin.from('promociones').delete().like('nombre', `${ETIQUETA}%`);
    await admin.from('servicios').delete().like('nombre', `${ETIQUETA}%`);
  }

  async function crearCliente(clave, { correo = `${clave}.${MARCA}@zaru.test`, comerciales = true } = {}) {
    const { data, error } = await admin
      .from('clientes')
      .insert({
        establecimiento_id: EST_A,
        nombre: `${ETIQUETA} ${clave}`,
        telefono: TEL[clave],
        correo,
        autorizacion_datos: true,
      })
      .select('id')
      .single()
      .throwOnError();
    if (error) throw error;
    ids.clientes[clave] = data.id;
    await admin
      .from('consentimientos')
      .insert([
        { establecimiento_id: EST_A, cliente_id: data.id, tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', politica_version: politica },
        { establecimiento_id: EST_A, cliente_id: data.id, tipo: 'comerciales', otorgado: comerciales, canal: 'panel', politica_version: politica },
      ])
      .throwOnError();
    return data.id;
  }

  /** Vehículo + orden entregada con un servicio, para que el cliente entre al segmento. */
  async function crearVisita(clienteId, placa, servicioUsado, dias) {
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({ establecimiento_id: EST_A, cliente_id: clienteId, placa, tipo: TIPO })
      .select('id')
      .single()
      .throwOnError();
    const entregadaAt = haceDias(dias);
    const { data: orden } = await admin
      .from('ordenes')
      .insert({
        establecimiento_id: EST_A,
        vehiculo_id: vehiculo.id,
        estado: 'entregado',
        subtotal: 30000,
        total: 30000,
        codigo_seguimiento: codigoSeguimiento(),
        estado_desde: entregadaAt,
        entregada_at: entregadaAt,
      })
      .select('id')
      .single()
      .throwOnError();
    await admin
      .from('orden_servicios')
      .insert({ orden_id: orden.id, servicio_id: servicioUsado.id, precio: 30000, duracion_min: 30 })
      .throwOnError();
    return vehiculo.id;
  }

  async function notificacionComercial(clienteId, estado = 'enviada', programada = haceDias(1)) {
    const { data } = await admin
      .from('notificaciones')
      .insert({
        establecimiento_id: EST_A,
        cliente_id: clienteId,
        tipo: 'comercial',
        evento: 'campana.promocion',
        canal: 'correo',
        destino: 'prueba@zaru.test',
        contenido: {},
        estado,
        programada_para: programada,
      })
      .select('*')
      .single()
      .throwOnError();
    return data;
  }

  beforeAll(async () => {
    // Esta suite comprueba los umbrales reales en días; la escala de validación local no aplica.
    delete process.env.HU35_ESCALA_MINUTOS;
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ enviarUnIntento } = await import('../../src/shared/notificaciones.js'));
    ({ materializarCampana } = await import('../../src/shared/campanas.js'));
    const { crearAccesoTenant } = await import('../../src/shared/tenant.js');
    tenant = crearAccesoTenant(admin, { establecimientoId: EST_A });

    // Si la migración no está aplicada, el fallo debe decirlo sin ambigüedad.
    const { error: errorTabla } = await admin.from('campanas').select('id').limit(1);
    if (errorTabla) {
      throw new Error(
        `HU-35 requiere la migración 20261118090000_hu35_campanas.sql aplicada en Supabase: ${errorTabla.message}`,
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const sesion = async (email, password = process.env.SPIKE_PASSWORD) => {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session.access_token;
    };

    await limpiar();
    politica = (await request(app).get('/api/v1/politicas-datos/vigente')).body.version;

    servicio = (
      await admin
        .from('servicios')
        .insert({ establecimiento_id: EST_A, nombre: `${ETIQUETA} Lavado premium`, precio: 30000, duracion_min: 30 })
        .select()
        .single()
        .throwOnError()
    ).data;
    otroServicio = (
      await admin
        .from('servicios')
        .insert({ establecimiento_id: EST_A, nombre: `${ETIQUETA} Polichado`, precio: 50000, duracion_min: 60 })
        .select()
        .single()
        .throwOnError()
    ).data;

    const { data: creadaPromocion } = await admin
      .from('promociones')
      .insert({
        establecimiento_id: EST_A,
        nombre: `${ETIQUETA} Cambio de aceite`,
        descripcion: 'Incluye filtro nuevo',
        condiciones: 'Válido de lunes a jueves',
        descuento_pct: 20,
        fecha_inicio: dia(-1),
        fecha_fin: dia(30),
      })
      .select()
      .single()
      .throwOnError();
    promocion = creadaPromocion;
    await admin.from('promocion_servicios').insert({ promocion_id: promocion.id, servicio_id: servicio.id }).throwOnError();

    const { data: efimera } = await admin
      .from('promociones')
      .insert({
        establecimiento_id: EST_A,
        nombre: `${ETIQUETA} Efímera`,
        descuento_pct: 10,
        fecha_inicio: dia(-1),
        fecha_fin: dia(10),
      })
      .select()
      .single()
      .throwOnError();
    promocionEfimera = efimera;

    await crearCliente('elegible');
    await crearCliente('revocado', { comerciales: false });
    await crearCliente('limite');
    await crearCliente('sinCorreo', { correo: null });
    await crearCliente('reciente');
    await crearCliente('otroServicio');

    await crearVisita(ids.clientes.elegible, PLACAS.elegible, servicio, 100);
    await crearVisita(ids.clientes.revocado, PLACAS.revocado, servicio, 100);
    await crearVisita(ids.clientes.limite, PLACAS.limite, servicio, 100);
    await crearVisita(ids.clientes.sinCorreo, PLACAS.sinCorreo, servicio, 100);
    await crearVisita(ids.clientes.reciente, PLACAS.reciente, servicio, 10);
    await crearVisita(ids.clientes.otroServicio, PLACAS.otroServicio, otroServicio, 100);

    // El cliente del límite ya recibió 2 promociones de la sede en la última semana.
    await notificacionComercial(ids.clientes.limite);
    await notificacionComercial(ids.clientes.limite);

    const { data, error } = await admin.auth.admin.createUser({
      email: operario.email,
      password: operario.password,
      email_confirm: true,
    });
    if (error) throw error;
    operario.id = data.user.id;
    await admin
      .from('perfiles')
      .insert({ id: operario.id, establecimiento_id: EST_A, nombre: `${ETIQUETA} Operario`, rol: 'operario' })
      .throwOnError();

    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    tokenB = await sesion(process.env.SPIKE_B_EMAIL);
    tokenOperario = await sesion(operario.email, operario.password);
  });

  afterAll(async () => {
    await limpiar();
    if (operario.id) await admin.auth.admin.deleteUser(operario.id);
  });

  describe('CA1: segmentación por días sin visita, servicios usados y tipo de vehículo', () => {
    it('estima solo al cliente que cumple los tres filtros', async () => {
      const res = await estimar({ promocionId: promocion.id, segmento: segmento() });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.promocion).toMatchObject({ nombre: `${ETIQUETA} Cambio de aceite`, descuentoPct: 20 });
    });

    it('excluye por autorización, límite semanal y falta de correo, y no incluye visitas recientes', async () => {
      const res = await estimar({ promocionId: promocion.id, segmento: segmento() });

      expect(res.body.exclusiones).toEqual({ sinAutorizacion: 1, limiteSemanal: 1, sinCanal: 1 });
    });

    it('sin filtros de servicio o tipo sigue exigiendo una orden entregada', async () => {
      const res = await estimar({
        promocionId: promocion.id,
        segmento: { diasSinVisita: 60, servicioIds: [], tiposVehiculo: [] },
      });

      // Los seis clientes de la prueba tienen una visita vieja o reciente; ninguno queda fuera por
      // servicio o tipo, pero el reciente sigue sin cumplir los 60 días.
      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.exclusiones.sinAutorizacion).toBeGreaterThanOrEqual(1);
    });

    it('rechaza una promoción de otra sede sin revelar que existe (404)', async () => {
      const res = await estimar({ promocionId: promocion.id, segmento: segmento() }, tokenB);
      expect(res.status).toBe(404);
    });

    it('el operario no puede estimar ni crear campañas (403)', async () => {
      expect((await estimar({ promocionId: promocion.id, segmento: segmento() }, tokenOperario)).status).toBe(403);
      expect((await crear({ promocionId: promocion.id, segmento: segmento() }, `${PREFIJO}operario`, tokenOperario)).status).toBe(403);
    });
  });

  describe('CA4: programación y ajuste al horario de Bogotá', () => {
    it('mueve las 9:30 p. m. a las 7:00 a. m. del día siguiente y lo informa', async () => {
      const { manana, siguiente } = proximasFechas();
      const solicitada = `${manana}T21:30:00-05:00`;
      const clave = `${PREFIJO}horario`;

      const res = await crear({ promocionId: promocion.id, segmento: segmento(), programadaPara: solicitada }, clave);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        estado: 'programada',
        ajustada: true,
        programadaSolicitada: new Date(solicitada).toISOString(),
        programadaPara: new Date(`${siguiente}T07:00:00-05:00`).toISOString(),
        totalDestinatarios: 1,
      });
      ids.campanas.horario = res.body.id;
    });

    it('una hora dentro de la franja se respeta sin ajuste', async () => {
      const { manana } = proximasFechas();
      const solicitada = `${manana}T10:00:00-05:00`;
      const res = await crear(
        { promocionId: promocion.id, segmento: segmento(), programadaPara: solicitada },
        `${PREFIJO}manana`,
      );

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ajustada: false, programadaPara: new Date(solicitada).toISOString() });
      ids.campanas.manana = res.body.id;
    });

    it('rechaza una fecha que no es ISO 8601', async () => {
      const res = await crear(
        { promocionId: promocion.id, segmento: segmento(), programadaPara: 'mañana en la noche' },
        `${PREFIJO}fecha-invalida`,
      );
      expect(res.status).toBe(400);
    });
  });

  describe('idempotencia y validaciones al confirmar', () => {
    it('exige el encabezado Idempotency-Key', async () => {
      const res = await crear({ promocionId: promocion.id, segmento: segmento() });
      expect(res.status).toBe(400);
      expect(res.body.error.detalles[0].campo).toBe('Idempotency-Key');
    });

    it('con la misma clave devuelve la misma campaña y no crea otra', async () => {
      const clave = `${PREFIJO}idempotente`;
      const primera = await crear({ promocionId: promocion.id, segmento: segmento() }, clave);
      const segunda = await crear({ promocionId: promocion.id, segmento: segmento() }, clave);

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);
      expect(segunda.body.id).toBe(primera.body.id);

      const { count } = await admin
        .from('campanas')
        .select('id', { count: 'exact', head: true })
        .eq('establecimiento_id', EST_A)
        .eq('clave_idempotencia', clave);
      expect(count).toBe(1);
      ids.campanas.idempotente = primera.body.id;
    });

    it('rechaza una promoción que ya no está vigente', async () => {
      await admin.from('promociones').update({ fecha_fin: dia(-1) }).eq('id', promocionEfimera.id).throwOnError();
      const res = await crear({ promocionId: promocionEfimera.id, segmento: segmento() }, `${PREFIJO}vencida`);
      expect(res.status).toBe(400);
      expect(res.body.error.detalles[0].campo).toBe('promocionId');
    });

    it('el historial de la sede incluye las campañas creadas y pagina', async () => {
      const res = await historial();
      expect(res.status).toBe(200);
      expect(res.body.campanas.map((c) => c.id)).toEqual(expect.arrayContaining([ids.campanas.horario, ids.campanas.idempotente]));
      expect(res.body.paginacion).toMatchObject({ pagina: 1, porPagina: 20 });
    });

    it('la sede B no ve las campañas de A', async () => {
      const res = await historial(tokenB);
      expect(res.body.campanas.map((c) => c.id)).not.toContain(ids.campanas.horario);
    });
  });

  describe('materialización y envío (CA1, CA2, CA3)', () => {
    it('encola una notificación comercial por destinatario con prioridad 2', async () => {
      const { data: fila } = await admin.from('campanas').select('*').eq('id', ids.campanas.horario).single().throwOnError();
      const resultado = await materializarCampana(admin, fila);

      expect(resultado).toMatchObject({ id: ids.campanas.horario, estado: 'enviada', creadas: 1 });

      const { data: notificaciones } = await admin
        .from('notificaciones')
        .select('*')
        .eq('campana_id', ids.campanas.horario)
        .throwOnError();
      expect(notificaciones).toHaveLength(1);
      expect(notificaciones[0]).toMatchObject({
        cliente_id: ids.clientes.elegible,
        tipo: 'comercial',
        evento: 'campana.promocion',
        canal: 'correo',
        estado: 'pendiente',
        prioridad: 2,
      });

      const { data: actualizada } = await admin
        .from('campanas')
        .select('estado, total_destinatarios, exclusiones')
        .eq('id', ids.campanas.horario)
        .single()
        .throwOnError();
      expect(actualizada).toMatchObject({
        estado: 'enviada',
        total_destinatarios: 1,
        exclusiones: { sinAutorizacion: 1, limiteSemanal: 1, sinCanal: 1 },
      });
    });

    it('envía el correo con la promoción y el enlace de baja comercial', async () => {
      const { data: notificacion } = await admin
        .from('notificaciones')
        .select('*')
        .eq('campana_id', ids.campanas.horario)
        .single()
        .throwOnError();
      const enviados = [];
      const proveedor = {
        nombre: 'falso-hu35',
        enviar: async (mensaje) => {
          enviados.push(mensaje);
          return { idProveedor: `hu35-${MARCA}` };
        },
      };

      const resultado = await enviarUnIntento(tenant, notificacion, { proveedor });

      expect(resultado).toEqual({ estado: 'enviada', intentos: 1 });
      expect(enviados).toHaveLength(1);
      expect(enviados[0].para).toBe(`elegible.${MARCA}@zaru.test`);
      expect(enviados[0].html).toContain(`${ETIQUETA} Cambio de aceite`);
      expect(enviados[0].html).toContain('Dejar de recibir promociones');
      expect(enviados[0].html).toContain('/baja/');

      const { data: enviada } = await admin
        .from('notificaciones')
        .select('estado, proximo_intento_at')
        .eq('id', notificacion.id)
        .single()
        .throwOnError();
      expect(enviada).toMatchObject({ estado: 'enviada', proximo_intento_at: null });
    });

    it('cancela el envío si el cliente revocó la autorización comercial', async () => {
      await admin
        .from('consentimientos')
        .insert({
          establecimiento_id: EST_A,
          cliente_id: ids.clientes.elegible,
          tipo: 'comerciales',
          otorgado: false,
          canal: 'panel',
          politica_version: politica,
        })
        .throwOnError();
      const pendiente = await notificacionComercial(ids.clientes.elegible, 'pendiente', new Date().toISOString());

      const resultado = await enviarUnIntento(tenant, pendiente);

      expect(resultado).toMatchObject({ estado: 'cancelada', omitida: true, motivo: 'sin_autorizacion' });
      const { data: cancelada } = await admin.from('notificaciones').select('estado, error').eq('id', pendiente.id).single().throwOnError();
      expect(cancelada.estado).toBe('cancelada');
      expect(cancelada.error).toContain('revocó');

      // Se restaura la autorización para no afectar el resto de la prueba.
      await admin
        .from('consentimientos')
        .insert({
          establecimiento_id: EST_A,
          cliente_id: ids.clientes.elegible,
          tipo: 'comerciales',
          otorgado: true,
          canal: 'panel',
          politica_version: politica,
        })
        .throwOnError();
    });

    it('cancela el envío si el cliente ya recibió 2 promociones en la semana', async () => {
      const pendiente = await notificacionComercial(ids.clientes.limite, 'pendiente', new Date().toISOString());

      const resultado = await enviarUnIntento(tenant, pendiente);

      expect(resultado).toMatchObject({ estado: 'cancelada', omitida: true, motivo: 'limite_semanal' });
    });

    it('no materializa una campaña cuya promoción dejó de estar vigente', async () => {
      const efimera = await crear(
        { promocionId: promocion.id, segmento: segmento() },
        `${PREFIJO}se-cancela`,
      );
      await admin.from('promociones').update({ fecha_fin: dia(-1) }).eq('id', promocion.id).throwOnError();
      const { data: fila } = await admin.from('campanas').select('*').eq('id', efimera.body.id).single().throwOnError();

      const resultado = await materializarCampana(admin, fila);

      expect(resultado.estado).toBe('cancelada');
      expect(resultado.error).toContain('no está vigente');
      const { data: cancelada } = await admin.from('campanas').select('estado, error').eq('id', efimera.body.id).single().throwOnError();
      expect(cancelada).toMatchObject({ estado: 'cancelada' });
      expect(cancelada.error).toContain('no está vigente');

      // Se restaura la vigencia para no romper la limpieza ni otras comprobaciones.
      await admin.from('promociones').update({ fecha_fin: dia(30) }).eq('id', promocion.id).throwOnError();
    });
  });
});
