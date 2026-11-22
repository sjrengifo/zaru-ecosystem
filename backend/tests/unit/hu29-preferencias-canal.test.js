// HU-29 — Selección del canal de notificación preferido (RF-F6-07 a RF-F6-10 · ESC-F6-05, ESC-F6-06).
// Todo con tenant falso y proveedores simulados: no hay Supabase, SMS ni correo reales.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO = Buffer.alloc(32, 7).toString('base64');
process.env.SMS_PROVEEDOR = 'consola';

const {
  obtenerPreferencias, guardarPreferencias, canalesActivos, solicitarCodigo, confirmarCodigo,
  hashCodigo, MAX_INTENTOS_CODIGO, ESPERA_REENVIO_MS, MAX_CODIGOS_POR_HORA,
} = await import('../../src/shared/preferenciasCanal.js');
const { programarNotificacion, crearAlternoSms } = await import('../../src/shared/notificaciones.js');
const { cifrar, descifrar } = await import('../../src/shared/cifrado.js');
const { preferenciasCanal, solicitudCodigoSms, confirmacionCodigoSms } = await import('../../src/schemas/cliente.schemas.js');

const CLIENTE_ID = '22222222-0000-4000-8000-000000000002';
const ORDEN_ID = '11111111-0000-4000-8000-000000000001';
const AHORA = new Date('2026-11-11T15:00:00Z');

const CLIENTE = { id: CLIENTE_ID, correo: cifrar('luis@correo.com'), telefono: '3001234567' };
const fila = (extra = {}) => ({
  id: '33333333-0000-4000-8000-000000000003',
  canal_push: false,
  canal_sms: false,
  canal_correo: true,
  telefono_sms: null,
  telefono_sms_verificado_at: null,
  ...extra,
});
const filaConSms = (extra = {}) =>
  fila({ canal_sms: true, telefono_sms: '3109998877', telefono_sms_verificado_at: '2026-11-10T10:00:00Z', ...extra });

const respuesta = (data) => [{ data, error: null }];

function tenantCon({ preferencias = null, cliente = CLIENTE, ...extra } = {}) {
  const tenant = crearTenantFalso({
    preferencias_notificacion: respuesta(preferencias),
    clientes: respuesta(cliente),
    ...extra,
  });
  tenant.crear.mockImplementation(async (tabla, valores) => ({ id: 'nuevo-id', ...valores }));
  return tenant;
}

const codigoDe = (clienteId, telefono, codigo) => hashCodigo(clienteId, telefono, codigo);
const errorDe = async (promesa) => promesa.then(() => null, (err) => err);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('HU-29 CA1 · canales con su estado actual', () => {
  it('sin preferencias guardadas: correo activo, sms y push inactivos, destinos enmascarados', async () => {
    const vista = await obtenerPreferencias(tenantCon(), CLIENTE_ID);

    expect(vista.canales.correo).toEqual({ activo: true, disponible: true, destino: 'lui****@correo.com' });
    // HU-59: el celular registrado ya está validado (el cliente entró con el código enviado a ese número).
    expect(vista.canales.sms).toMatchObject({ activo: false, verificado: true, celular: '300****567', celularRegistrado: '300****567' });
    expect(vista.canales.push).toMatchObject({ activo: false, disponible: false });
    expect(vista.sinCanales).toBe(false);
    // Nunca viajan el correo ni el celular completos.
    expect(JSON.stringify(vista)).not.toContain('luis@correo.com');
    expect(JSON.stringify(vista)).not.toContain('3001234567');
  });

  it('refleja lo guardado y el celular verificado', async () => {
    const vista = await obtenerPreferencias(tenantCon({ preferencias: filaConSms() }), CLIENTE_ID);
    expect(vista.canales.sms).toMatchObject({ activo: true, verificado: true, celular: '310****877' });
  });

  it('un cliente sin correo ve el canal correo no disponible', async () => {
    const vista = await obtenerPreferencias(tenantCon({ cliente: { ...CLIENTE, correo: null } }), CLIENTE_ID);
    expect(vista.canales.correo).toMatchObject({ disponible: false, destino: null });
  });

  it('solo consulta el establecimiento del pase (usa el tenant)', async () => {
    const tenant = tenantCon();
    await obtenerPreferencias(tenant, CLIENTE_ID);
    expect(tenant.consultas.map((c) => c.tabla).sort()).toEqual(['clientes', 'preferencias_notificacion']);
    expect(tenant.consultas.find((c) => c.tabla === 'preferencias_notificacion').filtros).toContainEqual(['eq', 'cliente_id', CLIENTE_ID]);
  });
});

describe('HU-29 CA2 · activar sms exige un celular validado', () => {
  it('HU-59: activa sms con el celular registrado sin pedir un segundo código y lo guarda como validado', async () => {
    const tenant = tenantCon();
    const vista = await guardarPreferencias(tenant, CLIENTE_ID, { push: false, sms: true, correo: true }, { ahora: AHORA });

    expect(tenant.crear.mock.calls[0][1]).toMatchObject({
      cliente_id: CLIENTE_ID,
      canal_sms: true,
      telefono_sms: '3001234567',
      telefono_sms_verificado_at: AHORA.toISOString(),
    });
    expect(vista.canales.sms).toMatchObject({ activo: true, verificado: true, celular: '300****567' });
  });

  it('con otro celular ya validado lo conserva y no lo cambia por el registrado', async () => {
    const tenant = tenantCon({ preferencias: filaConSms({ canal_sms: false }) });
    await guardarPreferencias(tenant, CLIENTE_ID, { push: false, sms: true, correo: true });
    expect(tenant.actualizar.mock.calls[0][2]).not.toHaveProperty('telefono_sms');
  });

  it('sin un celular registrado válido no activa sms y pide validarlo', async () => {
    const tenant = tenantCon({ cliente: { ...CLIENTE, telefono: null } });
    const error = await errorDe(guardarPreferencias(tenant, CLIENTE_ID, { push: false, sms: true, correo: true }));

    expect(error.codigo).toBe('VALIDACION');
    expect(error.detalles[0]).toMatchObject({ campo: 'sms', requiere: 'verificar_celular' });
    expect(tenant.crear).not.toHaveBeenCalled();
    expect(tenant.actualizar).not.toHaveBeenCalled();
  });

  it('activa sms cuando el celular ya fue verificado', async () => {
    const tenant = tenantCon({ preferencias: fila({ telefono_sms: '3109998877', telefono_sms_verificado_at: '2026-11-10T10:00:00Z' }) });
    tenant.actualizar.mockImplementation(async (tabla, id, cambios) => ({ ...fila({ telefono_sms: '3109998877', telefono_sms_verificado_at: '2026-11-10T10:00:00Z' }), ...cambios }));

    const vista = await guardarPreferencias(tenant, CLIENTE_ID, { push: false, sms: true, correo: false });

    expect(tenant.actualizar.mock.calls[0][2]).toMatchObject({ canal_sms: true, canal_correo: false, canal_push: false });
    expect(vista.canales.sms.activo).toBe(true);
  });

  it('no permite activar push mientras el dispositivo no se pueda registrar (HU-40)', async () => {
    const error = await errorDe(guardarPreferencias(tenantCon(), CLIENTE_ID, { push: true, sms: false, correo: true }));
    expect(error.detalles[0].campo).toBe('push');
  });

  it('no permite activar correo si el cliente no tiene correo registrado', async () => {
    const tenant = tenantCon({ cliente: { ...CLIENTE, correo: null } });
    const error = await errorDe(guardarPreferencias(tenant, CLIENTE_ID, { push: false, sms: false, correo: true }));
    expect(error.detalles[0].campo).toBe('correo');
  });
});

describe('HU-29 CA2 · código de 6 dígitos', () => {
  const proveedor = () => ({ nombre: 'falso', enviar: vi.fn().mockResolvedValue({ idProveedor: 'p-1' }) });

  it('envía el código por sms, guarda solo su hash y nunca lo devuelve', async () => {
    const tenant = tenantCon({ verificaciones_sms: respuesta([]) });
    const sms = proveedor();

    const resultado = await solicitarCodigo(tenant, CLIENTE_ID, { celular: '3109998877' }, { ahora: AHORA, proveedor: sms, generar: () => '123456' });

    expect(sms.enviar).toHaveBeenCalledWith({ para: '3109998877', texto: expect.stringContaining('123456') });
    const [tabla, guardado] = tenant.crear.mock.calls[0];
    expect(tabla).toBe('verificaciones_sms');
    expect(guardado).toMatchObject({ cliente_id: CLIENTE_ID, telefono: '3109998877', expira_at: '2026-11-11T15:10:00.000Z' });
    expect(guardado.codigo_hash).toBe(codigoDe(CLIENTE_ID, '3109998877', '123456'));
    expect(JSON.stringify(guardado)).not.toContain('"123456"');
    expect(resultado).toEqual({ enviado: true, celular: '310****877', expiraEn: '2026-11-11T15:10:00.000Z', reenvioEn: '2026-11-11T15:01:00.000Z' });
    expect(JSON.stringify(resultado)).not.toContain('123456');
  });

  it('sin celular indicado usa el celular con el que se registró el cliente', async () => {
    const tenant = tenantCon({ verificaciones_sms: respuesta([]) });
    const sms = proveedor();
    await solicitarCodigo(tenant, CLIENTE_ID, {}, { ahora: AHORA, proveedor: sms, generar: () => '000001' });
    expect(sms.enviar).toHaveBeenCalledWith(expect.objectContaining({ para: '3001234567' }));
  });

  it('limita a una solicitud por minuto', async () => {
    const reciente = { created_at: new Date(AHORA.getTime() - 20_000).toISOString() };
    const tenant = tenantCon({ verificaciones_sms: respuesta([reciente]) });
    const error = await errorDe(solicitarCodigo(tenant, CLIENTE_ID, {}, { ahora: AHORA, proveedor: proveedor() }));
    expect(error.codigo).toBe('LIMITE_EXCEDIDO');
    expect(error.message).toContain('40 segundos');
    expect(ESPERA_REENVIO_MS).toBe(60_000);
  });

  it('limita a 3 códigos por hora', async () => {
    const viejos = Array.from({ length: MAX_CODIGOS_POR_HORA }, (_, i) => ({ created_at: new Date(AHORA.getTime() - (10 + i) * 60_000).toISOString() }));
    const tenant = tenantCon({ verificaciones_sms: respuesta(viejos) });
    const error = await errorDe(solicitarCodigo(tenant, CLIENTE_ID, {}, { ahora: AHORA, proveedor: proveedor() }));
    expect(error.codigo).toBe('LIMITE_EXCEDIDO');
    expect(tenant.crear).not.toHaveBeenCalled();
  });

  it('si el sms no sale, el código queda invalidado y se informa', async () => {
    const tenant = tenantCon({ verificaciones_sms: respuesta([]) });
    const sms = { nombre: 'falso', enviar: vi.fn().mockRejectedValue(new Error('Twilio caído')) };
    const error = await errorDe(solicitarCodigo(tenant, CLIENTE_ID, {}, { ahora: AHORA, proveedor: sms }));
    expect(error.codigo).toBe('ERROR_INTERNO');
    expect(tenant.actualizar.mock.calls[0][2]).toEqual({ usado_at: AHORA.toISOString() });
  });

  describe('confirmar', () => {
    const vigente = (extra = {}) => ({
      id: '44444444-0000-4000-8000-000000000004',
      telefono: '3109998877',
      codigo_hash: codigoDe(CLIENTE_ID, '3109998877', '123456'),
      intentos: 0,
      expira_at: '2026-11-11T15:10:00.000Z',
      ...extra,
    });

    it('con el código correcto verifica el celular y consume el código', async () => {
      const tenant = tenantCon({ verificaciones_sms: respuesta([vigente()]) });
      tenant.actualizar.mockImplementation(async (tabla, id, cambios) => ({ id, ...cambios }));

      const vista = await confirmarCodigo(tenant, CLIENTE_ID, { codigo: '123456' }, { ahora: AHORA });

      expect(tenant.actualizar.mock.calls[0].slice(0, 3)).toEqual(['verificaciones_sms', '44444444-0000-4000-8000-000000000004', { usado_at: AHORA.toISOString() }]);
      const [tabla, valores] = tenant.crear.mock.calls[0];
      expect(tabla).toBe('preferencias_notificacion');
      expect(valores).toMatchObject({ cliente_id: CLIENTE_ID, telefono_sms: '3109998877', telefono_sms_verificado_at: AHORA.toISOString() });
      expect(vista.canales.sms).toMatchObject({ verificado: true, celular: '310****877' });
    });

    it('un código incorrecto suma un intento y dice cuántos quedan', async () => {
      const tenant = tenantCon({ verificaciones_sms: respuesta([vigente({ intentos: 1 })]) });
      const error = await errorDe(confirmarCodigo(tenant, CLIENTE_ID, { codigo: '999999' }, { ahora: AHORA }));

      expect(error.codigo).toBe('VALIDACION');
      expect(error.detalles[0].mensaje).toContain('3 intentos');
      const [, , cambios, , , donde] = tenant.actualizar.mock.calls[0];
      expect(cambios).toEqual({ intentos: 2 });
      expect(donde).toEqual({ intentos: 1 }); // solo aplica si nadie más cambió los intentos
      expect(tenant.crear).not.toHaveBeenCalled();
    });

    it('al llegar al máximo de intentos invalida el código y exige pedir uno nuevo', async () => {
      const tenant = tenantCon({ verificaciones_sms: respuesta([vigente({ intentos: MAX_INTENTOS_CODIGO - 1 })]) });
      const error = await errorDe(confirmarCodigo(tenant, CLIENTE_ID, { codigo: '999999' }, { ahora: AHORA }));

      expect(error.codigo).toBe('LIMITE_EXCEDIDO');
      expect(tenant.actualizar.mock.calls[0][2]).toEqual({ intentos: MAX_INTENTOS_CODIGO, usado_at: AHORA.toISOString() });
    });

    it('ni el código correcto sirve cuando ya agotó los intentos', async () => {
      const tenant = tenantCon({ verificaciones_sms: respuesta([vigente({ intentos: MAX_INTENTOS_CODIGO })]) });
      const error = await errorDe(confirmarCodigo(tenant, CLIENTE_ID, { codigo: '123456' }, { ahora: AHORA }));
      expect(error.codigo).toBe('LIMITE_EXCEDIDO');
      expect(tenant.crear).not.toHaveBeenCalled();
    });

    it('un código vencido o inexistente se rechaza', async () => {
      const vencido = tenantCon({ verificaciones_sms: respuesta([vigente({ expira_at: '2026-11-11T14:59:00.000Z' })]) });
      expect((await errorDe(confirmarCodigo(vencido, CLIENTE_ID, { codigo: '123456' }, { ahora: AHORA }))).detalles[0].campo).toBe('codigo');

      const ninguno = tenantCon({ verificaciones_sms: respuesta([]) });
      expect((await errorDe(confirmarCodigo(ninguno, CLIENTE_ID, { codigo: '123456' }, { ahora: AHORA }))).codigo).toBe('VALIDACION');
    });

    it('el código de un celular no sirve para otro número', () => {
      expect(codigoDe(CLIENTE_ID, '3109998877', '123456')).not.toBe(codigoDe(CLIENTE_ID, '3001234567', '123456'));
    });
  });
});

describe('HU-29 CA3 · desactivar todos los canales', () => {
  it('pide confirmar antes de dejar al cliente sin avisos y no guarda nada', async () => {
    const tenant = tenantCon({ preferencias: fila() });
    const error = await errorDe(guardarPreferencias(tenant, CLIENTE_ID, { push: false, sms: false, correo: false }));

    expect(error.codigo).toBe('CONFLICTO');
    expect(error.detalles[0]).toMatchObject({ campo: 'canales', requiereConfirmacion: true });
    expect(error.message).toContain('no recibirás avisos');
    expect(tenant.actualizar).not.toHaveBeenCalled();
  });

  it('con la confirmación guarda los tres canales inactivos', async () => {
    const tenant = tenantCon({ preferencias: fila() });
    tenant.actualizar.mockImplementation(async (tabla, id, cambios) => ({ ...fila(), ...cambios }));

    const vista = await guardarPreferencias(tenant, CLIENTE_ID, { push: false, sms: false, correo: false, confirmarSinCanales: true });

    expect(tenant.actualizar.mock.calls[0][2]).toMatchObject({ canal_push: false, canal_sms: false, canal_correo: false });
    expect(vista.sinCanales).toBe(true);
  });

  it('la primera vez crea la fila de preferencias del cliente', async () => {
    const tenant = tenantCon();
    await guardarPreferencias(tenant, CLIENTE_ID, { push: false, sms: false, correo: true }, { ahora: AHORA });
    const [tabla, valores] = tenant.crear.mock.calls[0];
    expect(tabla).toBe('preferencias_notificacion');
    expect(valores).toMatchObject({ cliente_id: CLIENTE_ID, canal_correo: true, canal_sms: false, canal_push: false, updated_at: AHORA.toISOString() });
  });
});

describe('HU-29 CA4 · el envío usa solo los canales activos', () => {
  it('canalesActivos: sin preferencias conserva el correo; con preferencias usa lo guardado', async () => {
    expect(await canalesActivos(tenantCon(), CLIENTE_ID)).toEqual({ guardadas: false, correo: true, sms: false, push: false, telefonoSms: null });
    expect(await canalesActivos(tenantCon({ preferencias: filaConSms({ canal_correo: false }) }), CLIENTE_ID))
      .toEqual({ guardadas: true, correo: false, sms: true, push: false, telefonoSms: '3109998877' });
  });

  it('el sms no cuenta como activo si el celular no está verificado', async () => {
    const sinVerificar = fila({ canal_sms: true, telefono_sms: '3109998877', telefono_sms_verificado_at: null });
    expect((await canalesActivos(tenantCon({ preferencias: sinVerificar }), CLIENTE_ID)).sms).toBe(false);
  });

  it('si no se pueden leer las preferencias, el aviso sale por correo en lugar de perderse', async () => {
    const tenant = crearTenantFalso({ preferencias_notificacion: [{ data: null, error: new Error('tabla no existe') }] });
    expect(await canalesActivos(tenant, CLIENTE_ID)).toMatchObject({ guardadas: false, correo: true, sms: false });
  });

  describe('programarNotificacion', () => {
    const orden = {
      id: ORDEN_ID,
      estado: 'listo',
      subtotal: 30000,
      descuento: 0,
      total: 30000,
      created_at: '2026-11-11T14:00:00Z',
      codigo_seguimiento: 'ABC12345',
      vehiculos: { placa: 'XYZ987', clientes: CLIENTE },
      orden_servicios: [{ precio: 30000, servicios: { nombre: 'Lavado premium' } }],
    };
    const autorizado = { data: [{ tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', created_at: '2026-11-01T10:00:00Z' }], error: null };

    function tenantDeEnvio(preferencias) {
      const tenant = crearTenantFalso({
        ordenes: respuesta(orden),
        preferencias_notificacion: respuesta(preferencias),
        autorizaciones_vigentes: [autorizado, autorizado],
        establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }, { data: { nombre: 'Lavadero Norte' }, error: null }],
      });
      tenant.crear.mockImplementation(async (tabla, valores) => ({ id: `n-${valores.canal}`, ...valores }));
      return tenant;
    }

    // Con el worker activo el envío queda solo en la cola: aquí se revisa qué filas se crean.
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NOTIFICACIONES_WORKER', 'on');
    });
    afterEach(() => vi.unstubAllEnvs());

    const canalesCreados = (tenant) => tenant.crear.mock.calls.filter(([tabla]) => tabla === 'notificaciones').map(([, f]) => f.canal);

    it('sin preferencias guardadas el aviso sale por correo, como antes', async () => {
      const tenant = tenantDeEnvio(null);
      const resumen = await programarNotificacion(tenant, ORDEN_ID, 'listo');
      expect(canalesCreados(tenant)).toEqual(['correo']);
      expect(resumen).toMatchObject({ canal: 'correo', estado: 'pendiente' });
    });

    it('solo sms activo: no se crea correo y el sms va al celular verificado, cifrado', async () => {
      const tenant = tenantDeEnvio(filaConSms({ canal_correo: false }));
      const resumen = await programarNotificacion(tenant, ORDEN_ID, 'listo');

      expect(canalesCreados(tenant)).toEqual(['sms']);
      const sms = tenant.crear.mock.calls.find(([tabla]) => tabla === 'notificaciones')[1];
      expect(descifrar(sms.destino)).toBe('3109998877'); // el verificado, no el de registro
      expect(sms.contenido.texto).toContain('XYZ987');
      expect(sms.clave_dedupe).toBe(`${ORDEN_ID}:orden.lista:sms`);
      expect(resumen).toMatchObject({ canal: 'sms', estado: 'pendiente', destino: '310****877' });
    });

    it('correo y sms activos: crea los dos avisos y devuelve ambos resúmenes', async () => {
      const tenant = tenantDeEnvio(filaConSms());
      const resumen = await programarNotificacion(tenant, ORDEN_ID, 'ingreso');
      expect(canalesCreados(tenant)).toEqual(['correo', 'sms']);
      expect(resumen.canales.map((c) => c.canal)).toEqual(['correo', 'sms']);
      const sms = tenant.crear.mock.calls.find(([, f]) => f.canal === 'sms')[1];
      expect(sms.contenido.texto).toContain('recibimos tu vehículo XYZ987');
    });

    it('con todos los canales desactivados no se envía nada y se informa el motivo', async () => {
      const tenant = tenantDeEnvio(fila({ canal_correo: false }));
      const resumen = await programarNotificacion(tenant, ORDEN_ID, 'listo');
      expect(canalesCreados(tenant)).toEqual([]);
      expect(resumen).toEqual({ canal: 'correo', estado: 'omitida', motivo: 'canal_inactivo' });
    });

    it('sms activo sin autorización de avisos (HU-30) no se envía', async () => {
      const revocado = { data: [{ tipo: 'notificaciones_servicio', otorgado: false, canal: 'panel', created_at: '2026-11-01T10:00:00Z' }], error: null };
      const otro = crearTenantFalso({
        ordenes: respuesta(orden),
        preferencias_notificacion: respuesta(filaConSms({ canal_correo: false })),
        autorizaciones_vigentes: [revocado],
      });
      otro.crear.mockResolvedValue({ id: 'x' });
      const resumen = await programarNotificacion(otro, ORDEN_ID, 'listo');
      expect(canalesCreados(otro)).toEqual([]);
      expect(resumen).toMatchObject({ canal: 'sms', estado: 'omitida', motivo: 'revocado' });
    });
  });

  describe('SMS alterno de HU-34', () => {
    const filaCorreo = { id: 'n-1', canal: 'correo', evento: 'orden.lista', orden_id: ORDEN_ID };
    const ordenCompleta = {
      id: ORDEN_ID, estado: 'listo', subtotal: 1, descuento: 0, total: 30000, created_at: '2026-11-11T14:00:00Z',
      vehiculos: { placa: 'XYZ987', clientes: CLIENTE }, orden_servicios: [],
    };
    const autorizado = { data: [{ tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', created_at: '2026-11-01T10:00:00Z' }], error: null };

    const alternoCon = (preferencias) => {
      const tenant = crearTenantFalso({
        ordenes: respuesta(ordenCompleta),
        establecimientos: respuesta({ nombre: 'Lavadero Norte' }),
        preferencias_notificacion: respuesta(preferencias),
        autorizaciones_vigentes: [autorizado],
        notificaciones: respuesta(null),
      });
      tenant.crear.mockResolvedValue({ id: 'sms-1' });
      return tenant;
    };

    it('no se envía si el cliente eligió explícitamente no recibir sms', async () => {
      const tenant = alternoCon(fila({ canal_sms: false }));
      expect(await crearAlternoSms(tenant, filaCorreo)).toBeNull();
      expect(tenant.crear).not.toHaveBeenCalled();
    });

    it('sin preferencias guardadas conserva el comportamiento de HU-34 (celular de registro)', async () => {
      const tenant = alternoCon(null);
      expect(await crearAlternoSms(tenant, filaCorreo)).toEqual({ id: 'sms-1', canal: 'sms' });
      expect(descifrar(tenant.crear.mock.calls[0][1].destino)).toBe('3001234567');
    });

    it('con sms activo usa el celular verificado', async () => {
      const tenant = alternoCon(filaConSms());
      await crearAlternoSms(tenant, filaCorreo);
      expect(descifrar(tenant.crear.mock.calls[0][1].destino)).toBe('3109998877');
    });
  });
});

describe('HU-29 · validación de las peticiones', () => {
  it('preferencias: exige los tres canales booleanos', () => {
    expect(preferenciasCanal.safeParse({ push: false, sms: true, correo: true }).success).toBe(true);
    expect(preferenciasCanal.safeParse({ push: false, sms: true }).success).toBe(false);
    expect(preferenciasCanal.safeParse({ push: 'si', sms: true, correo: true }).success).toBe(false);
  });

  it('celular: normaliza +57 y espacios; rechaza números inválidos; es opcional', () => {
    expect(solicitudCodigoSms.parse({ celular: '+57 310 999 8877' }).celular).toBe('3109998877');
    expect(solicitudCodigoSms.parse({}).celular).toBeUndefined();
    expect(solicitudCodigoSms.safeParse({ celular: '12345' }).success).toBe(false);
  });

  it('código: exactamente 6 dígitos', () => {
    expect(confirmacionCodigoSms.parse({ codigo: ' 123456 ' }).codigo).toBe('123456');
    for (const malo of ['12345', '1234567', 'abcdef', '']) {
      expect(confirmacionCodigoSms.safeParse({ codigo: malo }).success, malo).toBe(false);
    }
  });
});
