// HU-28 (ZARU-17) — Notificación automática por cambio de estado del vehículo.
// CA1: cada estado tiene su propio texto, con la placa, el estado y la hora del cambio.
// CA2: el aviso de "listo" lleva la sede, su dirección y el valor a pagar.
// CA3: al revertir, el aviso del estado deshecho se cancela o se corrige.
import { describe, it, expect } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');

const { textoAvisoSms, textoCorreccion, horaCorta } = await import('../../src/shared/proveedorSms.js');
const { PLANTILLAS, plantillaCorreccion } = await import('../../src/shared/plantillasCorreo.js');
const { alRevertirEstado, EVENTOS } = await import('../../src/shared/notificaciones.js');
const { direccionSede } = await import('../../src/schemas/establecimiento.schemas.js');

const ORDEN = '11111111-0000-4000-8000-000000000001';
const CLIENTE = '22222222-0000-4000-8000-000000000002';
const HORA = '2026-11-21T21:26:00Z'; // 4:26 p. m. en Colombia
const SEDE = { nombre: 'Lavadero Norte', direccion: 'Cra 10 # 5-20', color_primario: '#0F766E' };
const DATOS = { establecimiento: SEDE, placa: 'ABC123', total: 25000, hora: HORA };

describe('HU-28 CA1 · un texto por estado, con placa, estado y hora', () => {
  it('formatea la hora en Colombia', () => {
    expect(horaCorta(HORA)).toMatch(/^4:26\s?p\.\s?m\.$/);
    expect(horaCorta('no-es-fecha')).toBe('');
  });

  it.each([
    [EVENTOS.RECIBIDA, 'recibimos tu vehículo ABC123'],
    [EVENTOS.EN_LAVADO, 'ABC123 inició el lavado'],
    [EVENTOS.SECADO, 'ABC123 pasó a secado'],
    [EVENTOS.ENTREGADA, 'ABC123 fue entregado'],
  ])('%s dice lo que pasó y a qué hora', (evento, frase) => {
    const texto = textoAvisoSms(evento, DATOS);
    expect(texto).toContain(frase);
    expect(texto).toContain('a las 4:26');
    // Antes todos los estados intermedios caían en "está listo".
    expect(texto).not.toContain('listo');
    expect(texto).not.toMatch(/\.\./);
  });

  it('el correo de un estado intermedio incluye la hora del cambio', () => {
    const correo = PLANTILLAS[EVENTOS.EN_LAVADO]({
      establecimiento: SEDE,
      cliente: { nombre: 'Laura Gómez' },
      orden: { codigo_seguimiento: 'K7Q2M9XH4P' },
      vehiculo: { placa: 'ABC123' },
      horaCambio: HORA,
    });
    expect(correo.texto).toContain('ya inició el lavado');
    expect(correo.texto).toMatch(/Hora del cambio: .*4:26/);
    expect(correo.html).toContain('Hora del cambio');
  });
});

describe('HU-28 CA2 · el aviso de "listo" lleva sede, dirección y valor', () => {
  it('por SMS', () => {
    const texto = textoAvisoSms(EVENTOS.LISTA, DATOS);
    expect(texto).toContain('está listo para recoger en Lavadero Norte (Cra 10 # 5-20)');
    expect(texto).toContain('$25.000');
  });

  it('por correo', () => {
    const correo = PLANTILLAS[EVENTOS.LISTA]({
      establecimiento: SEDE,
      cliente: { nombre: 'Laura' },
      orden: { total: 25000 },
      vehiculo: { placa: 'ABC123' },
      horaCambio: HORA,
    });
    expect(correo.texto).toContain('Recógelo en: Cra 10 # 5-20');
    expect(correo.texto).toMatch(/\$\s?25\.000/);
    expect(correo.html).toContain('Cra 10 # 5-20');
  });

  it('sin dirección registrada el aviso sale igual, sin esa línea', () => {
    const texto = textoAvisoSms(EVENTOS.LISTA, { ...DATOS, establecimiento: { nombre: 'Lavadero Norte' } });
    expect(texto).toContain('está listo para recoger en Lavadero Norte a las');
    expect(texto).not.toContain('(');
  });

  it('la dirección se valida: hasta 160 caracteres, espacios normalizados y vacía = sin dirección', () => {
    expect(direccionSede.parse({ direccion: '  Cra 10   # 5-20 ' })).toEqual({ direccion: 'Cra 10 # 5-20' });
    expect(direccionSede.parse({ direccion: '   ' })).toEqual({ direccion: null });
    expect(direccionSede.safeParse({ direccion: 'x'.repeat(161) }).success).toBe(false);
  });
});

describe('HU-28 CA3 · al revertir se cancela o se corrige el aviso', () => {
  const aviso = (extra) => ({
    id: extra.id,
    cliente_id: CLIENTE,
    canal: 'correo',
    destino: 'destino-cifrado',
    clave_dedupe: `${ORDEN}:${EVENTOS.EN_LAVADO}:${extra.canal ?? 'correo'}`,
    ...extra,
  });
  const AHORA = new Date('2026-11-21T21:26:30Z');

  function tenantCon(avisos) {
    const tenant = crearTenantFalso({
      notificaciones: [{ data: avisos, error: null }],
      ordenes: [{ data: { id: ORDEN, estado: 'recibido', vehiculos: { placa: 'ABC123' } }, error: null }],
      establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }],
    });
    tenant.crear.mockImplementation(async (tabla, valores) => ({ id: 'nueva', ...valores }));
    return tenant;
  }

  it('si el aviso aún no salió, lo cancela, no envía corrección y libera la clave', async () => {
    const tenant = tenantCon([aviso({ id: 'a1', estado: 'pendiente' })]);
    const resultado = await alRevertirEstado(tenant, ORDEN, 'en_lavado', { ahora: AHORA });

    expect(resultado).toEqual({ canceladas: 1, correcciones: 0 });
    const [tabla, id, cambios, , , donde] = tenant.actualizar.mock.calls[0];
    expect([tabla, id]).toEqual(['notificaciones', 'a1']);
    expect(cambios).toMatchObject({ estado: 'cancelada', proximo_intento_at: null });
    // Así, si la orden vuelve a "en lavado", el cliente recibe el aviso de nuevo.
    expect(cambios.clave_dedupe).toBe(`${ORDEN}:${EVENTOS.EN_LAVADO}:correo:revertida:${AHORA.getTime()}`);
    // Solo si sigue pendiente: si el worker ya la tomó, no se toca.
    expect(donde).toEqual({ estado: 'pendiente' });
    expect(tenant.crear).not.toHaveBeenCalled();
  });

  it('si el aviso ya salió, envía una corrección por el mismo canal y destino', async () => {
    const tenant = tenantCon([
      aviso({ id: 'a1', estado: 'enviada', canal: 'correo' }),
      aviso({ id: 'a2', estado: 'entregada', canal: 'sms', destino: 'cel-cifrado' }),
    ]);
    const resultado = await alRevertirEstado(tenant, ORDEN, 'en_lavado', { ahora: AHORA });

    expect(resultado).toEqual({ canceladas: 0, correcciones: 2 });
    const creadas = tenant.crear.mock.calls.map(([, valores]) => valores);
    expect(creadas).toHaveLength(2);
    for (const c of creadas) {
      expect(c).toMatchObject({ tipo: 'correccion', evento: EVENTOS.CORRECCION, orden_id: ORDEN, estado: 'pendiente' });
      expect(c.contenido.estadoRevertido).toBe('en_lavado');
    }
    const sms = creadas.find((c) => c.canal === 'sms');
    expect(sms.destino).toBe('cel-cifrado');
    expect(sms.contenido.texto).toContain('sigue en estado "Recibido"');
    expect(creadas.find((c) => c.canal === 'correo').contenido.texto).toBeUndefined();
  });

  it('sin avisos de ese estado no hace nada', async () => {
    const tenant = tenantCon([]);
    expect(await alRevertirEstado(tenant, ORDEN, 'en_lavado', { ahora: AHORA })).toEqual({ canceladas: 0, correcciones: 0 });
    expect(tenant.actualizar).not.toHaveBeenCalled();
    expect(tenant.crear).not.toHaveBeenCalled();
  });

  it('el correo de corrección dice qué se avisó por error y en qué estado sigue', () => {
    const correo = plantillaCorreccion({
      establecimiento: SEDE,
      cliente: { nombre: 'Laura' },
      orden: { estado: 'recibido', codigo_seguimiento: 'K7Q2M9XH4P' },
      vehiculo: { placa: 'ABC123' },
      contenido: { estadoRevertido: 'en_lavado' },
    });
    expect(correo.asunto).toBe('Corrección: tu vehículo ABC123 sigue en Recibido');
    expect(correo.texto).toContain('te avisamos por error que tu vehículo ABC123 pasó a En lavado');
    expect(textoCorreccion({ establecimiento: SEDE, placa: 'ABC123', estadoActual: 'Recibido' })).toContain('el aviso anterior fue un error');
  });
});
