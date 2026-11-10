// HU-17 — Acceso del cliente final con la placa o el celular, sin contraseña.
// Reglas de búsqueda, privacidad, esquema y límite de intentos, sin Supabase (base en memoria).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buscarOrdenActiva,
  cargarSede,
  MENSAJE_SIN_SERVICIO,
  normalizarCelular,
  normalizarPlaca,
  normalizarSlug,
  sedePublica,
} from '../../src/shared/accesoCliente.js';
import { busquedaPublica } from '../../src/schemas/publico.schemas.js';

const SEDE_A = '11111111-1111-4111-8111-111111111111';
const SEDE_B = '22222222-2222-4222-8222-222222222222';

function tablas() {
  return {
    establecimientos: [
      { id: SEDE_A, slug: 'lavadero-norte', nombre: 'Lavadero Norte', logo_url: 'https://x/logo.png', color_primario: '#0F766E', color_secundario: 'rojo', estado: 'activo', plan: 'basico' },
      { id: SEDE_B, slug: 'lavadero-sur', nombre: 'Lavadero Sur', logo_url: null, color_primario: null, color_secundario: null, estado: 'activo', plan: 'basico' },
      { id: '33333333-3333-4333-8333-333333333333', slug: 'cerrado', nombre: 'Cerrado', estado: 'suspendido' },
    ],
    clientes: [
      { id: 'c1', establecimiento_id: SEDE_A, nombre: 'Ana Gómez', telefono: '3001234567', correo: 'cifrado' },
      { id: 'c2', establecimiento_id: SEDE_A, nombre: 'Luis Pérez', telefono: '3109876543', correo: null },
      { id: 'c3', establecimiento_id: SEDE_B, nombre: 'Otra Sede', telefono: '3001234567', correo: null },
    ],
    vehiculos: [
      { id: 'v1', establecimiento_id: SEDE_A, cliente_id: 'c1', placa: 'ABC123' },
      { id: 'v2', establecimiento_id: SEDE_A, cliente_id: 'c1', placa: 'XYZ98D' },
      { id: 'v3', establecimiento_id: SEDE_A, cliente_id: 'c2', placa: 'DEF456' },
      { id: 'v4', establecimiento_id: SEDE_B, cliente_id: 'c3', placa: 'GHI789' },
    ],
    ordenes: [
      { id: 'o1', establecimiento_id: SEDE_A, vehiculo_id: 'v1', estado: 'en_lavado', codigo_seguimiento: 'K7Q2M9XH4P', created_at: '2026-11-10T13:00:00Z' },
      { id: 'o2', establecimiento_id: SEDE_A, vehiculo_id: 'v2', estado: 'recibido', codigo_seguimiento: 'P4HX9M2Q7K', created_at: '2026-11-10T14:00:00Z' },
      { id: 'o3', establecimiento_id: SEDE_A, vehiculo_id: 'v3', estado: 'entregado', codigo_seguimiento: 'ENTREGADA1', created_at: '2026-11-10T09:00:00Z' },
      { id: 'o4', establecimiento_id: SEDE_B, vehiculo_id: 'v4', estado: 'listo', codigo_seguimiento: 'SEDEB00001', created_at: '2026-11-10T10:00:00Z' },
    ],
  };
}

/** Cliente de Supabase mínimo: select / eq / neq / in / order / maybeSingle sobre arreglos. */
function baseEnMemoria(datos) {
  const consultas = [];
  const db = {
    consultas,
    from(tabla) {
      const filtros = [];
      let columnas = '*';
      let orden = null;
      const ejecutar = () => {
        let filas = (datos[tabla] ?? []).filter((fila) => filtros.every((f) => f(fila)));
        if (orden) filas = [...filas].sort((a, b) => (a[orden.col] > b[orden.col] ? 1 : -1) * (orden.asc ? 1 : -1));
        filas = filas.map((fila) =>
          /vehiculo:vehiculos\(placa\)/.test(columnas)
            ? { ...fila, vehiculo: { placa: datos.vehiculos.find((v) => v.id === fila.vehiculo_id)?.placa } }
            : fila,
        );
        return { data: filas, error: null };
      };
      const q = {
        select(c) { columnas = c; consultas.push({ tabla, columnas: c }); return q; },
        eq(col, v) { filtros.push((f) => f[col] === v); return q; },
        neq(col, v) { filtros.push((f) => f[col] !== v); return q; },
        in(col, vs) { filtros.push((f) => vs.includes(f[col])); return q; },
        order(col, { ascending = true } = {}) { orden = { col, asc: ascending }; return q; },
        async maybeSingle() { const { data } = ejecutar(); return { data: data[0] ?? null, error: null }; },
        then(resolver, rechazar) { return Promise.resolve(ejecutar()).then(resolver, rechazar); },
      };
      return q;
    },
  };
  return db;
}

let db;
beforeEach(() => {
  db = baseEnMemoria(tablas());
});

describe('normalización de lo que escribe el cliente', () => {
  it('placa en mayúsculas sin espacios ni guiones', () => {
    expect(normalizarPlaca(' abc-123 ')).toBe('ABC123');
    expect(normalizarPlaca('xyz 98d')).toBe('XYZ98D');
    expect(normalizarPlaca('AB')).toBeNull();
    expect(normalizarPlaca('ABC 123 456')).toBeNull();
  });

  it('celular colombiano de 10 dígitos, con o sin +57', () => {
    expect(normalizarCelular('300 123 4567')).toBe('3001234567');
    expect(normalizarCelular('+57 300-123-4567')).toBe('3001234567');
    expect(normalizarCelular('6012345678')).toBeNull();
    expect(normalizarCelular('30012')).toBeNull();
  });

  it('slug en minúsculas con letras, números y guiones', () => {
    expect(normalizarSlug('Lavadero-Norte')).toBe('lavadero-norte');
    expect(normalizarSlug('../admin')).toBeNull();
    expect(normalizarSlug('')).toBeNull();
  });
});

describe('esquema de la búsqueda', () => {
  it('acepta placa o celular y los deja normalizados', () => {
    expect(busquedaPublica.parse({ placa: 'abc 123' })).toEqual({ placa: 'ABC123' });
    expect(busquedaPublica.parse({ celular: '+57 300 123 4567' })).toEqual({ celular: '3001234567' });
  });

  it('exige exactamente uno de los dos', () => {
    expect(busquedaPublica.safeParse({}).success).toBe(false);
    expect(busquedaPublica.safeParse({ placa: 'ABC123', celular: '3001234567' }).success).toBe(false);
  });

  it('explica el formato cuando la placa o el celular no son válidos', () => {
    const placa = busquedaPublica.safeParse({ placa: '##' });
    expect(placa.error.issues[0]).toMatchObject({ path: ['placa'] });
    const celular = busquedaPublica.safeParse({ celular: '123' });
    expect(celular.error.issues[0]).toMatchObject({ path: ['celular'] });
  });
});

describe('sede del enlace (CA2, CA3)', () => {
  it('devuelve nombre y marca, con colores inválidos como null', async () => {
    const sede = sedePublica(await cargarSede('lavadero-norte', { db }));
    expect(sede).toEqual({ slug: 'lavadero-norte', nombre: 'Lavadero Norte', logoUrl: 'https://x/logo.png', colorPrimario: '#0F766E', colorSecundario: null });
    expect(sede).not.toHaveProperty('id');
    expect(sede).not.toHaveProperty('plan');
  });

  it('una sede inexistente o suspendida responde igual', async () => {
    await expect(cargarSede('no-existe', { db })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO', message: 'Sede no encontrado' });
    await expect(cargarSede('cerrado', { db })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO', message: 'Sede no encontrado' });
  });
});

describe('búsqueda de la orden activa', () => {
  it('CA1: con la placa devuelve el código de seguimiento de su orden activa', async () => {
    const r = await buscarOrdenActiva('lavadero-norte', { placa: 'ABC123' }, { db });
    expect(r.resultados).toEqual([{ codigo: 'K7Q2M9XH4P', placa: 'ABC123' }]);
    expect(r.sede.nombre).toBe('Lavadero Norte');
  });

  it('CA1: con el celular devuelve una orden por cada vehículo en servicio, la más reciente primero', async () => {
    const r = await buscarOrdenActiva('lavadero-norte', { celular: '3001234567' }, { db });
    expect(r.resultados).toEqual([
      { codigo: 'P4HX9M2Q7K', placa: 'XYZ98D' },
      { codigo: 'K7Q2M9XH4P', placa: 'ABC123' },
    ]);
  });

  it('CA4: una placa no registrada y una placa ya entregada responden el mismo mensaje', async () => {
    for (const placa of ['ZZZ999', 'DEF456']) {
      await expect(buscarOrdenActiva('lavadero-norte', { placa }, { db })).rejects.toMatchObject({
        codigo: 'NO_ENCONTRADO',
        status: 404,
        message: MENSAJE_SIN_SERVICIO,
      });
    }
  });

  it('CA4: un celular sin vehículos en servicio responde el mismo mensaje', async () => {
    await expect(buscarOrdenActiva('lavadero-norte', { celular: '3109876543' }, { db })).rejects.toMatchObject({ message: MENSAJE_SIN_SERVICIO });
    await expect(buscarOrdenActiva('lavadero-norte', { celular: '3000000000' }, { db })).rejects.toMatchObject({ message: MENSAJE_SIN_SERVICIO });
  });

  it('HU-41: no encuentra vehículos ni celulares de otra sede', async () => {
    await expect(buscarOrdenActiva('lavadero-norte', { placa: 'GHI789' }, { db })).rejects.toMatchObject({ message: MENSAJE_SIN_SERVICIO });
    const sur = await buscarOrdenActiva('lavadero-sur', { celular: '3001234567' }, { db });
    expect(sur.resultados).toEqual([{ codigo: 'SEDEB00001', placa: 'GHI789' }]);
  });

  it('RNF-F5-04: la respuesta no trae nombre, celular ni correo del cliente, y no consulta esas columnas', async () => {
    const r = await buscarOrdenActiva('lavadero-norte', { celular: '3001234567' }, { db });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/Ana|3001234567|correo|cifrado|establecimiento_id|"id"/);
    const columnasClientes = db.consultas.filter((c) => c.tabla === 'clientes').map((c) => c.columnas);
    expect(columnasClientes).toEqual(['id']);
  });
});

describe('controlador y límite de intentos (RNF-F5-01)', () => {
  it('tras 5 búsquedas sin resultado desde el mismo origen responde 429', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('../../src/shared/accesoCliente.js', async () => {
      const real = await vi.importActual('../../src/shared/accesoCliente.js');
      return { ...real, buscarOrdenActiva: (slug, busqueda) => real.buscarOrdenActiva(slug, busqueda, { db }) };
    });
    const { buscar, limiteBusquedas } = await import('../../src/controllers/publico.controller.js');
    limiteBusquedas.reiniciar();

    const llamar = async (body, ip = '10.0.0.1') => {
      const res = { set: vi.fn(), json: vi.fn() };
      const next = vi.fn();
      await buscar({ ip, params: { slug: 'lavadero-norte' }, body }, res, next);
      return { res, error: next.mock.calls[0]?.[0] };
    };

    for (let i = 0; i < 5; i += 1) {
      expect((await llamar({ placa: 'ZZZ999' })).error).toMatchObject({ status: 404 });
    }
    const bloqueado = await llamar({ placa: 'ABC123' });
    expect(bloqueado.error).toMatchObject({ status: 429, codigo: 'LIMITE_EXCEDIDO' });

    // Otro origen no queda bloqueado, y una búsqueda válida responde sin caché.
    const otro = await llamar({ placa: 'ABC123' }, '10.0.0.2');
    expect(otro.error).toBeUndefined();
    expect(otro.res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(otro.res.json.mock.calls[0][0].resultados[0].codigo).toBe('K7Q2M9XH4P');
    vi.doUnmock('../../src/shared/accesoCliente.js');
  });
});
