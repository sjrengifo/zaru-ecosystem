// HU-41: pruebas unitarias de la capa de acceso a datos multi-tenant (src/shared/tenant.js).
import { describe, it, expect } from 'vitest';
import { crearAccesoTenant } from '../../src/shared/tenant.js';
import { AppError } from '../../src/shared/errores.js';
import { crearSupabaseFalso } from '../helpers/supabaseFalso.js';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const ID = 'cccccccc-0000-4000-8000-000000000003';

const filtros = (llamadas) => llamadas.filter(([m]) => m === 'eq').map(([, c, v]) => `${c}=${v}`);

describe('crearAccesoTenant', () => {
  it('rechaza una sesión sin establecimiento válido', () => {
    expect(() => crearAccesoTenant(crearSupabaseFalso(), {})).toThrow(AppError);
    expect(() => crearAccesoTenant(crearSupabaseFalso(), { establecimientoId: 'no-es-uuid' })).toThrow(/sin establecimiento/);
  });

  describe('CA1: filtra automáticamente por el establecimiento de la sesión', () => {
    it('listar agrega el filtro establecimiento_id', () => {
      const db = crearSupabaseFalso();
      crearAccesoTenant(db, { establecimientoId: A }).listar('clientes', 'id, nombre');
      expect(db.llamadas).toContainEqual(['from', 'clientes']);
      expect(filtros(db.llamadas)).toEqual([`establecimiento_id=${A}`]);
    });

    it('en la tabla establecimientos el filtro usa la columna id', () => {
      const db = crearSupabaseFalso();
      crearAccesoTenant(db, { establecimientoId: A }).listar('establecimientos');
      expect(filtros(db.llamadas)).toEqual([`id=${A}`]);
    });

    it('obtener filtra por id y por establecimiento', async () => {
      const db = crearSupabaseFalso({ data: { id: ID }, error: null });
      await crearAccesoTenant(db, { establecimientoId: A }).obtener('clientes', ID);
      expect(filtros(db.llamadas)).toEqual([`id=${ID}`, `establecimiento_id=${A}`]);
    });

    it('crear usa el establecimiento de la sesión aunque el cuerpo traiga otro', async () => {
      const db = crearSupabaseFalso({ data: [{ id: ID }], error: null });
      await crearAccesoTenant(db, { establecimientoId: A }).crear('clientes', {
        nombre: 'Ana',
        establecimiento_id: B,
        id: ID,
      });
      const [, filas] = db.llamadas.find(([m]) => m === 'insert');
      expect(filas).toEqual([{ nombre: 'Ana', establecimiento_id: A }]);
    });

    it('actualizar filtra por establecimiento e ignora intentos de cambiar de establecimiento', async () => {
      const db = crearSupabaseFalso({ data: { id: ID }, error: null });
      await crearAccesoTenant(db, { establecimientoId: A }).actualizar('clientes', ID, {
        nombre: 'Ana',
        establecimiento_id: B,
      });
      const [, cambios] = db.llamadas.find(([m]) => m === 'update');
      expect(cambios).toEqual({ nombre: 'Ana' });
      expect(filtros(db.llamadas)).toEqual([`id=${ID}`, `establecimiento_id=${A}`]);
    });

    it('eliminar filtra por id y por establecimiento', async () => {
      const db = crearSupabaseFalso({ data: { id: ID }, error: null });
      await crearAccesoTenant(db, { establecimientoId: A }).eliminar('clientes', ID);
      expect(filtros(db.llamadas)).toEqual([`id=${ID}`, `establecimiento_id=${A}`]);
    });
  });

  describe('CA2: un recurso ajeno responde igual que uno inexistente', () => {
    const casos = [
      ['obtener', (t, id) => t.obtener('clientes', id, '*', 'Cliente')],
      ['actualizar', (t, id) => t.actualizar('clientes', id, { nombre: 'X' }, '*', 'Cliente')],
      ['eliminar', (t, id) => t.eliminar('clientes', id, 'Cliente')],
    ];

    it.each(casos)('%s: sin fila visible lanza NO_ENCONTRADO', async (_, operar) => {
      const db = crearSupabaseFalso({ data: null, error: null });
      const error = await operar(crearAccesoTenant(db, { establecimientoId: A }), ID).catch((e) => e);
      expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404, message: 'Cliente no encontrado' });
    });

    it.each(casos)('%s: un id que no es UUID da el mismo error sin consultar la base', async (_, operar) => {
      const db = crearSupabaseFalso();
      const error = await operar(crearAccesoTenant(db, { establecimientoId: A }), "1' or '1'='1").catch((e) => e);
      expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404, message: 'Cliente no encontrado' });
      expect(db.llamadas).toEqual([]);
    });

    it('el mensaje de error no incluye el id consultado', async () => {
      const db = crearSupabaseFalso({ data: null, error: null });
      const error = await crearAccesoTenant(db, { establecimientoId: A }).obtener('clientes', ID, '*', 'Cliente').catch((e) => e);
      expect(error.message).not.toContain(ID);
    });
  });

  describe('errores de la base', () => {
    it('traduce un duplicado a CONFLICTO', async () => {
      const db = crearSupabaseFalso({ data: null, error: { code: '23505', details: 'telefono' } });
      const error = await crearAccesoTenant(db, { establecimientoId: A }).crear('clientes', { nombre: 'Ana' }).catch((e) => e);
      expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    });

    it('traduce una relación con datos de otro establecimiento a CONFLICTO', async () => {
      const db = crearSupabaseFalso({ data: null, error: { code: '23503' } });
      const error = await crearAccesoTenant(db, { establecimientoId: A }).crear('vehiculos', { cliente_id: ID }).catch((e) => e);
      expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    });
  });
});
