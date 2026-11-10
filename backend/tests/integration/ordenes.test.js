// HU-08: registrar el ingreso de un vehículo y crear su orden, probado contra la API y Supabase.
// Requiere backend/.env, backend/.env.spike.local y la migración 20261102120000_hu08_crear_orden aplicada;
// sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const ETIQUETA = '[Prueba HU-08]';
const TEL = { ana: '3008080801', nuevo: '3008080802', promo: '3008080803', ajeno: '3008080804' };
const PLACA = { ana: 'HUA801', nuevo: 'HUA802', promo: 'HUA803', ajeno: 'HUA804' };

/** Fecha de hoy en Bogotá, en formato AAAA-MM-DD. */
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

describe.skipIf(!hayEntornoIntegracion)(`Órdenes${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, tokenB, basico, motor, ajeno, ana, promo, politicaVigente;
  const ordenesCreadas = [];

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const crear = (cuerpo, token = tokenA) => request(app).post('/api/v1/ordenes').use(con(token)).send(cuerpo);
  const telefonos = [...Object.values(TEL), '3008080898', '3008080899'];

  async function limpiar() {
    if (!admin) return;
    const { data: clientes } = await admin.from('clientes').select('id').in('telefono', telefonos);
    const clienteIds = (clientes ?? []).map((c) => c.id);
    const { data: vehiculos } = clienteIds.length
      ? await admin.from('vehiculos').select('id').in('cliente_id', clienteIds)
      : { data: [] };
    const vehiculoIds = (vehiculos ?? []).map((v) => v.id);
    const ids = [...new Set([...ordenesCreadas, ...(await ordenesDe(vehiculoIds))])];
    if (ids.length) await admin.from('ordenes').delete().in('id', ids);
    await admin.from('clientes').delete().in('telefono', telefonos); // Sus vehículos caen en cascada.
    await admin.from('promociones').delete().like('nombre', `${ETIQUETA}%`);
    await admin.from('servicios').delete().like('nombre', `${ETIQUETA}%`);
  }

  async function ordenesDe(vehiculoIds) {
    if (!vehiculoIds.length) return [];
    const { data } = await admin.from('ordenes').select('id').in('vehiculo_id', vehiculoIds);
    return (data ?? []).map((o) => o.id);
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    const { createClient } = await import('@supabase/supabase-js');
    const sesion = async (email) => {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password: process.env.SPIKE_PASSWORD });
      if (error) throw error;
      return data.session.access_token;
    };

    await limpiar();
    politicaVigente = (await request(app).get('/api/v1/politicas-datos/vigente')).body.version;
    const servicio = async (establecimiento_id, nombre, precio, duracion_min) =>
      (await admin.from('servicios').insert({ establecimiento_id, nombre: `${ETIQUETA} ${nombre}`, precio, duracion_min }).select().single().throwOnError()).data;
    basico = await servicio(EST_A, 'Lavado básico', 25000, 30);
    motor = await servicio(EST_A, 'Lavado de motor', 30000, 40);
    ajeno = await servicio(EST_B, 'Lavado de B', 20000, 30);

    const cliente = async (establecimiento_id, nombre, telefono) =>
      (await admin
        .from('clientes')
        .insert({ establecimiento_id, nombre: `${ETIQUETA} ${nombre}`, telefono, autorizacion_datos: true })
        .select()
        .single()
        .throwOnError()).data;
    ana = await cliente(EST_A, 'Ana', TEL.ana);
    promo = await cliente(EST_A, 'Promo', TEL.promo);
    const deB = await cliente(EST_B, 'Ajeno', TEL.ajeno);

    const vehiculo = async (cliente_id, placa) =>
      (await admin.from('vehiculos').insert({ establecimiento_id: EST_A, cliente_id, placa, tipo: 'carro' }).select().single().throwOnError()).data;
    await vehiculo(ana.id, PLACA.ana);
    await vehiculo(promo.id, PLACA.promo);
    await admin.from('vehiculos').insert({ establecimiento_id: EST_B, cliente_id: deB.id, placa: PLACA.ajeno, tipo: 'carro' }).throwOnError();

    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    tokenB = await sesion(process.env.SPIKE_B_EMAIL);
  });

  afterAll(async () => {
    await limpiar();
  });

  describe('ESC-F3-01: crear orden para un vehículo registrado (CA1)', () => {
    it('responde 201 con total, estado recibido, código de seguimiento y entrega estimada', async () => {
      const { data: vehiculo } = await admin.from('vehiculos').select('id').eq('placa', PLACA.ana).single();
      const res = await crear({
        vehiculoId: vehiculo.id,
        servicioIds: [basico.id, motor.id],
        observaciones: 'Rayón en la puerta',
        establecimiento_id: EST_B,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        estado: 'recibido',
        subtotal: 55000,
        descuento: 0,
        total: 55000,
        observaciones: 'Rayón en la puerta',
        vehiculo: { placa: PLACA.ana },
      });
      expect(res.body.codigoSeguimiento).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
      expect(res.body.servicios).toEqual(
        expect.arrayContaining([
          { id: basico.id, nombre: `${ETIQUETA} Lavado básico`, precio: 25000, duracionMin: 30, descuento: 0 },
          { id: motor.id, nombre: `${ETIQUETA} Lavado de motor`, precio: 30000, duracionMin: 40, descuento: 0 },
        ]),
      );
      // entrega y created_at salen del mismo now() de Postgres (misma transacción): su diferencia es exactamente
      // la suma de duraciones (30 + 40 min) y no depende del reloj local, que puede estar desfasado del servidor.
      const entrega = new Date(res.body.entregaEstimadaAt).getTime();
      const creada = new Date(res.body.created_at).getTime();
      expect(entrega - creada).toBe(70 * 60 * 1000);

      ordenesCreadas.push(res.body.id);
      const { data: historial } = await admin.from('historial_estados').select('estado').eq('orden_id', res.body.id);
      expect(historial).toEqual([{ estado: 'recibido' }]);
    });

    it('RF-F3-03: no permite una segunda orden activa para el mismo vehículo', async () => {
      const { data: vehiculo } = await admin.from('vehiculos').select('id').eq('placa', PLACA.ana).single();
      const res = await crear({ vehiculoId: vehiculo.id, servicioIds: [basico.id] });
      expect(res.status).toBe(409);
      expect(res.body.error.mensaje).toContain('servicio en curso');
    });

    it('un vehículo o un servicio de otra sede no se pueden usar', async () => {
      const { data: vehiculoB } = await admin.from('vehiculos').select('id').eq('placa', PLACA.ajeno).single();
      expect((await crear({ vehiculoId: vehiculoB.id, servicioIds: [basico.id] })).status).toBe(404);
      const { data: vehiculoA } = await admin.from('vehiculos').select('id').eq('placa', PLACA.ana).single();
      expect((await crear({ vehiculoId: vehiculoA.id, servicioIds: [ajeno.id] })).status).toBe(400);
      expect((await crear({ vehiculoId: vehiculoA.id, servicioIds: [ajeno.id] }, tokenB)).status).toBe(404);
    });
  });

  describe('ESC-F3-02: crear orden con cliente y vehículo nuevos (CA2)', () => {
    const nueva = () => ({
      servicioIds: [basico.id],
      nuevoVehiculo: {
        cliente: {
          nombre: `${ETIQUETA} Nuevo`,
          telefono: TEL.nuevo,
          correo: 'hu08-nuevo@example.com',
          autorizacionDatos: true,
          politicaVersion: politicaVigente,
        },
        vehiculo: { placa: PLACA.nuevo.toLowerCase(), tipo: 'carro', marca: 'Renault', color: 'Gris' },
      },
    });

    it('crea cliente, consentimiento, vehículo y orden en una sola operación', async () => {
      const res = await crear(nueva());
      expect(res.status).toBe(201);
      expect(res.body.vehiculo.placa).toBe(PLACA.nuevo);
      ordenesCreadas.push(res.body.id);

      const { data: cliente } = await admin.from('clientes').select('id, correo').eq('telefono', TEL.nuevo).single();
      expect(cliente.correo).not.toBe('hu08-nuevo@example.com');
      // HU-30 CA1: sin marcar las casillas, avisos y promociones quedan sin autorizar.
      const { data: consentimientos } = await admin.from('consentimientos').select('tipo, otorgado').eq('cliente_id', cliente.id).order('tipo');
      expect(consentimientos).toEqual([
        { tipo: 'comerciales', otorgado: false },
        { tipo: 'notificaciones_servicio', otorgado: false },
        { tipo: 'tratamiento_datos', otorgado: true },
      ]);
      const { data: vehiculo } = await admin.from('vehiculos').select('placa, cliente_id').eq('placa', PLACA.nuevo).single();
      expect(vehiculo.cliente_id).toBe(cliente.id);
    });

    it('si la política no es la vigente no deja cliente, vehículo ni orden', async () => {
      const res = await crear({
        ...nueva(),
        nuevoVehiculo: {
          ...nueva().nuevoVehiculo,
          cliente: { ...nueva().nuevoVehiculo.cliente, telefono: '3008080899', politicaVersion: '0.0' },
        },
      });
      expect(res.status).toBe(409);
      const { data: clientes } = await admin.from('clientes').select('id').eq('telefono', '3008080899');
      const { data: vehiculos } = await admin.from('vehiculos').select('id').eq('placa', PLACA.nuevo);
      expect(clientes).toEqual([]);
      expect(vehiculos).toHaveLength(1); // El del caso anterior; la transacción fallida no agregó otro.
    });

    it('un teléfono o una placa repetidos responden 409 con el cliente dueño', async () => {
      const telefono = await crear({ ...nueva(), nuevoVehiculo: { ...nueva().nuevoVehiculo, vehiculo: { ...nueva().nuevoVehiculo.vehiculo, placa: 'HUA805' } } });
      expect(telefono.status).toBe(409);
      expect(telefono.body.error.detalles[0]).toMatchObject({ campo: 'telefono' });

      const placa = await crear({
        ...nueva(),
        nuevoVehiculo: {
          ...nueva().nuevoVehiculo,
          cliente: { ...nueva().nuevoVehiculo.cliente, telefono: '3008080898' },
        },
      });
      expect(placa.status).toBe(409);
      expect(placa.body.error.detalles[0]).toMatchObject({ campo: 'placa' });
    });
  });

  describe('HU-12 CA3: la mejor promoción vigente se aplica al total', () => {
    it('descuenta el servicio con promoción y deja el total y el descuento guardados', async () => {
      const fecha = hoy();
      const promocion = (
        await admin
          .from('promociones')
          .insert({
            establecimiento_id: EST_A,
            nombre: `${ETIQUETA} Motor 20`,
            descuento_pct: 20,
            fecha_inicio: fecha,
            fecha_fin: fecha,
          })
          .select()
          .single()
          .throwOnError()
      ).data;
      await admin.from('promocion_servicios').insert({ promocion_id: promocion.id, servicio_id: motor.id }).throwOnError();

      const { data: vehiculo } = await admin.from('vehiculos').select('id').eq('placa', PLACA.promo).single();
      const res = await crear({ vehiculoId: vehiculo.id, servicioIds: [basico.id, motor.id] });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ subtotal: 55000, descuento: 6000, total: 49000, promocion: { id: promocion.id } });
      expect(res.body.servicios.find((s) => s.id === motor.id)).toMatchObject({ precio: 30000, descuento: 6000 });
      ordenesCreadas.push(res.body.id);
    });
  });
});
