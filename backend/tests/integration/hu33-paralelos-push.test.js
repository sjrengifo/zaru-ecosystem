// HU-33 con HU-29 y HU-40, contra Supabase: push como canal alterno, aviso en paralelo por los canales
// que eligió el cliente y confirmación tardía que cancela solo los alternos.
// No envía mensajes reales: los proveedores se simulan y las filas quedan programadas para 2030, así el
// worker de producción no las toma.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const FUTURO = new Date('2030-01-01T12:00:00Z');
const MIN = 60_000;
const VAPID = { PUSH_PROVEEDOR: 'webpush', VAPID_PUBLIC_KEY: 'publica-prueba', VAPID_PRIVATE_KEY: 'privada-prueba', VAPID_SUBJECT: 'mailto:pruebas@zaru.test' };
const CASOS = {
  push: { tel: '3003330011', placa: 'HUR341', codigo: 'HU33PP0001' },
  paralelo: { tel: '3003330012', placa: 'HUR342', codigo: 'HU33PP0002' },
  tarde: { tel: '3003330013', placa: 'HUR343', codigo: 'HU33PP0003' },
};

describe.skipIf(!hayEntornoIntegracion)(`HU-33 con HU-29 y HU-40${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let admin, tenant, enviarUnIntento, confirmarEntrega, cifrar, descifrar;
  const datos = {};
  const entornoAnterior = { ...process.env };

  const falla = () => ({ nombre: 'prueba', enviar: async () => { throw new Error('503 Service Unavailable'); } });
  const leer = async (id) => (await admin.from('notificaciones').select('*').eq('id', id).single().throwOnError()).data;
  const delAviso = async (ordenId) => (await admin.from('notificaciones').select('*').eq('orden_id', ordenId).order('created_at').throwOnError()).data;

  async function limpiar() {
    if (!admin) return;
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU33PP%');
    await admin.from('vehiculos').delete().eq('establecimiento_id', EST_A).in('placa', Object.values(CASOS).map((c) => c.placa));
    await admin.from('clientes').delete().eq('establecimiento_id', EST_A).in('telefono', Object.values(CASOS).map((c) => c.tel));
  }

  async function escenario(clave) {
    const caso = CASOS[clave];
    const cliente = (await admin.from('clientes').insert({
      establecimiento_id: EST_A, nombre: `[Prueba HU-33] ${clave}`, telefono: caso.tel, correo: cifrar(`hu33.${clave}@zaru.test`), autorizacion_datos: true,
    }).select().single().throwOnError()).data;
    await admin.from('consentimientos').insert({
      establecimiento_id: EST_A, cliente_id: cliente.id, tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', politica_version: '1.1',
    }).throwOnError();
    const vehiculo = (await admin.from('vehiculos').insert({ establecimiento_id: EST_A, cliente_id: cliente.id, placa: caso.placa, tipo: 'carro' }).select().single().throwOnError()).data;
    const orden = (await admin.from('ordenes').insert({
      establecimiento_id: EST_A, vehiculo_id: vehiculo.id, estado: 'listo', subtotal: 35000, descuento: 0, total: 35000, codigo_seguimiento: caso.codigo,
    }).select().single().throwOnError()).data;
    return { cliente, orden };
  }

  /** Aviso "listo" de un canal, como lo deja programarNotificacion (HU-29: uno por canal elegido). */
  async function aviso({ cliente, orden }, canal, destino) {
    return (await admin.from('notificaciones').insert({
      establecimiento_id: EST_A, cliente_id: cliente.id, orden_id: orden.id, tipo: 'operativa', evento: 'orden.lista', canal,
      destino: cifrar(destino), contenido: { asunto: 'Tu vehículo está listo' }, estado: 'pendiente',
      programada_para: FUTURO.toISOString(), clave_dedupe: `${orden.id}:orden.lista:${canal}`,
    }).select().single().throwOnError()).data;
  }

  async function agotar(id, opciones) {
    let ahora = FUTURO;
    for (let i = 0; i < 4; i += 1) {
      await enviarUnIntento(tenant, await leer(id), { ...opciones, ahora });
      ahora = new Date(ahora.getTime() + 10 * MIN);
    }
    return leer(id);
  }

  beforeAll(async () => {
    Object.assign(process.env, VAPID, { SMS_PROVEEDOR: 'consola' });
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ enviarUnIntento } = await import('../../src/shared/notificaciones.js'));
    ({ confirmarEntrega } = await import('../../src/shared/confirmacionEntrega.js'));
    ({ cifrar, descifrar } = await import('../../src/shared/cifrado.js'));
    const { crearAccesoTenant } = await import('../../src/shared/tenant.js');
    tenant = crearAccesoTenant(admin, { establecimientoId: EST_A });
    await limpiar();
    for (const clave of Object.keys(CASOS)) datos[clave] = await escenario(clave);
  });

  afterAll(async () => {
    await limpiar();
    process.env = entornoAnterior;
  });

  it('CA2 con HU-40: si el correo se agota y el cliente registró su celular para push, el alterno sale por push', async () => {
    const { cliente, orden } = datos.push;
    await admin.from('suscripciones_push').insert({
      establecimiento_id: EST_A, cliente_id: cliente.id, endpoint: `https://push.example.test/${orden.id}`,
      p256dh: 'p256dh-de-prueba-0123456789', auth: 'auth-de-prueba', dispositivo: 'Chrome en Android',
    }).throwOnError();

    const correo = await aviso(datos.push, 'correo', 'hu33.push@zaru.test');
    expect((await agotar(correo.id, { proveedor: falla() })).estado).toBe('fallida');

    const [, alterno] = await delAviso(orden.id);
    expect(alterno).toMatchObject({ canal: 'push', estado: 'pendiente', notificacion_origen_id: correo.id });
    expect(JSON.parse(descifrar(alterno.destino)).endpoint).toBe(`https://push.example.test/${orden.id}`);
    expect(alterno.contenido.url).toContain(CASOS.push.codigo);

    // Si push también falla, el siguiente alterno es el SMS.
    await agotar(alterno.id, { proveedorPush: falla() });
    const canales = (await delAviso(orden.id)).map((f) => f.canal);
    expect(canales).toEqual(['correo', 'push', 'sms']);
  });

  it('CA3 con HU-29: con correo y SMS elegidos, la alerta aparece solo cuando fallan los dos', async () => {
    const { cliente, orden } = datos.paralelo;
    await admin.from('preferencias_notificacion').insert({
      establecimiento_id: EST_A, cliente_id: cliente.id, canal_correo: true, canal_sms: true, canal_push: false,
      telefono_sms: CASOS.paralelo.tel, telefono_sms_verificado_at: new Date().toISOString(),
    }).throwOnError();
    const correo = await aviso(datos.paralelo, 'correo', 'hu33.paralelo@zaru.test');
    const sms = await aviso(datos.paralelo, 'sms', CASOS.paralelo.tel);

    const correoFallido = await agotar(correo.id, { proveedor: falla() });
    expect(correoFallido.fallo_definitivo_at).toBeNull(); // el SMS que eligió el cliente sigue en curso
    expect(await delAviso(orden.id)).toHaveLength(2); // no se crea un SMS repetido como alterno

    const smsFallido = await agotar(sms.id, { proveedorSms: falla() });
    expect(smsFallido.fallo_definitivo_at).toBeTruthy();
    expect(await delAviso(orden.id)).toHaveLength(2);
  });

  it('CA4 con HU-29: una entrega tardía cancela solo los alternos; los canales elegidos siguen', async () => {
    const { orden } = datos.tarde;
    // El cliente no guardó preferencias: el aviso sale por correo y el alterno sería el SMS.
    const correo = await aviso(datos.tarde, 'correo', 'hu33.tarde@zaru.test');
    await agotar(correo.id, { proveedor: falla() });
    const [, alterno] = await delAviso(orden.id);
    expect(alterno).toMatchObject({ canal: 'sms', estado: 'pendiente' });
    // Un canal elegido por el cliente que todavía no sale (p. ej. push recién activado).
    const elegido = await aviso(datos.tarde, 'push', JSON.stringify({ endpoint: 'https://push.example.test/x', keys: { p256dh: 'a', auth: 'b' } }));

    const resultado = await confirmarEntrega(admin, { notificacionId: correo.id, proveedor: 'resend', idProveedor: 'tardio' });
    expect(resultado).toMatchObject({ resultado: 'confirmada', cancelados: 1 });
    expect(await leer(alterno.id)).toMatchObject({ estado: 'cancelada', error: 'El aviso original se entregó' });
    expect((await leer(elegido.id)).estado).toBe('pendiente');
  });
});
