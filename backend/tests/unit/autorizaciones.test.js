// HU-30 — Autorización y revocación del tratamiento de datos para notificaciones (Ley 1581 de 2012).
// Reglas de autorización vigente, exclusión de campañas, enlace firmado y página pública, sin Supabase.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');

vi.mock('../../src/shared/politicas.js', () => ({
  obtenerPoliticaVigente: async () => ({ version: '1.1' }),
}));

const {
  autorizacionesDe,
  crearTokenBaja,
  destinatariosComerciales,
  enlaceBaja,
  leerTokenBaja,
  puedeRecibir,
  registrarAutorizacion,
  TIPOS,
} = await import('../../src/shared/autorizaciones.js');
const { busquedaPublica } = await import('../../src/schemas/publico.schemas.js');
const { clienteNuevo, cambioAutorizacion } = await import('../../src/schemas/clientes.schemas.js');
const { plantillaListo, plantillaIngreso } = await import('../../src/shared/plantillasCorreo.js');

const SEDE = '11111111-1111-4111-8111-111111111111';
const OTRA = '22222222-2222-4222-8222-222222222222';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LUIS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOFIA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/**
 * Acceso de tenant en memoria: `consentimientos` es la tabla de solo inserción y
 * `autorizaciones_vigentes` se calcula como la vista (la fila más reciente por cliente y tipo).
 */
function tenantEnMemoria(filas = [], establecimientoId = SEDE) {
  let siguiente = filas.length + 1;
  const consentimientos = filas.map((f, i) => ({ id: i + 1, establecimiento_id: SEDE, ...f }));
  const vigentes = () => {
    const ultima = new Map();
    for (const f of [...consentimientos].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)) {
      ultima.set(`${f.cliente_id}:${f.tipo}`, f);
    }
    return [...ultima.values()];
  };
  const consulta = (filasBase) => {
    const filtros = [];
    const q = {
      eq(col, v) { filtros.push((f) => f[col] === v); return q; },
      in(col, vs) { filtros.push((f) => vs.includes(f[col])); return q; },
      then(ok, mal) { return Promise.resolve({ data: filasBase().filter((f) => filtros.every((x) => x(f))), error: null }).then(ok, mal); },
    };
    return q;
  };
  return {
    establecimientoId,
    consentimientos,
    listar: vi.fn((tabla) => {
      const base = tabla === 'autorizaciones_vigentes' ? vigentes : () => consentimientos;
      return consulta(() => base().filter((f) => f.establecimiento_id === establecimientoId));
    }),
    crear: vi.fn(async (tabla, valores) => {
      const fila = { id: siguiente, establecimiento_id: establecimientoId, created_at: new Date(Date.UTC(2026, 10, 10, 12, 0, siguiente)).toISOString(), ...valores };
      siguiente += 1;
      consentimientos.push(fila);
      return { id: fila.id };
    }),
  };
}

const fila = (cliente_id, tipo, otorgado, created_at, canal = 'panel') => ({ cliente_id, tipo, otorgado, created_at, canal, politica_version: '1.1' });

let tenant;
beforeEach(() => {
  tenant = tenantEnMemoria([
    fila(ANA, 'tratamiento_datos', true, '2026-11-01T10:00:00Z'),
    fila(ANA, 'notificaciones_servicio', true, '2026-11-01T10:00:00Z'),
    fila(ANA, 'comerciales', true, '2026-11-01T10:00:00Z'),
    fila(LUIS, 'notificaciones_servicio', true, '2026-11-01T10:00:00Z'),
    fila(LUIS, 'comerciales', false, '2026-11-01T10:00:00Z'),
    fila(SOFIA, 'comerciales', true, '2026-11-01T10:00:00Z'),
    fila(SOFIA, 'comerciales', false, '2026-11-05T09:00:00Z', 'enlace_baja'),
  ]);
});

describe('CA1: dos casillas separadas, desmarcadas por defecto', () => {
  const base = { nombre: 'Ana', telefono: '3001234567', correo: 'ana@correo.com', autorizacionDatos: true, politicaVersion: '1.1' };

  it('si no se marcan, el registro guarda que no autorizó ninguna', () => {
    expect(clienteNuevo.parse(base)).toMatchObject({ autorizaNotificaciones: false, autorizaComerciales: false });
  });

  it('cada casilla es independiente de la otra', () => {
    expect(clienteNuevo.parse({ ...base, autorizaNotificaciones: true })).toMatchObject({ autorizaNotificaciones: true, autorizaComerciales: false });
    expect(clienteNuevo.parse({ ...base, autorizaComerciales: true })).toMatchObject({ autorizaNotificaciones: false, autorizaComerciales: true });
  });

  it('la autorización del tratamiento de datos sigue siendo obligatoria (HU-51)', () => {
    expect(clienteNuevo.safeParse({ ...base, autorizacionDatos: false, autorizaNotificaciones: true }).success).toBe(false);
  });

  it('el cambio desde el panel exige un tipo válido y sí/no', () => {
    expect(cambioAutorizacion.parse({ tipo: 'comerciales', otorgado: false })).toEqual({ tipo: 'comerciales', otorgado: false });
    expect(cambioAutorizacion.safeParse({ tipo: 'tratamiento_datos', otorgado: false }).success).toBe(false);
    expect(cambioAutorizacion.safeParse({ tipo: 'comerciales' }).success).toBe(false);
  });
});

describe('autorización vigente', () => {
  it('es la más reciente de cada tipo, con su fecha, canal y versión (CA4)', async () => {
    const sofia = await autorizacionesDe(tenant, SOFIA);
    expect(sofia.comerciales).toEqual({ otorgado: false, fecha: '2026-11-05T09:00:00Z', canal: 'enlace_baja', politicaVersion: '1.1' });
  });

  it('sin registro, las promociones nunca se suponen autorizadas', async () => {
    const nadie = await autorizacionesDe(tenant, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    expect(nadie.comerciales.otorgado).toBe(false);
    expect(nadie.comerciales.fecha).toBeNull();
  });

  it('puedeRecibir distingue los avisos del servicio de las promociones', async () => {
    expect(await puedeRecibir(tenant, LUIS, TIPOS.servicio)).toBe(true);
    expect(await puedeRecibir(tenant, LUIS, TIPOS.comerciales)).toBe(false);
  });
});

describe('CA2: las campañas de promociones excluyen a quien no autorizó', () => {
  it('solo quedan los clientes con autorización comercial vigente', async () => {
    expect(await destinatariosComerciales(tenant, [ANA, LUIS, SOFIA])).toEqual([ANA]);
  });

  it('sin registro, el cliente queda fuera', async () => {
    expect(await destinatariosComerciales(tenant, ['dddddddd-dddd-4ddd-8ddd-dddddddddddd', ANA])).toEqual([ANA]);
  });

  it('no mezcla clientes de otro establecimiento (HU-41)', async () => {
    const otra = tenantEnMemoria([], OTRA);
    expect(await destinatariosComerciales(otra, [ANA])).toEqual([]);
  });

  it('una lista vacía no consulta la base', async () => {
    expect(await destinatariosComerciales(tenant, [])).toEqual([]);
    expect(tenant.listar).not.toHaveBeenCalled();
  });
});

describe('CA3 y CA4: registrar un otorgamiento o una revocación', () => {
  it('agrega una fila nueva con canal, versión vigente, IP y quién lo registró', async () => {
    const r = await registrarAutorizacion(tenant, { clienteId: ANA, tipo: TIPOS.comerciales, otorgado: false, canal: 'panel', ip: '10.0.0.1', usuarioId: 'u1' });
    expect(r.cambio).toBe(true);
    expect(r.autorizaciones.comerciales.otorgado).toBe(false);
    expect(tenant.crear).toHaveBeenCalledWith('consentimientos', {
      cliente_id: ANA, tipo: 'comerciales', otorgado: false, canal: 'panel', politica_version: '1.1', ip: '10.0.0.1', registrado_por: 'u1',
    }, 'id');
  });

  it('no borra ni cambia la evidencia anterior: el historial crece', async () => {
    const antes = tenant.consentimientos.length;
    await registrarAutorizacion(tenant, { clienteId: LUIS, tipo: TIPOS.comerciales, otorgado: true, canal: 'panel' });
    await registrarAutorizacion(tenant, { clienteId: LUIS, tipo: TIPOS.comerciales, otorgado: false, canal: 'enlace_baja' });
    expect(tenant.consentimientos).toHaveLength(antes + 2);
    expect(tenant.consentimientos.slice(0, antes).map((f) => f.otorgado)).toEqual([true, true, true, true, false, true, false]);
  });

  it('si ya estaba así, no agrega una fila repetida', async () => {
    const r = await registrarAutorizacion(tenant, { clienteId: SOFIA, tipo: TIPOS.comerciales, otorgado: false, canal: 'enlace_baja' });
    expect(r.cambio).toBe(false);
    expect(tenant.crear).not.toHaveBeenCalled();
  });

  it('rechaza tipos que no son de notificaciones', async () => {
    await expect(registrarAutorizacion(tenant, { clienteId: ANA, tipo: 'tratamiento_datos', otorgado: false, canal: 'panel' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
  });
});

describe('CA3: enlace "dejar de recibir" firmado', () => {
  const datos = { establecimientoId: SEDE, clienteId: ANA, tipo: TIPOS.comerciales };

  it('el token identifica sede, cliente y tipo, sin datos personales', () => {
    const token = crearTokenBaja(datos);
    expect(leerTokenBaja(token)).toEqual(datos);
    expect(Buffer.from(token.split('.')[0], 'base64url').toString()).not.toMatch(/@|300|Ana/);
  });

  it('un token alterado o inventado no sirve', () => {
    const token = crearTokenBaja(datos);
    const [carga, firma] = token.split('.');
    const otroCliente = Buffer.from(JSON.stringify({ v: 1, e: SEDE, c: LUIS, t: 'comerciales' })).toString('base64url');
    expect(leerTokenBaja(`${otroCliente}.${firma}`)).toBeNull();
    expect(leerTokenBaja(`${carga}.${firma.slice(0, -1)}x`)).toBeNull();
    expect(leerTokenBaja('abc')).toBeNull();
    expect(leerTokenBaja(`${carga}.${firma}.extra`)).toBeNull();
  });

  it('el enlace apunta a la página pública del panel', () => {
    expect(enlaceBaja(datos, 'https://zaru-panel.vercel.app/')).toMatch(/^https:\/\/zaru-panel\.vercel\.app\/baja\/[\w-]+\.[\w-]+$/);
  });

  it('los correos de avisos lo incluyen en HTML y en texto, y sin enlace no muestran nada', () => {
    const enlace = 'https://zaru-panel.vercel.app/baja/abc.def';
    const datosCorreo = { establecimiento: { nombre: 'Lavadero' }, cliente: { nombre: 'Ana' }, orden: { total: 1000 }, vehiculo: { placa: 'ABC123' } };
    const listo = plantillaListo({ ...datosCorreo, enlaceBaja: enlace });
    expect(listo.html).toContain(`href="${enlace}"`);
    expect(listo.html).toContain('Dejar de recibir estos avisos');
    expect(listo.texto).toContain(enlace);
    expect(plantillaIngreso({ ...datosCorreo, enlaceBaja: enlace }).texto).toContain(enlace);
    expect(plantillaListo(datosCorreo).html).not.toContain('Dejar de recibir');
  });
});

describe('página pública de baja', () => {
  async function cargarModulo(tenantFalso, clientes = [ANA]) {
    vi.resetModules();
    vi.doMock('../../src/shared/tenant.js', () => ({
      crearAccesoTenant: (_db, { establecimientoId }) => ({
        ...tenantFalso,
        listar: (tabla, columnas) => {
          if (tabla === 'clientes') {
            let id;
            const q = { eq(_c, v) { id = v; return q; }, maybeSingle: async () => ({ data: clientes.includes(id) && establecimientoId === SEDE ? { id } : null, error: null }) };
            return q;
          }
          if (tabla === 'establecimientos') return { maybeSingle: async () => ({ data: { nombre: 'Lavadero Norte', color_primario: '#0F766E', color_secundario: 'mal' } }) };
          return tenantFalso.listar(tabla, columnas);
        },
      }),
    }));
    vi.doMock('../../src/config/supabase.js', () => ({ supabase: {} }));
    return import('../../src/shared/bajaPublica.js');
  }

  it('muestra qué se va a revocar con la marca de la sede, sin datos personales', async () => {
    const { consultarBaja } = await cargarModulo(tenant);
    const r = await consultarBaja(crearTokenBaja({ establecimientoId: SEDE, clienteId: ANA, tipo: TIPOS.comerciales }));
    expect(r).toEqual({ tipo: 'comerciales', nombreTipo: 'Promociones y ofertas', autorizado: true, sede: { nombre: 'Lavadero Norte', logoUrl: null, colorPrimario: '#0F766E', colorSecundario: null } });
  });

  it('CA3: confirmar revoca de inmediato y responde con la hora registrada', async () => {
    const { confirmarBaja } = await cargarModulo(tenant);
    const r = await confirmarBaja(crearTokenBaja({ establecimientoId: SEDE, clienteId: ANA, tipo: TIPOS.comerciales }), { ip: '10.1.1.1' });
    expect(r).toMatchObject({ tipo: 'comerciales', autorizado: false, revocadaAt: expect.any(String) });
    expect(tenant.consentimientos.at(-1)).toMatchObject({ cliente_id: ANA, tipo: 'comerciales', otorgado: false, canal: 'enlace_baja', politica_version: '1.1', ip: '10.1.1.1' });
  });

  it('un enlace alterado o de un cliente eliminado responde 404', async () => {
    const { consultarBaja } = await cargarModulo(tenant, []);
    await expect(consultarBaja('nada.valido')).rejects.toMatchObject({ status: 404 });
    await expect(consultarBaja(crearTokenBaja({ establecimientoId: SEDE, clienteId: ANA, tipo: TIPOS.servicio }))).rejects.toMatchObject({ status: 404 });
  });

  it('el esquema de búsqueda pública de HU-17 no cambia', () => {
    expect(busquedaPublica.parse({ placa: 'abc123' })).toEqual({ placa: 'ABC123' });
  });
});
