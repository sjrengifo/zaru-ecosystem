// HU-27 — Detalle y condiciones de una promoción (RF-F5-10), sin Supabase.
// La base en memoria tiene la tabla promociones con todas (vigente, vencida, programada, desactivada y
// una de otra sede) y la vista promociones_vigentes solo con las vigentes, como la vista real de HU-12.
// La prueba comprueba que el detalle se lee de la vista, filtrado por la sede del slug, y que todo lo
// que no se puede mostrar responde el mismo 404 sin revelar el motivo.
import { describe, it, expect, beforeEach } from 'vitest';
import { obtenerPromocionVigente, promocionDetallePublica } from '../../src/shared/promocionesPublicas.js';

const SEDE_A = '11111111-1111-4111-8111-111111111111';
const SEDE_B = '22222222-2222-4222-8222-222222222222';
const VIGENTE_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const VENCIDA_A = 'aaaaaaaa-0000-4000-8000-000000000002';
const PROGRAMADA_A = 'aaaaaaaa-0000-4000-8000-000000000003';
const DESACTIVADA_A = 'aaaaaaaa-0000-4000-8000-000000000004';
const SIN_TEXTOS_A = 'aaaaaaaa-0000-4000-8000-000000000005';
const VIGENTE_B = 'bbbbbbbb-0000-4000-8000-000000000001';

const fila = (datos) => ({
  descripcion: null,
  condiciones: null,
  descuento_pct: '20',
  fecha_inicio: '2026-11-01',
  fecha_fin: '2026-11-30',
  activa: true,
  estado: 'vigente',
  created_at: '2026-11-01T12:00:00Z',
  servicios: [],
  ...datos,
});

function tablas() {
  const promociones = [
    fila({
      id: VIGENTE_A, establecimiento_id: SEDE_A, nombre: 'Martes de motor',
      descripcion: '20 % en el lavado de motor todos los martes.',
      condiciones: 'Válida solo los martes. No acumulable con otras promociones.',
      descuento_pct: '20.00', servicios: [{ id: 's1', nombre: 'Lavado de motor' }, { id: 's2', nombre: 'Lavado básico' }],
    }),
    fila({ id: VENCIDA_A, establecimiento_id: SEDE_A, nombre: 'Vencida', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', estado: 'vencida' }),
    fila({ id: PROGRAMADA_A, establecimiento_id: SEDE_A, nombre: 'Programada', fecha_inicio: '2026-12-01', fecha_fin: '2026-12-31', estado: 'programada' }),
    fila({ id: DESACTIVADA_A, establecimiento_id: SEDE_A, nombre: 'Desactivada', activa: false, estado: 'inactiva' }),
    fila({ id: SIN_TEXTOS_A, establecimiento_id: SEDE_A, nombre: 'Aspirado', descripcion: '   ', condiciones: '' }),
    fila({ id: VIGENTE_B, establecimiento_id: SEDE_B, nombre: 'Promo de la sede Sur', condiciones: 'Solo en Sur' }),
  ];
  return {
    establecimientos: [
      { id: SEDE_A, slug: 'lavadero-norte', nombre: 'Lavadero Norte', logo_url: 'https://x/norte.png', color_primario: '#B91C1C', color_secundario: '#F59E0B', estado: 'activo' },
      { id: SEDE_B, slug: 'lavadero-sur', nombre: 'Lavadero Sur', logo_url: null, color_primario: null, color_secundario: null, estado: 'activo' },
      { id: '33333333-3333-4333-8333-333333333333', slug: 'cerrado', nombre: 'Cerrado', estado: 'suspendido' },
    ],
    promociones,
    promociones_vigentes: promociones.filter((p) => p.estado === 'vigente'),
  };
}

/** Cliente de Supabase mínimo: select / eq / maybeSingle sobre arreglos. Registra cada consulta. */
function baseEnMemoria(datos) {
  const consultas = [];
  return {
    consultas,
    from(tabla) {
      const filtros = [];
      const ejecutar = () => ({ data: (datos[tabla] ?? []).filter((f) => filtros.every((cumple) => cumple(f))), error: null });
      const q = {
        select(columnas) { consultas.push({ tabla, columnas, filtros: [] }); return q; },
        eq(col, v) { consultas.at(-1).filtros.push([col, v]); filtros.push((f) => f[col] === v); return q; },
        order() { return q; },
        async maybeSingle() { return { data: ejecutar().data[0] ?? null, error: null }; },
        then(resolver, rechazar) { return Promise.resolve(ejecutar()).then(resolver, rechazar); },
      };
      return q;
    },
  };
}

const NO_ENCONTRADA = { codigo: 'NO_ENCONTRADO', message: 'Promoción no encontrada' };

let db;
beforeEach(() => {
  db = baseEnMemoria(tablas());
});

describe('HU-27 · detalle y condiciones de una promoción', () => {
  it('CA1: una promoción vigente de la sede trae descripción completa, condiciones, descuento, servicios y vigencia', async () => {
    const { promocion } = await obtenerPromocionVigente('lavadero-norte', VIGENTE_A, { db });
    expect(promocion).toEqual({
      id: VIGENTE_A,
      nombre: 'Martes de motor',
      descripcion: '20 % en el lavado de motor todos los martes.',
      condiciones: 'Válida solo los martes. No acumulable con otras promociones.',
      descuentoPct: 20,
      fechaInicio: '2026-11-01',
      fechaFin: '2026-11-30',
      servicios: ['Lavado de motor', 'Lavado básico'],
    });
  });

  it('CA1: devuelve la marca de la sede del slug (HU-22), sin su id', async () => {
    const { sede } = await obtenerPromocionVigente('lavadero-norte', VIGENTE_A, { db });
    expect(sede).toEqual({ slug: 'lavadero-norte', nombre: 'Lavadero Norte', logoUrl: 'https://x/norte.png', colorPrimario: '#B91C1C', colorSecundario: '#F59E0B' });
  });

  it('lee la vista promociones_vigentes filtrando por el id de la promoción y el de la sede del slug', async () => {
    await obtenerPromocionVigente('lavadero-norte', VIGENTE_A, { db });
    const consulta = db.consultas.find((c) => c.tabla === 'promociones_vigentes');
    expect(consulta.filtros).toEqual(expect.arrayContaining([['id', VIGENTE_A], ['establecimiento_id', SEDE_A]]));
    expect(db.consultas.some((c) => c.tabla === 'promociones')).toBe(false);
  });

  it('vencida, programada o desactivada → 404 "Promoción no encontrada"', async () => {
    for (const id of [VENCIDA_A, PROGRAMADA_A, DESACTIVADA_A]) {
      await expect(obtenerPromocionVigente('lavadero-norte', id, { db })).rejects.toMatchObject(NO_ENCONTRADA);
    }
  });

  it('una promoción vigente de otra sede → el mismo 404 (ESC-F5-07)', async () => {
    await expect(obtenerPromocionVigente('lavadero-norte', VIGENTE_B, { db })).rejects.toMatchObject(NO_ENCONTRADA);
    await expect(obtenerPromocionVigente('lavadero-sur', VIGENTE_A, { db })).rejects.toMatchObject(NO_ENCONTRADA);
  });

  it('id inválido o inexistente → el mismo 404, sin consultar la vista si no es un UUID', async () => {
    for (const id of ['abc', '1', "1' or '1'='1", '']) {
      await expect(obtenerPromocionVigente('lavadero-norte', id, { db })).rejects.toMatchObject(NO_ENCONTRADA);
    }
    expect(db.consultas.some((c) => c.tabla === 'promociones_vigentes')).toBe(false);
    await expect(obtenerPromocionVigente('lavadero-norte', 'ffffffff-0000-4000-8000-000000000000', { db })).rejects.toMatchObject(NO_ENCONTRADA);
  });

  it('sede inexistente o suspendida → 404, sin consultar promociones', async () => {
    for (const slug of ['no-existe', 'cerrado']) {
      await expect(obtenerPromocionVigente(slug, VIGENTE_A, { db })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    }
    expect(db.consultas.some((c) => c.tabla === 'promociones_vigentes')).toBe(false);
  });

  it('sin descripción ni condiciones (o solo espacios) salen null, para no dejar huecos en la pantalla', async () => {
    const { promocion } = await obtenerPromocionVigente('lavadero-norte', SIN_TEXTOS_A, { db });
    expect(promocion.descripcion).toBeNull();
    expect(promocion.condiciones).toBeNull();
  });

  it('no expone columnas internas', async () => {
    const respuesta = await obtenerPromocionVigente('lavadero-norte', VIGENTE_A, { db });
    const texto = JSON.stringify(respuesta);
    for (const interno of ['establecimiento_id', 'activa', 'estado', 'created_at', SEDE_A]) {
      expect(texto).not.toContain(interno);
    }
  });

  it('promocionDetallePublica convierte el descuento a número y tolera servicios nulos', () => {
    expect(promocionDetallePublica({ id: 'x', nombre: 'N', descuento_pct: '12.50', fecha_inicio: '2026-11-01', fecha_fin: '2026-12-01', servicios: null })).toEqual({
      id: 'x', nombre: 'N', descripcion: null, condiciones: null, descuentoPct: 12.5, fechaInicio: '2026-11-01', fechaFin: '2026-12-01', servicios: [],
    });
  });
});
