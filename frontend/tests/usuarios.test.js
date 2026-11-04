// HU-02 — Pruebas de la validación del formulario de operarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NOMBRE_MAXIMO, usuarioAFormulario, validarUsuario } from '../src/lib/validacionUsuario.js';

test('CA1: un operario necesita nombre y correo válidos', () => {
  assert.deepEqual(validarUsuario({ nombre: '', correo: '' }), {
    nombre: 'El nombre es obligatorio',
    correo: 'El correo es obligatorio',
  });
});

test('el nombre debe tener entre 2 y 120 caracteres', () => {
  assert.equal(validarUsuario({ nombre: 'A', correo: 'a@example.com' }).nombre, 'El nombre debe tener al menos 2 caracteres');
  assert.equal(
    validarUsuario({ nombre: 'x'.repeat(NOMBRE_MAXIMO + 1), correo: 'a@example.com' }).nombre,
    `El nombre admite máximo ${NOMBRE_MAXIMO} caracteres`,
  );
  assert.deepEqual(validarUsuario({ nombre: '  Ana  ', correo: 'ana@example.com' }), {});
});

test('el correo se valida solo al crear la cuenta', () => {
  assert.ok(validarUsuario({ nombre: 'Ana', correo: 'sin-arroba' }).correo);
  assert.deepEqual(validarUsuario({ nombre: 'Ana', correo: '' }, { conCorreo: false }), {});
});

test('el formulario parte del nombre y correo del operario', () => {
  assert.deepEqual(usuarioAFormulario({ nombre: '  Ana  ', correo: ' ANA@EXAMPLE.COM ' }), {
    nombre: 'Ana',
    correo: 'ana@example.com',
  });
  assert.deepEqual(usuarioAFormulario(null), { nombre: '', correo: '' });
});
