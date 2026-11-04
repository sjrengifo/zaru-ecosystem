// HU-02 — Validación de los datos de un operario.
import { describe, it, expect } from 'vitest';
import { usuarioNuevo, usuarioCambios, idUsuario } from '../../src/schemas/usuarios.schemas.js';

const errores = (esquema, datos) => esquema.safeParse(datos).error?.issues.map((i) => [i.path.join('.'), i.message]);

describe('HU-02 · datos de un operario nuevo', () => {
  it('recorta el nombre y normaliza el correo a minúsculas', () => {
    expect(usuarioNuevo.parse({ nombre: '  Laura Gómez  ', correo: ' LAURA@EXAMPLE.COM ' })).toEqual({
      nombre: 'Laura Gómez',
      correo: 'laura@example.com',
    });
  });

  it('exige nombre y correo', () => {
    expect(errores(usuarioNuevo, {})).toEqual([
      ['nombre', 'El nombre es obligatorio'],
      ['correo', 'El correo es obligatorio'],
    ]);
  });

  it.each(['', '   ', 'x'])('rechaza el nombre %j', (nombre) => {
    expect(errores(usuarioNuevo, { nombre, correo: 'laura@example.com' })?.[0][0]).toBe('nombre');
  });

  it('rechaza un nombre de más de 120 caracteres', () => {
    expect(errores(usuarioNuevo, { nombre: 'x'.repeat(121), correo: 'laura@example.com' })).toEqual([
      ['nombre', 'El nombre admite máximo 120 caracteres'],
    ]);
  });

  it.each(['sin-arroba', 'a@', '@example.com', 'a b@example.com'])('rechaza el correo %s', (correo) => {
    expect(errores(usuarioNuevo, { nombre: 'Laura', correo })?.[0][0]).toBe('correo');
  });

  it('descarta rol, establecimiento y contraseña enviados por el cliente', () => {
    expect(usuarioNuevo.parse({
      nombre: 'Laura',
      correo: 'laura@example.com',
      rol: 'admin',
      establecimiento_id: 'aaaaaaaa-0000-4000-8000-000000000001',
      password: 'visible',
    })).toEqual({ nombre: 'Laura', correo: 'laura@example.com' });
  });
});

describe('HU-02 · cambios de un operario', () => {
  it('permite editar solo el nombre o solo el estado', () => {
    expect(usuarioCambios.parse({ nombre: 'Laura' })).toEqual({ nombre: 'Laura' });
    expect(usuarioCambios.parse({ activo: false })).toEqual({ activo: false });
  });

  it('rechaza una edición vacía', () => {
    expect(errores(usuarioCambios, {})).toEqual([['', 'No hay datos para actualizar']]);
  });

  it('rechaza un estado que no sea booleano', () => {
    expect(errores(usuarioCambios, { activo: 'false' })?.[0][0]).toBe('activo');
  });

  it('impide cambiar el rol o el correo desde esta ruta', () => {
    expect(usuarioCambios.parse({ nombre: 'Laura', rol: 'admin', correo: 'otro@example.com' })).toEqual({ nombre: 'Laura' });
  });
});

describe('HU-02 · identificador de usuario', () => {
  it('acepta un UUID y rechaza cualquier otro texto', () => {
    expect(idUsuario.safeParse({ id: 'bbbbbbbb-0000-4000-8000-000000000002' }).success).toBe(true);
    expect(idUsuario.safeParse({ id: 'no-es-uuid' }).success).toBe(false);
  });
});
