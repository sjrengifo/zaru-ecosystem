// HU-39 (ZARU-28): contabilidad de SMS, alerta del 80 % y reportes contra la API y Supabase reales.
//
// Requiere backend/.env, backend/.env.spike.local y la migración
// 20261119100000_hu39_consumo_por_plan.sql aplicada. Si la migración falta, la suite FALLA con un
// mensaje explícito: sin las RPC no se puede afirmar que los cupos funcionan.
//
// Todas las filas se aíslan en un periodo histórico (2026-01) y se borran al terminar. No se envían
// correos reales: la alerta se entrega con un proveedor falso, pero los destinatarios y el
// idempotente de `consumo_alertas` son los reales.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import '../helpers/entorno.js';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const MES = '2026-01';
const FECHA_MES = `${MES}-01`;
const AHORA = new Date('2026-01-15T12:00:00.000Z');
const MARCA = randomUUID().slice(0, 8);
const referencia = (nombre) => `hu39-it-${MARCA}-${nombre}`;
const superadmin = {
  email: `hu39-${MARCA}-superadmin@zaru.test`,
  password: `Zaru-${randomUUID()}-Aa1!`,
};

describe.skipIf(!hayEntornoIntegracion)(`HU-39 · consumo por plan${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tenantA, tenantB, crearAccesoTenant;
  let tokenA, tokenB, tokenSuper, idSuperadmin;
  let reservarConsumo, confirmarConsumo, liberarConsumo, notificarAlerta80, etiquetaPlan;
  let planSede, cupoInicial;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const ruta = (sufijo) => `/api/v1${sufijo}`;

  async function iniciarSesion(email, password) {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session.access_token;
  }

  async function limpiar() {
    if (!admin) return;
    for (const establecimientoId of [EST_A, EST_B]) {
      await admin.from('consumo_alertas').delete().eq('establecimiento_id', establecimientoId).eq('mes', FECHA_MES);
      await admin.from('consumo_reservas').delete().eq('establecimiento_id', establecimientoId).eq('mes', FECHA_MES);
      await admin.from('consumo_mensual').delete().eq('establecimiento_id', establecimientoId).eq('mes', FECHA_MES);
    }
  }

  /** Fija el contador a un valor known-good para que cada prueba sea independiente. */
  async function fijarContador(cantidad, { alerta = false, reservada = 0 } = {}) {
    const { error } = await admin.from('consumo_mensual').upsert({
      establecimiento_id: EST_A,
      mes: FECHA_MES,
      canal: 'sms',
      cantidad,
      reservada,
      alerta_80_enviada: alerta,
    });
    if (error) throw error;
  }

  async function contador() {
    const { data, error } = await admin.from('consumo_mensual')
      .select('cantidad, reservada, alerta_80_enviada')
      .eq('establecimiento_id', EST_A).eq('mes', FECHA_MES).eq('canal', 'sms').maybeSingle();
    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ crearAccesoTenant } = await import('../../src/shared/tenant.js'));
    ({
      reservarConsumo, confirmarConsumo, liberarConsumo, notificarAlerta80, etiquetaPlan,
    } = await import('../../src/shared/consumo.js'));
    tenantA = crearAccesoTenant(admin, { establecimientoId: EST_A });
    tenantB = crearAccesoTenant(admin, { establecimientoId: EST_B });

    // Si la migración no está aplicada, el fallo debe decirlo sin ambigüedad.
    for (const tabla of ['planes', 'consumo_mensual', 'consumo_reservas', 'consumo_alertas']) {
      const { error } = await admin.from(tabla).select('*').limit(1);
      if (error) {
        throw new Error(
          `HU-39 requiere la migración 20261119100000_hu39_consumo_por_plan.sql aplicada en Supabase (tabla ${tabla}): ${error.message}`,
        );
      }
    }
    for (const funcion of ['hu39_reservar_consumo', 'hu39_confirmar_consumo', 'hu39_liberar_consumo']) {
      const { error } = await admin.rpc(funcion, {
        p_establecimiento_id: EST_A, p_canal: 'sms', p_referencia: 'hu39-check', p_mes: FECHA_MES, p_ahora: AHORA.toISOString(),
      });
      if (error) throw new Error(`HU-39 requiere la RPC ${funcion}: ${error.message}`);
    }
    const { data: sede, error: errorSede } = await admin.from('establecimientos').select('plan').eq('id', EST_A).maybeSingle();
    if (errorSede || !sede?.plan) throw new Error(`No se pudo leer el plan de la sede de pruebas: ${errorSede?.message ?? 'sin plan'}`);
    planSede = sede.plan;
    const { data: plan, error: errorPlan } = await admin.from('planes').select('cupo_sms_mes').eq('nombre', planSede).maybeSingle();
    if (errorPlan || !plan) throw new Error(`HU-39 requiere el plan "${planSede}" sembrado: ${errorPlan?.message ?? 'sin fila'}`);
    cupoInicial = plan.cupo_sms_mes;

    tokenA = await iniciarSesion(process.env.SPIKE_A_EMAIL, process.env.SPIKE_PASSWORD);
    tokenB = await iniciarSesion(process.env.SPIKE_B_EMAIL, process.env.SPIKE_PASSWORD);

    const alta = await admin.auth.admin.createUser({ email: superadmin.email, password: superadmin.password, email_confirm: true });
    if (alta.error) throw alta.error;
    idSuperadmin = alta.data.user.id;
    const perfil = await admin.from('perfiles').insert({
      id: idSuperadmin, establecimiento_id: null, nombre: '[HU-39] Superadministrador de prueba', rol: 'superadmin', activo: true,
    });
    if (perfil.error) throw perfil.error;
    tokenSuper = await iniciarSesion(superadmin.email, superadmin.password);

    await limpiar();
  }, 60000);

  afterAll(async () => {
    await limpiar();
    if (admin && planSede && cupoInicial !== undefined) {
      await admin.from('planes').update({ cupo_sms_mes: cupoInicial, actualizado_at: new Date().toISOString() }).eq('nombre', planSede);
    }
    if (admin && idSuperadmin) {
      await admin.from('perfiles').delete().eq('id', idSuperadmin);
      await admin.auth.admin.deleteUser(idSuperadmin);
    }
  }, 60000);

  it('CA2: una reserva es idempotente, se libera si falla y solo cuenta lo confirmado', async () => {
    await fijarContador(0);
    const ref = referencia('idempotencia');

    expect((await reservarConsumo(tenantA, { canal: 'sms', referencia: ref, ahora: AHORA })).estado).toBe('ok');
    expect((await reservarConsumo(tenantA, { canal: 'sms', referencia: ref, ahora: AHORA })).ya_reservada).toBe(true);
    expect((await contador()).reservada).toBe(1);

    expect((await liberarConsumo(tenantA, { canal: 'sms', referencia: ref, ahora: AHORA })).estado).toBe('ok');
    expect(await contador()).toMatchObject({ cantidad: 0, reservada: 0 });

    expect((await reservarConsumo(tenantA, { canal: 'sms', referencia: ref, ahora: AHORA })).estado).toBe('ok');
    expect((await confirmarConsumo(tenantA, { canal: 'sms', referencia: ref, ahora: AHORA })).cantidad).toBe(1);
    expect((await confirmarConsumo(tenantA, { canal: 'sms', referencia: ref, ahora: AHORA })).cantidad).toBe(1);
    expect(await contador()).toMatchObject({ cantidad: 1, reservada: 0 });
  });

  it('CA2: con el SMS agotado la RPC devuelve sin_cupo sin ocupar el cupo', async () => {
    await fijarContador(cupoInicial);
    const resultado = await reservarConsumo(tenantA, { canal: 'sms', referencia: referencia('sin-cupo'), ahora: AHORA });
    expect(resultado).toMatchObject({ estado: 'sin_cupo', restantes: 0 });
    expect(await contador()).toMatchObject({ cantidad: cupoInicial, reservada: 0 });
  });

  it('CA1: el 80 % se informa una sola vez y la alerta queda registrada por destinatario', async () => {
    await fijarContador(Math.ceil(cupoInicial * 0.8) - 1);
    const refCruce = referencia('cruce');
    await reservarConsumo(tenantA, { canal: 'sms', referencia: refCruce, ahora: AHORA });
    const cruce = await confirmarConsumo(tenantA, {
      canal: 'sms',
      referencia: refCruce,
      ahora: AHORA,
    });
    expect(cruce.alerta_80).toMatchObject({
      establecimientoId: EST_A,
      mes: MES,
      plan: planSede,
      cupo: cupoInicial,
      consumo: Math.ceil(cupoInicial * 0.8),
      porcentaje: 80,
    });
    expect((await contador()).alerta_80_enviada).toBe(true);

    await fijarContador(Math.ceil(cupoInicial * 0.8) + 1, { alerta: true });
    const otroRef = referencia('despues-alerta');
    await reservarConsumo(tenantA, { canal: 'sms', referencia: otroRef, ahora: AHORA });
    // La RPC siempre declara la clave y la devuelve en null cuando no hay cruce nuevo.
    expect((await confirmarConsumo(tenantA, { canal: 'sms', referencia: otroRef, ahora: AHORA })).alerta_80).toBeFalsy();

    const enviados = [];
    const proveedor = { enviar: async (mensaje) => { enviados.push(mensaje); return { idProveedor: 'falso' }; } };
    const entrega = await notificarAlerta80(cruce.alerta_80, { proveedor });
    expect(entrega.destinatarios).toBeGreaterThanOrEqual(2);
    expect(entrega.enviadas).toBe(entrega.destinatarios);
    expect(enviados.some((m) => m.para === process.env.SPIKE_A_EMAIL)).toBe(true);
    expect(enviados.some((m) => m.texto.includes(`Plan contratado: ${etiquetaPlan(planSede)}`))).toBe(true);

    const { data: filas } = await admin.from('consumo_alertas')
      .select('*').eq('establecimiento_id', EST_A).eq('mes', FECHA_MES);
    expect(filas).toHaveLength(entrega.destinatarios);
    expect(filas.every((f) => f.estado === 'enviada')).toBe(true);

    const repetida = await notificarAlerta80(cruce.alerta_80, { proveedor });
    expect(repetida).toEqual({ destinatarios: 0, enviadas: 0, fallidas: 0 });
    expect(enviados).toHaveLength(entrega.destinatarios);
  }, 60000);

  it('CA3: el reporte global solo lo ve la plataforma; la sede solo ve su propio consumo', async () => {
    await fijarContador(42);
    const propio = await con(tokenA)(request(app).get(ruta(`/consumo?mes=${MES}`)));
    expect(propio.status).toBe(200);
    expect(propio.body).toMatchObject({ establecimientoId: EST_A, mes: MES, plan: planSede });
    expect(propio.body.sms.usados).toBe(42);

    // El filtro por establecimiento existe para el reporte global; en la ruta de sede se ignora
    // porque el tenant siempre sale de la sesión.
    const conIdAjeno = await con(tokenA)(request(app).get(ruta(`/consumo?mes=${MES}&establecimientoId=${EST_B}`)));
    expect(conIdAjeno.status).toBe(200);
    expect(conIdAjeno.body.establecimientoId).toBe(EST_A);
    const ajeno = await con(tokenB)(request(app).get(ruta(`/consumo?mes=${MES}`)));
    expect(ajeno.body.establecimientoId).toBe(EST_B);

    expect((await con(tokenA)(request(app).get(ruta(`/superadmin/consumo?mes=${MES}`)))).status).toBe(403);
    const reporte = await con(tokenSuper)(request(app).get(ruta(`/superadmin/consumo?mes=${MES}`)));
    expect(reporte.status).toBe(200);
    expect(reporte.body.mes).toBe(MES);
    expect(reporte.body.resumen.establecimientos).toBeGreaterThanOrEqual(2);
    const filaA = reporte.body.establecimientos.find((f) => f.establecimientoId === EST_A);
    expect(filaA).toMatchObject({ nombre: expect.any(String), plan: planSede });
    expect(filaA.sms.usados).toBe(42);

    const detalle = await con(tokenSuper)(request(app).get(ruta(`/superadmin/consumo/${EST_A}?mes=${MES}`)));
    expect(detalle.status).toBe(200);
    expect(detalle.body.historial.some((h) => h.mes === MES && h.sms === 42)).toBe(true);

    const planes = await con(tokenSuper)(request(app).get(ruta('/superadmin/planes')));
    expect(planes.status).toBe(200);
    expect(planes.body.map((p) => p.nombre)).toEqual(['basico', 'empresarial', 'intermedio']);
    const ajuste = await con(tokenSuper)(request(app).put(ruta(`/superadmin/planes/${planSede}`)).send({ cupoSmsMes: cupoInicial + 1 }));
    expect(ajuste.status).toBe(200);
    expect(ajuste.body.cupo_sms_mes).toBe(cupoInicial + 1);
    // El histórico no se reescribe: la fila del mes sigue con el consumo ya registrado.
    expect((await con(tokenSuper)(request(app).get(ruta(`/superadmin/consumo/${EST_A}?mes=${MES}`)))).body.sms.usados).toBe(42);
  }, 60000);

  it('CA1/CA3: las alertas persistidas se consultan por sede y por plataforma con roles separados', async () => {
    const propias = await con(tokenA)(request(app).get(ruta(`/consumo/alertas?mes=${MES}`)));
    expect(propias.status).toBe(200);
    expect(propias.body.mes).toBe(MES);
    expect(propias.body.alertas).toEqual(expect.any(Array));

    const { data: filasA } = await admin.from('consumo_alertas')
      .select('id').eq('establecimiento_id', EST_A).eq('mes', FECHA_MES);
    expect(propias.body.alertas).toHaveLength(filasA?.length ?? 0);
    for (const alerta of propias.body.alertas) {
      expect(alerta).toMatchObject({
        establecimientoId: EST_A,
        mes: MES,
        destinatarioTipo: expect.any(String),
        estado: expect.any(String),
        detalle: expect.objectContaining({ consumo: expect.any(Number), cupo: expect.any(Number), porcentaje: expect.any(Number) }),
      });
    }

    const globales = await con(tokenSuper)(request(app).get(ruta(`/superadmin/consumo/alertas?mes=${MES}`)));
    expect(globales.status).toBe(200);
    expect(globales.body.alertas.length).toBeGreaterThanOrEqual(propias.body.alertas.length);

    const filtradas = await con(tokenSuper)(request(app).get(ruta(`/superadmin/consumo/alertas?mes=${MES}&establecimientoId=${EST_B}`)));
    expect(filtradas.status).toBe(200);
    expect(filtradas.body.alertas.every((a) => a.establecimientoId === EST_B)).toBe(true);

    expect((await con(tokenA)(request(app).get(ruta(`/superadmin/consumo/alertas?mes=${MES}`)))).status).toBe(403);
    expect((await con(tokenSuper)(request(app).get(ruta(`/consumo/alertas?mes=${MES}`)))).status).toBe(403);
  }, 60000);
});
