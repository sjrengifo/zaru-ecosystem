// HU-02 — Pruebas del menú por rol: un operario no ve las páginas de configuración.
import test from 'node:test';
import assert from 'node:assert/strict';
import { menuParaRol } from '../src/lib/menu.js';

const rutas = (rol) => menuParaRol(rol).map((item) => item.ruta);

test('CA2: el administrador ve todo el menú, incluida la configuración', () => {
  assert.deepEqual(rutas('admin'), [
    '/',
    '/clientes',
    '/vehiculos',
    '/servicios',
    '/promociones',
    '/usuarios',
    '/reportes',
    '/notificaciones',
    '/branding',
  ]);
});

test('CA2: el operario no ve servicios, promociones, usuarios, reportes ni branding', () => {
  assert.deepEqual(rutas('operario'), ['/', '/clientes', '/vehiculos']);
});

test('un rol desconocido tampoco recibe las opciones exclusivas del administrador', () => {
  assert.deepEqual(rutas(undefined), ['/', '/clientes', '/vehiculos']);
});
