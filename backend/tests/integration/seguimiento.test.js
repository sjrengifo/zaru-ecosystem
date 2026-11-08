// HU-18: seguimiento público del lavado contra la API real y Supabase (Realtime incluido).
// Requiere backend/.env y backend/.env.spike.local; sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const TEL = { a: '3009181801', b: '3009181802' };
const ETIQUETA = '[Prueba HU-18]';
const PLACA = { vivo: 'HUS181', ajeno: 'HUS182', vencido: 'HUS183' };
const CODIGO = { vivo: 'HU18E2E001', ajeno: 'HU18E2E002', vencido: 'HU18E2E003' };
const NOMBRE_CLIENTE = `${ETIQUETA} Ana Seguimiento`;

/** Lee un flujo SSE y avisa cada `event: estado` recibido. */
function leerEventos(cuerpo, alRecibir) {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) return;
        pendiente += decodificador.decode(value, { stream: true });
        const bloques = pendiente.split('\n\n');
        pendiente = bloques.pop();
        for (const bloque of bloques) {
          const lineas = bloque.split('\n');
          if (!lineas.includes('event: estado')) continue;
          const datos = lineas.find((l) => l.startsWith('data: '));
          alRecibir(JSON.parse(datos.slice(6)), bloque);
        }
      }
    } catch {
      // la prueba cerró la conexión
    }
  })();
  return lector;
}

describe.skipIf(!hayEntornoIntegracion)(`Seguimiento del lavado${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, servidor, base, CONFIG_SSE, limiteCodigos;
  const vehiculos = {};

  const cambiar = (id, estado) =>
    request(app).patch(`/api/v1/ordenes/${id}/estado`).set('Authorization', `Bearer ${tokenA}`).send({ estado });

  async function limpiar() {
    if (!admin) return;
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU18E2E%');
    await admin.from('clientes').delete().in('telefono', Object.values(TEL));
  }

  async function crearOrden(clave, cambios = {}) {
    const vehiculo = vehiculos[clave];
    const { data } = await admin
      .from('ordenes')
      .insert({
        establecimiento_id: vehiculo.establecimiento_id,
        vehiculo_id: vehiculo.id,
        estado: 'recibido',
        subtotal: 25000,
        descuento: 0,
        total: 25000,
        codigo_seguimiento: CODIGO[clave],
        ...cambios,
      })
      .select()
      .single()
      .throwOnError();
    return data;
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ CONFIG_SSE, limiteCodigos } = await import('../../src/controllers/seguimiento.controller.js'));
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: process.env.SPIKE_A_EMAIL, password: process.env.SPIKE_PASSWORD });
    if (error) throw error;
    tokenA = data.session.access_token;

    await limpiar();
    const cliente = async (establecimiento_id, telefono) =>
      (await admin
        .from('clientes')
        .insert({ establecimiento_id, nombre: NOMBRE_CLIENTE, telefono, autorizacion_datos: true })
        .select()
        .single()
        .throwOnError()).data;
    const clienteA = await cliente(EST_A, TEL.a);
    const clienteB = await cliente(EST_B, TEL.b);
    const vehiculo = async (establecimiento_id, cliente_id, placa) =>
      (await admin.from('vehiculos').insert({ establecimiento_id, cliente_id, placa, tipo: 'carro' }).select().single().throwOnError()).data;
    vehiculos.vivo = await vehiculo(EST_A, clienteA.id, PLACA.vivo);
    vehiculos.vencido = await vehiculo(EST_A, clienteA.id, PLACA.vencido);
    vehiculos.ajeno = await vehiculo(EST_B, clienteB.id, PLACA.ajeno);

    servidor = app.listen(0);
    base = `http://127.0.0.1:${servidor.address().port}/api/v1`;
  });

  afterAll(async () => {
    servidor?.closeAllConnections?.();
    await new Promise((r) => (servidor ? servidor.close(r) : r()));
    await limpiar();
  });

  it('CA1: muestra la etapa actual "En cola" sin datos personales del cliente', async () => {
    await crearOrden('vivo');
    const res = await request(app).get(`/api/v1/publico/seguimiento/${CODIGO.vivo.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      codigo: CODIGO.vivo,
      estado: 'recibido',
      etapa: { titulo: 'En cola', paso: 1, totalPasos: 5 },
      vehiculo: { placa: PLACA.vivo },
      total: 25000,
      notaPago: 'El pago se realiza en el establecimiento',
    });
    const json = JSON.stringify(res.body);
    for (const dato of [NOMBRE_CLIENTE, TEL.a, EST_A]) expect(json).not.toContain(dato);
  });

  it('CA2: la pantalla abierta recibe cada cambio del operario en menos de 5 segundos', async () => {
    // Sin revisión periódica: el cambio solo puede llegar por Supabase Realtime.
    CONFIG_SSE.revisionMs = 120_000;
    const { data: orden } = await admin.from('ordenes').select('id').eq('codigo_seguimiento', CODIGO.vivo).single();

    const recibidos = [];
    let avisar = () => {};
    const respuesta = await fetch(`${base}/publico/seguimiento/${CODIGO.vivo}/eventos`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('text/event-stream');
    const lector = leerEventos(respuesta.body, (seguimiento) => {
      recibidos.push(seguimiento);
      avisar();
    });
    const esperarEtapa = (titulo, ms = 5_000) =>
      new Promise((resolver, rechazar) => {
        const revisar = () => recibidos.some((s) => s.etapa.titulo === titulo) && resolver();
        avisar = revisar;
        revisar();
        setTimeout(() => rechazar(new Error(`No llegó "${titulo}" en ${ms} ms`)), ms);
      });

    try {
      await esperarEtapa('En cola');
      // Deja que el canal de Realtime termine de suscribirse antes del primer cambio.
      await new Promise((r) => setTimeout(r, 3_000));

      for (const [estado, titulo] of [['en_lavado', 'Lavado iniciado'], ['secado', 'Secado'], ['listo', 'Listo para recoger']]) {
        const inicio = Date.now();
        expect((await cambiar(orden.id, estado)).status).toBe(200);
        await esperarEtapa(titulo);
        expect(Date.now() - inicio).toBeLessThan(5_000);
      }
      const ultimo = recibidos.at(-1);
      expect(ultimo.etapas.filter((e) => e.completada).map((e) => e.estado)).toEqual(['recibido', 'en_lavado', 'secado']);
    } finally {
      await lector.cancel();
    }
  }, 60_000);

  it('el código de una orden entregada hace más de 24 horas ya no responde', async () => {
    const hace2Dias = new Date(Date.now() - 48 * 3_600_000).toISOString();
    await crearOrden('vencido', { estado: 'entregado', entregada_at: hace2Dias, estado_desde: hace2Dias });
    const res = await request(app).get(`/api/v1/publico/seguimiento/${CODIGO.vencido}`);
    expect(res.status).toBe(404);
  });

  it('un código inexistente responde 404 igual que uno vencido y no abre el flujo', async () => {
    limiteCodigos.reiniciar();
    const res = await request(app).get('/api/v1/publico/seguimiento/ZZZZZZZZZZ/eventos');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ codigo: 'NO_ENCONTRADO', mensaje: 'Seguimiento no encontrado' });
  });

  it('el seguimiento de otra sede usa su propia marca y no se mezcla con la de A', async () => {
    await crearOrden('ajeno');
    const [a, b] = await Promise.all([
      request(app).get(`/api/v1/publico/seguimiento/${CODIGO.vivo}`),
      request(app).get(`/api/v1/publico/seguimiento/${CODIGO.ajeno}`),
    ]);
    expect(b.status).toBe(200);
    expect(b.body.vehiculo.placa).toBe(PLACA.ajeno);
    const { data: sedes } = await admin.from('establecimientos').select('id, nombre').in('id', [EST_A, EST_B]);
    const nombre = (id) => sedes.find((s) => s.id === id).nombre;
    expect(a.body.establecimiento.nombre).toBe(nombre(EST_A));
    expect(b.body.establecimiento.nombre).toBe(nombre(EST_B));
  });
});
