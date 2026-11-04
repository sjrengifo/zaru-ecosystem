// HU-41 + HU-08/HU-10 — Tablas de detalle sin columna de tenant (orden_servicios, historial_estados).
import { describe, it, expect } from 'vitest';
import { crearAccesoTenant } from '../../src/shared/tenant.js';
import { crearSupabaseFalso } from '../helpers/supabaseFalso.js';

const EST = 'eeeeeeee-0000-4000-8000-000000000001';
const ORDEN = 'dddddddd-0000-4000-8000-00000000000d';
const padre = { tabla: 'ordenes', id: ORDEN, columna: 'orden_id', recurso: 'Orden' };

describe('tenant.crearDetalle', () => {
  it('verifica que el padre sea del establecimiento y agrega su id a cada fila', async () => {
    const db = crearSupabaseFalso({ data: { id: ORDEN }, error: null });
    const tenant = crearAccesoTenant(db, { establecimientoId: EST });

    await tenant.crearDetalle('historial_estados', padre, { estado: 'listo', usuario_id: 'u', establecimiento_id: 'otro' });

    expect(db.llamadas).toContainEqual(['eq', 'establecimiento_id', EST]);
    const insercion = db.llamadas.find(([m]) => m === 'insert');
    expect(insercion[1]).toEqual([{ estado: 'listo', usuario_id: 'u', orden_id: ORDEN }]); // ignora establecimiento_id
  });

  it('responde 404 si el padre es de otro establecimiento, sin insertar', async () => {
    const db = crearSupabaseFalso({ data: null, error: null });
    const tenant = crearAccesoTenant(db, { establecimientoId: EST });

    await expect(tenant.crearDetalle('orden_servicios', padre, [{ servicio_id: 's' }])).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(db.llamadas.some(([m]) => m === 'insert')).toBe(false);
  });

  it('actualizar acepta condiciones extra para evitar cambios simultáneos', async () => {
    const db = crearSupabaseFalso({ data: { id: ORDEN, estado: 'listo' }, error: null });
    const tenant = crearAccesoTenant(db, { establecimientoId: EST });
    await tenant.actualizar('ordenes', ORDEN, { estado: 'listo' }, 'id, estado', 'Orden', { estado: 'en_lavado' });
    expect(db.llamadas).toContainEqual(['eq', 'estado', 'en_lavado']);
  });
});
