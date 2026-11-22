// HU-31/HU-39: preferencias de canales y prueba real de envío contra Supabase.
//
// Requiere backend/.env, backend/.env.spike.local y las migraciones
// 20261119100000_hu39_consumo_por_plan.sql y 20261119110000_hu31_preferencias_canales.sql.
// Si falta alguna, la suite FALLA con un mensaje explícito: sin la tabla/RPC no se puede afirmar
// que el panel de canales funciona.
//
// En este ambiente los proveedores de correo y SMS son «consola». Push usa Web Push real cuando hay
// llaves VAPID; sin dispositivo del administrador la prueba reporta `sin_destino` y cae al correo.
// La suite no envía correos ni SMS externos: ejecuta el adaptador real, fuerza el respaldo y verifica
// el consumo HU-39. Preferencias, reservas y contadores se restauran al terminar. Las filas de auditoría
// quedan por diseño: esa tabla es inmutable y solo guarda destinos enmascarados y el id de la prueba.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import '../helpers/entorno.js';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';
import { pushConfigurado } from '../../src/shared/proveedorPush.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const MARCA = randomUUID().slice(0, 8);
const FORMATO_MES = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
});

describe.skipIf(!hayEntornoIntegracion)(`HU-31/HU-39 · canales y prueba real${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA;
  let preferenciasIniciales = [];
  let consumoInicial = null;
  let mes, fechaMes;
  const referencias = [];
  const rutas = (sufijo) => `/api/v1${sufijo}`;
  const conToken = (token) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;

    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const sesion = await anon.auth.signInWithPassword({
      email: process.env.SPIKE_A_EMAIL,
      password: process.env.SPIKE_PASSWORD,
    });
    if (sesion.error) throw sesion.error;
    tokenA = sesion.data.session.access_token;

    // Guardia de migración: un mensaje claro vale más que un 500 opaco.
    const tabla = await admin.from('config_canales').select('canal, activo').eq('establecimiento_id', EST_A);
    if (tabla.error) {
      throw new Error(`La suite requiere la migración 20261119110000_hu31_preferencias_canales.sql (tabla config_canales): ${tabla.error.message}`);
    }
    preferenciasIniciales = tabla.data ?? [];
    const rpc = await admin.rpc('guardar_preferencias_canales', {
      p_establecimiento_id: EST_A,
      p_canales: [],
    });
    if (rpc.error && !/jsonb|lista/i.test(rpc.error.message)) {
      throw new Error(`La suite requiere la RPC guardar_preferencias_canales: ${rpc.error.message}`);
    }

    mes = FORMATO_MES.format(new Date());
    fechaMes = `${mes}-01`;
    const consumo = await admin.from('consumo_mensual')
      .select('cantidad, reservada')
      .eq('establecimiento_id', EST_A).eq('mes', fechaMes).eq('canal', 'correo').maybeSingle();
    if (consumo.error) throw consumo.error;
    consumoInicial = consumo.data ?? null;
  }, 60000);

  afterAll(async () => {
    if (!admin) return;

    const original = preferenciasIniciales.length
      ? preferenciasIniciales.map(({ canal, activo }) => ({ canal, activo }))
      : ['sms', 'correo', 'push'].map((canal) => ({ canal, activo: true }));
    await admin.rpc('guardar_preferencias_canales', {
      p_establecimiento_id: EST_A,
      p_canales: original,
    });

    // La auditoría no se limpia: es inmutable y ya guarda los destinos enmascarados.
    for (const referencia of referencias) {
      await admin.from('consumo_reservas').delete()
        .eq('establecimiento_id', EST_A).eq('mes', fechaMes).eq('canal', 'correo').eq('referencia', referencia);
    }

    const filtro = { establecimiento_id: EST_A, mes: fechaMes, canal: 'correo' };
    if (consumoInicial) {
      await admin.from('consumo_mensual')
        .update({ cantidad: consumoInicial.cantidad, reservada: consumoInicial.reservada })
        .match(filtro);
    } else {
      await admin.from('consumo_mensual').delete().match(filtro);
    }
  }, 60000);

  it('CA1: la sede ve los tres canales con su disponibilidad real, sin poder elegir otro establecimiento', async () => {
    const respuesta = await request(app).get(rutas('/configuracion/canales')).set(conToken(tokenA));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.map((item) => item.canal)).toEqual(['sms', 'correo', 'push']);
    const pushConfig = pushConfigurado();
    expect(respuesta.body.find((item) => item.canal === 'push')).toEqual(expect.objectContaining({
      activo: expect.any(Boolean),
      disponible: pushConfig,
      proveedor: pushConfig ? 'webpush' : 'no_configurado',
      motivo: pushConfig ? null : 'El canal push no está configurado en este ambiente (PUSH_PROVEEDOR y llaves VAPID)',
    }));
    expect(respuesta.body.every((item) => !Object.keys(item).some((clave) => clave.includes('establecimiento')))).toBe(true);

    const rechazada = await request(app).put(rutas('/configuracion/canales')).set(conToken(tokenA)).send({
      establecimiento_id: '00000000-0000-0000-0000-00000000b058',
      canales: [{ canal: 'sms', activo: true }],
    });
    expect(rechazada.status).toBe(400);
  });

  it('CA2: guarda la preferencia en una sola RPC y la lee igual en la siguiente petición', async () => {
    const deseadas = [
      { canal: 'sms', activo: false },
      { canal: 'correo', activo: true },
      { canal: 'push', activo: true },
    ];
    const guardada = await request(app).put(rutas('/configuracion/canales')).set(conToken(tokenA)).send({ canales: deseadas });

    expect(guardada.status).toBe(200);
    expect(guardada.body.find((item) => item.canal === 'sms').activo).toBe(false);

    const leida = await request(app).get(rutas('/configuracion/canales')).set(conToken(tokenA));
    expect(leida.status).toBe(200);
    expect(leida.body.find((item) => item.canal === 'sms').activo).toBe(false);
    expect(leida.body.find((item) => item.canal === 'correo').activo).toBe(true);
  });

  it('CA3: la prueba cae de push/SMS al correo, muestra cada intento y contabiliza solo lo entregado', async () => {
    // La prueba es independiente del orden de ejecución: deja SMS apagado y correo encendido.
    await request(app).put(rutas('/configuracion/canales')).set(conToken(tokenA)).send({
      canales: [
        { canal: 'sms', activo: false },
        { canal: 'correo', activo: true },
        { canal: 'push', activo: true },
      ],
    });

    const antes = await request(app).get(rutas('/consumo')).set(conToken(tokenA));
    expect(antes.status).toBe(200);
    const usosCorreoAntes = antes.body.correo.usados;
    const usosSmsAntes = antes.body.sms.usados;

    const prueba = await request(app).post(rutas('/notificaciones/prueba')).set(conToken(tokenA)).send({ canal: 'push' });
    expect(prueba.status).toBe(200);
    expect(prueba.body.orden).toEqual(['push', 'sms', 'correo']);
    expect(prueba.body.estado).toBe('entregado');
    expect(prueba.body.canalEntregado).toBe('correo');

    const push = prueba.body.resultados.find((item) => item.canal === 'push');
    const sms = prueba.body.resultados.find((item) => item.canal === 'sms');
    const correo = prueba.body.resultados.find((item) => item.canal === 'correo');
    // Con VAPID configurado el proveedor existe, pero la prueba no tiene un dispositivo del
    // administrador registrado: se reporta sin destino y continúa por SMS/correo. Sin VAPID, el
    // proveedor directamente no está disponible. En los dos casos el respaldo es el mismo.
    expect(push.estado).toBe(pushConfigurado() ? 'sin_destino' : 'no_disponible');
    expect(push.aceptado).toBe(false);
    expect(sms.estado).toBe('inactivo');
    expect(sms.consumo.contado).toBe(false);
    expect(correo.estado).toBe('enviado');
    expect(correo.aceptado).toBe(true);
    expect(correo.consumo).toEqual({ reservado: true, contado: true, liberado: false });
    expect(correo.destino).toContain('***');
    expect(prueba.body.mes).toBe(mes);

    const correoCompleto = process.env.SPIKE_A_EMAIL;
    expect(JSON.stringify(prueba.body)).not.toContain(correoCompleto);

    const referencia = `prueba-${prueba.body.id}-correo`;
    referencias.push(referencia);
    const reserva = await admin.from('consumo_reservas')
      .select('estado, canal, referencia')
      .eq('establecimiento_id', EST_A).eq('mes', fechaMes).eq('referencia', referencia).maybeSingle();
    expect(reserva.error).toBeNull();
    expect(reserva.data).toEqual(expect.objectContaining({ estado: 'confirmada', canal: 'correo', referencia }));

    const despues = await request(app).get(rutas('/consumo')).set(conToken(tokenA));
    expect(despues.status).toBe(200);
    expect(despues.body.correo.usados).toBe(usosCorreoAntes + 1);
    expect(despues.body.sms.usados).toBe(usosSmsAntes);

    const auditoria = await admin.from('auditoria')
      .select('accion, resultado, detalle')
      .eq('recurso_id', prueba.body.id).maybeSingle();
    expect(auditoria.error).toBeNull();
    expect(auditoria.data).toEqual(expect.objectContaining({
      accion: 'notificacion.prueba.enviada',
      resultado: 'permitido',
    }));
    expect(JSON.stringify(auditoria.data.detalle)).not.toContain(correoCompleto);
  }, 60000);

  it('CA4: sin canal explícito se elige el primero activo y disponible, y la respuesta no expone el destino', async () => {
    const prueba = await request(app).post(rutas('/notificaciones/prueba')).set(conToken(tokenA)).send({});
    expect(prueba.status).toBe(200);
    expect(prueba.body.canalInicial).toBe('correo');
    expect(prueba.body.estado).toBe('entregado');
    expect(prueba.body.canalEntregado).toBe('correo');
    expect(prueba.body.resultados.every((item) => item.destino === null || item.destino.includes('***'))).toBe(true);

    referencias.push(`prueba-${prueba.body.id}-correo`);
    // afterAll restaura el contador al valor original, así que esta entrega no deja rastro.
  }, 60000);
});
