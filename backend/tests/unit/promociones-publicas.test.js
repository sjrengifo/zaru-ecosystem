// HU-26 — Explorador de promociones activas de la sede (RF-F5-09 · ESC-F5-07), sin Supabase.
// La base en memoria simula la vista promociones_vigentes: ya trae solo las vigentes de todas las sedes,
// así que la prueba comprueba que se filtra por la sede del slug y que no se filtran columnas internas.
import { describe, it, expect, beforeEach } from 'vitest';
import { listarPromocionesVigentes, promocionPublica } from '../../src/shared/promocionesPublicas.js';

const SEDE_A = '11111111-1111-4111-8111-111111111111';
const SEDE_B = '22222222-2222-4222-8222-222222222222';

const fila = (datos) => ({
  descripcion: null,
  condiciones: 'Solo los martes',
  fecha_inicio: '2026-11-01',
  activa: true,
  estado: 'vigente',
  created_at: '2026-11-01T12:00:00Z',
  servicios: [],
  ...datos,
});

function tablas() {
  return {
    establecimientos: [
      { id: SEDE_A, slug: 'lavadero-norte', nombre: 'Lavadero Norte', logo_url: 'https://x/norte.png', color_primario: '#B91C1C', color_secundario: '#F59E0B', estado: 'activo' },
      { id: SEDE_B, slug: 'lavadero-sur', nombre: 'Lavadero Sur', logo_url: null, color_primario: null, color_secundario: 'azul', estado: 'activo' },
      { id: '33333333-3333-4333-8333-333333333333', slug: 'cerrado', nombre: 'Cerrado', estado: 'suspendido' },
    ],
    promociones_vigentes: [
      fila({ id: 'p1', establecimiento_id: SEDE_A, nombre: 'Martes de motor', descripcion: '20 % en motor', descuento_pct: '20.00', fecha_fin: '2026-11-30', servicios: [{ id: 's1', nombre: 'Lavado de motor' }] }),
      fila({ id: 'p2', establecimiento_id: SEDE_A, nombre: 'Black Friday', descuento_pct: '35', fecha_fin: '2026-11-28', servicios: [{ id: 's1', nombre: 'Lavado de motor' }, { id: 's2', nombre: 'Lavado básico' }] }),
      fila({ id: 'p3', establecimiento_id: SEDE_A, nombre: 'Aspirado', descuento_pct: '10', fecha_fin: '2026-11-28' }),
      fila({ id: 'p9', establecimiento_id: SEDE_B, nombre: 'Promo de la sede Sur', descuento_pct: '50', fecha_fin: '2026-12-31' }),
    ],
  };
}

/** Cliente de Supabase mínimo: select / eq / order (varios) / maybeSingle sobre arreglos. */
function baseEnMemoria(datos) {
  const consultas = [];
  return {
    consultas,
    from(tabla) {
      const filtros = [];
      const ordenes = [];
      const ejecutar = () => {
        const filas = (datos[tabla] ?? []).filter((f) => filtros.every((cumple) => cumple(f)));
        filas.sort((a, b) => {
          for (const { col, asc } of ordenes) {
            if (a[col] !== b[col]) return (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1);
          }
          return 0;
        });
        return { data: filas, error: null };
      };
      const q = {
        select(columnas) { consultas.push({ tabla, columnas }); return q; },
        eq(col, v) { consultas.at(-1).filtros = [...(consultas.at(-1).filtros ?? []), [col, v]]; filtros.push((f) => f[col] === v); return q; },
        order(col, { ascending = true } = {}) { ordenes.push({ col, asc: ascending }); return q; },
        async maybeSingle() { return { data: ejecutar().data[0] ?? null, error: null }; },
        then(resolver, rechazar) { return Promise.resolve(ejecutar()).then(resolver, rechazar); },
      };
      return q;
    },
  };
}

let db;
beforeEach(() => {
  db = baseEnMemoria(tablas());
});

describe('HU-26 · promociones vigentes de la sede', () => {
  it('CA1: lee la vista promociones_vigentes (la vigencia la decide la base)', async () => {
    await listarPromocionesVigentes('lavadero-norte', { db });
    const consulta = db.consultas.find((c) => c.tabla === 'promociones_vigentes');
    expect(consulta).toBeDefined();
    expect(db.consultas.some((c) => c.tabla === 'promociones' || c.tabla === 'promociones_con_estado')).toBe(false);
  });

  it('CA2 / ESC-F5-07: con el slug de A solo salen promociones de A, filtradas por el id de A', async () => {
    const { promociones } = await listarPromocionesVigentes('lavadero-norte', { db });
    expect(promociones.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(JSON.stringify(promociones)).not.toContain('Sede Sur');
    const consulta = db.consultas.find((c) => c.tabla === 'promociones_vigentes');
    expect(consulta.filtros).toContainEqual(['establecimiento_id', SEDE_A]);
  });

  it('CA2 / ESC-F5-07: con el slug de B solo sale la de B', async () => {
    const { promociones } = await listarPromocionesVigentes('lavadero-sur', { db });
    expect(promociones.map((p) => p.id)).toEqual(['p9']);
  });

  it('CA3: devuelve la marca de la sede (logo y colores válidos; un color inválido sale null)', async () => {
    const a = await listarPromocionesVigentes('lavadero-norte', { db });
    expect(a.sede).toEqual({ slug: 'lavadero-norte', nombre: 'Lavadero Norte', logoUrl: 'https://x/norte.png', colorPrimario: '#B91C1C', colorSecundario: '#F59E0B' });
    const b = await listarPromocionesVigentes('lavadero-sur', { db });
    expect(b.sede).toMatchObject({ logoUrl: null, colorPrimario: null, colorSecundario: null });
    expect(b.sede).not.toHaveProperty('id');
  });

  it('ordena por la que vence primero y luego por nombre', async () => {
    const { promociones } = await listarPromocionesVigentes('lavadero-norte', { db });
    expect(promociones.map((p) => p.nombre)).toEqual(['Aspirado', 'Black Friday', 'Martes de motor']);
  });

  it('no expone columnas internas ni las condiciones (son del detalle, HU-27)', async () => {
    const { promociones } = await listarPromocionesVigentes('lavadero-norte', { db });
    const motor = promociones.find((p) => p.id === 'p1');
    expect(motor).toEqual({
      id: 'p1',
      nombre: 'Martes de motor',
      descripcion: '20 % en motor',
      descuentoPct: 20,
      fechaFin: '2026-11-30',
      servicios: ['Lavado de motor'],
    });
    const texto = JSON.stringify(promociones);
    for (const interno of ['establecimiento_id', 'activa', 'estado', 'created_at', 'condiciones', SEDE_A]) {
      expect(texto).not.toContain(interno);
    }
  });

  it('sin promociones vigentes responde una lista vacía', async () => {
    db = baseEnMemoria({ ...tablas(), promociones_vigentes: [] });
    const { promociones } = await listarPromocionesVigentes('lavadero-norte', { db });
    expect(promociones).toEqual([]);
  });

  it('sede inexistente, suspendida o slug inválido → 404, sin consultar promociones', async () => {
    for (const slug of ['no-existe', 'cerrado', '../admin']) {
      await expect(listarPromocionesVigentes(slug, { db })).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    }
    expect(db.consultas.some((c) => c.tabla === 'promociones_vigentes')).toBe(false);
  });

  it('promocionPublica convierte el descuento a número y tolera servicios vacíos', () => {
    expect(promocionPublica({ id: 'x', nombre: 'N', descuento_pct: '12.50', fecha_fin: '2026-12-01', servicios: null })).toEqual({
      id: 'x', nombre: 'N', descripcion: null, descuentoPct: 12.5, fechaFin: '2026-12-01', servicios: [],
    });
  });
});
