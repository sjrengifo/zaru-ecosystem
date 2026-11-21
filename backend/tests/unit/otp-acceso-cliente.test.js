// RF-F5-11 / RF-F5-12 · ESC-F5-08 — Acceso del cliente final con un código de un solo uso por SMS.
// Base falsa en memoria: el módulo usa el acceso del tenant real sobre ella.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');

const {
  solicitarCodigoAcceso,
  verificarCodigoAcceso,
  limiteSolicitudes,
  hashCodigo,
  MAX_INTENTOS_OTP,
} = await import('../../src/shared/otpCliente.js');
const { verificarPase, DURACION_PASE_MS } = await import('../../src/shared/paseCliente.js');
const { solicitudOtp, verificacionOtp } = await import('../../src/schemas/cliente.schemas.js');
const { cifrar } = await import('../../src/shared/cifrado.js');

const SEDE = { id: 'eeeeeeee-0000-4000-8000-000000000001', slug: 'car-wash-demo', nombre: 'Lavadero Norte', estado: 'activo' };
const OTRA_SEDE = { id: 'eeeeeeee-0000-4000-8000-000000000009', slug: 'otra-sede', nombre: 'Otra', estado: 'activo' };
const CLIENTE = { id: '22222222-0000-4000-8000-000000000002', establecimiento_id: SEDE.id, nombre: 'Yeliani', telefono: '3001234567' };
const AHORA = new Date('2026-11-21T15:00:00Z');

/** Base en memoria con lo que usan cargarSede y el acceso del tenant (eq, gte, order, limit, insert, update). */
function crearDbFalsa(tablas) {
  let secuencia = 0;
  const datos = Object.fromEntries(Object.entries(tablas).map(([t, filas]) => [t, filas.map((f) => ({ ...f }))]));

  function consulta(tabla) {
    const filtros = [];
    let accion = { tipo: 'select' };
    let orden = null;
    let limite = null;
    let opciones = {};

    const filas = () => {
      let lista = (datos[tabla] ??= []).filter((f) => filtros.every((cumple) => cumple(f)));
      if (orden) lista = [...lista].sort((a, b) => (a[orden.campo] < b[orden.campo] ? -1 : 1) * (orden.asc ? 1 : -1));
      return limite == null ? lista : lista.slice(0, limite);
    };

    const ejecutar = () => {
      if (accion.tipo === 'insert') {
        const nuevas = accion.valores.map((v) => ({
          id: randomUUID(),
          intentos: 0,
          usado_at: null,
          created_at: new Date(AHORA.getTime() + ++secuencia).toISOString(),
          ...v,
        }));
        datos[tabla].push(...nuevas);
        return { data: nuevas, error: null };
      }
      if (accion.tipo === 'update') {
        const lista = filas();
        for (const f of lista) Object.assign(f, accion.valores);
        return { data: lista, error: null };
      }
      if (opciones.head) return { data: null, count: filas().length, error: null };
      return { data: filas(), error: null };
    };

    const q = {
      select(_, op = {}) { opciones = op; return q; },
      insert(valores) { accion = { tipo: 'insert', valores }; return q; },
      update(valores) { accion = { tipo: 'update', valores }; return q; },
      eq(campo, valor) { filtros.push((f) => f[campo] === valor); return q; },
      gte(campo, valor) { filtros.push((f) => f[campo] >= valor); return q; },
      order(campo, { ascending = true } = {}) { orden = { campo, asc: ascending }; return q; },
      limit(n) { limite = n; return q; },
      maybeSingle() {
        const r = ejecutar();
        return Promise.resolve({ data: (Array.isArray(r.data) ? r.data[0] : r.data) ?? null, error: null });
      },
      then(resolver, rechazar) { return Promise.resolve(ejecutar()).then(resolver, rechazar); },
    };
    return q;
  }

  return { datos, from: (tabla) => consulta(tabla) };
}

const nuevaDb = () => crearDbFalsa({ establecimientos: [SEDE, OTRA_SEDE], clientes: [CLIENTE], otp_codigos: [] });
const proveedorFalso = () => ({ enviar: vi.fn(async () => ({ idProveedor: 'sms-1' })) });

/** Pide un código con un generador fijo y devuelve el código enviado. */
async function pedir(db, { codigo = '123456', celular = CLIENTE.telefono, ahora = AHORA, proveedor = proveedorFalso() } = {}) {
  const respuesta = await solicitarCodigoAcceso(SEDE.slug, { celular }, { db, ahora, proveedor, generar: () => codigo });
  return { respuesta, proveedor };
}

beforeEach(() => limiteSolicitudes.reiniciar());

describe('RF-F5-11 · solicitar el código', () => {
  it('envía por SMS un código de 6 dígitos al celular registrado y guarda solo su hash', async () => {
    const db = nuevaDb();
    const { respuesta, proveedor } = await pedir(db);

    expect(respuesta).toEqual({ enviado: true, celular: expect.stringContaining('***'), expiraEn: '2026-11-21T15:05:00.000Z' });
    expect(proveedor.enviar).toHaveBeenCalledWith({ para: '3001234567', texto: expect.stringContaining('123456') });
    const [fila] = db.datos.otp_codigos;
    expect(fila).toMatchObject({ cliente_id: CLIENTE.id, establecimiento_id: SEDE.id, codigo_hash: hashCodigo(CLIENTE.id, '123456') });
    expect(JSON.stringify(fila)).not.toContain('123456');
    expect(JSON.stringify(fila)).not.toContain('3001234567');
  });

  it('responde lo mismo con un celular que no es cliente de la sede, sin enviar nada', async () => {
    const db = nuevaDb();
    const registrado = await pedir(db);
    const desconocido = await pedir(db, { celular: '3109998877' });

    expect(Object.keys(desconocido.respuesta)).toEqual(Object.keys(registrado.respuesta));
    expect(desconocido.respuesta.enviado).toBe(true);
    expect(desconocido.proveedor.enviar).not.toHaveBeenCalled();
    expect(db.datos.otp_codigos).toHaveLength(1);
  });

  it('RNF-F5-02: permite 3 solicitudes por celular cada 15 minutos y la cuarta responde 429', async () => {
    const db = nuevaDb();
    for (let i = 0; i < 3; i += 1) await pedir(db);
    await expect(pedir(db)).rejects.toMatchObject({ codigo: 'LIMITE_EXCEDIDO', status: 429 });
    // El límite también aplica a celulares que no existen: no revela quién es cliente.
    for (let i = 0; i < 3; i += 1) await pedir(db, { celular: '3109998877' });
    await expect(pedir(db, { celular: '3109998877' })).rejects.toMatchObject({ codigo: 'LIMITE_EXCEDIDO' });
  });

  describe('también por correo (sin pagar SMS)', () => {
    const conCorreo = () =>
      crearDbFalsa({ establecimientos: [SEDE], clientes: [{ ...CLIENTE, correo: cifrar('yeli@correo.com') }], otp_codigos: [] });
    const correoFalso = () => ({ enviar: vi.fn(async () => ({ idProveedor: 'correo-1' })) });
    const pedirConCorreo = (db, extra = {}) =>
      solicitarCodigoAcceso(SEDE.slug, { celular: CLIENTE.telefono }, {
        db, ahora: AHORA, generar: () => '123456', proveedor: proveedorFalso(), ...extra,
      });

    it('si el cliente tiene correo, el código sale por SMS y por correo, con la marca de la sede', async () => {
      const email = correoFalso();
      const sms = proveedorFalso();
      await pedirConCorreo(conCorreo(), { proveedor: sms, proveedorEmail: email });

      expect(sms.enviar).toHaveBeenCalledTimes(1);
      expect(email.enviar).toHaveBeenCalledWith(expect.objectContaining({
        para: 'yeli@correo.com',
        asunto: '123456 es tu código para entrar a Lavadero Norte',
        html: expect.stringContaining('123456'),
        texto: expect.stringContaining('Vence en 5 minutos'),
      }));
    });

    it('sin correo registrado no intenta enviar correo', async () => {
      const email = correoFalso();
      await pedirConCorreo(nuevaDb(), { proveedorEmail: email });
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('si el SMS falla pero el correo llega, el código sigue vigente y sirve para entrar', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const db = conCorreo();
      const sms = { enviar: vi.fn(async () => { throw new Error('Twilio trial'); }) };
      await expect(pedirConCorreo(db, { proveedor: sms, proveedorEmail: correoFalso() })).resolves.toHaveProperty('enviado', true);

      expect(db.datos.otp_codigos[0].usado_at).toBeNull();
      await expect(verificarCodigoAcceso(SEDE.slug, { celular: CLIENTE.telefono, codigo: '123456' }, { db, ahora: AHORA }))
        .resolves.toHaveProperty('pase');
    });

    it('si fallan el SMS y el correo, el código queda invalidado', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const db = conCorreo();
      const falla = () => ({ enviar: vi.fn(async () => { throw new Error('caído'); }) });
      await expect(pedirConCorreo(db, { proveedor: falla(), proveedorEmail: falla() })).rejects.toMatchObject({ codigo: 'ERROR_INTERNO' });
      expect(db.datos.otp_codigos[0].usado_at).not.toBeNull();
    });
  });

  it('si el SMS no sale, el código queda invalidado', async () => {
    const db = nuevaDb();
    const proveedor = { enviar: vi.fn(async () => { throw new Error('Twilio caído'); }) };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(pedir(db, { proveedor })).rejects.toMatchObject({ codigo: 'ERROR_INTERNO' });
    expect(db.datos.otp_codigos[0].usado_at).not.toBeNull();
    await expect(verificarCodigoAcceso(SEDE.slug, { celular: CLIENTE.telefono, codigo: '123456' }, { db, ahora: AHORA }))
      .rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });
});

describe('RF-F5-12 · verificar el código', () => {
  const verificar = (db, codigo, extra = {}) =>
    verificarCodigoAcceso(SEDE.slug, { celular: CLIENTE.telefono, codigo, ...extra }, { db, ahora: extra.ahora ?? AHORA });

  it('con el código correcto entrega un pase de 30 días de ese cliente en esa sede', async () => {
    const db = nuevaDb();
    await pedir(db);
    const datos = await verificar(db, '123456');

    expect(datos).toMatchObject({ sede: { slug: SEDE.slug, nombre: SEDE.nombre }, cliente: { nombre: 'Yeliani' } });
    expect(new Date(datos.expiraEn).getTime()).toBe(Math.floor((AHORA.getTime() + DURACION_PASE_MS) / 1000) * 1000);
    expect(verificarPase(datos.pase, { ahora: AHORA.getTime() })).toMatchObject({ establecimientoId: SEDE.id, clienteId: CLIENTE.id });
  });

  it('el código es de un solo uso', async () => {
    const db = nuevaDb();
    await pedir(db);
    await verificar(db, '123456');
    await expect(verificar(db, '123456')).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO', status: 401 });
  });

  it('vence a los 5 minutos', async () => {
    const db = nuevaDb();
    await pedir(db);
    await expect(verificar(db, '123456', { ahora: new Date(AHORA.getTime() + 5 * 60_000 + 1) }))
      .rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });

  it('ESC-F5-08: con 5 códigos incorrectos el código queda invalidado, aunque luego llegue el correcto', async () => {
    const db = nuevaDb();
    await pedir(db);
    for (let i = 0; i < MAX_INTENTOS_OTP; i += 1) {
      await expect(verificar(db, '000000')).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    }
    expect(db.datos.otp_codigos[0]).toMatchObject({ intentos: MAX_INTENTOS_OTP, usado_at: expect.any(String) });
    await expect(verificar(db, '123456')).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });

  it('solo vale el último código pedido', async () => {
    const db = nuevaDb();
    await pedir(db, { codigo: '111111' });
    await pedir(db, { codigo: '222222' });
    await expect(verificar(db, '111111')).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    await expect(verificar(db, '222222')).resolves.toHaveProperty('pase');
  });

  it('un celular que no es cliente y un código ajeno responden el mismo 401', async () => {
    const db = nuevaDb();
    await pedir(db);
    const desconocido = await verificar(db, '123456', { celular: '3109998877' }).catch((e) => e);
    const equivocado = await verificar(db, '654321').catch((e) => e);
    expect(desconocido).toMatchObject({ codigo: 'NO_AUTENTICADO', status: 401 });
    expect(desconocido.message).toBe(equivocado.message);
  });

  it('el código de una sede no sirve en otra', async () => {
    const db = nuevaDb();
    await pedir(db);
    await expect(verificarCodigoAcceso(OTRA_SEDE.slug, { celular: CLIENTE.telefono, codigo: '123456' }, { db, ahora: AHORA }))
      .rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });
});

describe('validación de entrada del acceso', () => {
  it('normaliza el celular y exige un código de 6 dígitos', () => {
    expect(solicitudOtp.parse({ celular: '+57 300 123 4567' })).toEqual({ celular: '3001234567' });
    expect(verificacionOtp.parse({ celular: '300-123-4567', codigo: ' 123456 ' })).toEqual({ celular: '3001234567', codigo: '123456' });
    expect(solicitudOtp.safeParse({ celular: '12345' }).success).toBe(false);
    expect(verificacionOtp.safeParse({ celular: '3001234567', codigo: '12345' }).success).toBe(false);
    expect(verificacionOtp.safeParse({ celular: '3001234567', codigo: 'abcdef' }).success).toBe(false);
  });
});
