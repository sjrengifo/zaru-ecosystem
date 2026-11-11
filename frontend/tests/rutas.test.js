// HU-02 CA2 — Política de rutas: el rol se comprueba aunque se escriba la URL directa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { destinoTrasLogin, puedeAcceder, rolesDeRuta, rutaInicio, rutaNormalizada } from '../src/lib/rutas.js';
import { MENU } from '../src/lib/menu.js';

const CONFIGURACION = ['/servicios', '/promociones', '/usuarios', '/branding', '/reportes', '/notificaciones'];

test('CA2: el administrador entra a todas las secciones de configuración', () => {
  for (const ruta of CONFIGURACION) assert.equal(puedeAcceder('admin', ruta), true, ruta);
  for (const ruta of ['/', '/clientes', '/vehiculos', '/aceptar-invitacion']) {
    assert.equal(puedeAcceder('admin', ruta), true, ruta);
  }
});

test('CA2: el operario no entra a configuración ni escribiendo su URL', () => {
  for (const ruta of CONFIGURACION) assert.equal(puedeAcceder('operario', ruta), false, ruta);
  for (const ruta of ['/', '/clientes', '/vehiculos']) {
    assert.equal(puedeAcceder('operario', ruta), true, ruta);
  }
});

test('una URL con barra final, mayúsculas de ruta o consulta no evade la política', () => {
  assert.equal(rutaNormalizada('/servicios/?desde=menu'), '/servicios');
  assert.equal(rutaNormalizada('/servicios#panel'), '/servicios');
  assert.equal(puedeAcceder('operario', '/usuarios/'), false);
  assert.equal(puedeAcceder('operario', '/reportes?rango=mes'), false);
});

test('el superadministrador solo entra a su panel global', () => {
  assert.equal(puedeAcceder('superadmin', '/superadmin'), true);
  for (const ruta of CONFIGURACION) assert.equal(puedeAcceder('superadmin', ruta), false, ruta);
  assert.equal(puedeAcceder('superadmin', '/'), false);
});

test('un rol desconocido o una ruta inexistente no abren ninguna página', () => {
  assert.deepEqual(rolesDeRuta('/no-existe'), []);
  assert.equal(puedeAcceder(undefined, '/servicios'), false);
  assert.equal(puedeAcceder('operario', '/no-existe'), false);
});

test('el menú y la política de rutas no se contradicen', () => {
  for (const item of MENU) {
    assert.ok(rolesDeRuta(item.ruta).length > 0, item.ruta);
    assert.equal(puedeAcceder('admin', item.ruta), true, item.ruta);
    assert.equal(puedeAcceder('operario', item.ruta), !item.soloAdmin, item.ruta);
  }
});

test('cada rol vuelve a su página inicial cuando intenta una ruta restringida', () => {
  assert.equal(rutaInicio('superadmin'), '/superadmin');
  assert.equal(rutaInicio('admin'), '/');
  assert.equal(rutaInicio('operario'), '/');
});

test('tras iniciar sesión no se arrastra una ruta de otro rol (superadmin → admin)', () => {
  assert.equal(destinoTrasLogin('admin', '/superadmin'), '/');
  assert.equal(destinoTrasLogin('operario', '/usuarios'), '/');
  assert.equal(destinoTrasLogin('superadmin', '/usuarios'), '/superadmin');
});

test('tras iniciar sesión sí se vuelve a la ruta pedida si el rol la permite', () => {
  assert.equal(destinoTrasLogin('admin', '/reportes'), '/reportes');
  assert.equal(destinoTrasLogin('operario', '/clientes'), '/clientes');
  assert.equal(destinoTrasLogin('admin', undefined), '/');
  assert.equal(destinoTrasLogin('admin', '/login'), '/');
});
