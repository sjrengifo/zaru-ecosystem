// Lógica pura de HU-46 (mensajes de correo), HU-57 (establecimientos) y HU-59 (permisos).
import { describe, it, expect } from 'vitest';
import { mensajeCorreo, etiquetaCorreo, correosPorEvento, hayCorreoEnCurso } from '../src/lib/avisoCorreo.js';
import { menuPara, puedeVer, inicioDe, modulosDe } from '../src/lib/permisos.js';
import {
  accionesPara, contarPorEstado, filtrarEstablecimientos, validarRegistro, finDePrueba,
} from '../src/lib/establecimientos.js';

describe('HU-46 · mensajes del correo para el operario', () => {
  it('CA1/CA2: confirma a quién se está enviando el correo', () => {
    expect(mensajeCorreo({ estado: 'pendiente', destino: 'a***@x.co' })).toEqual({ tipo: 'exito', texto: 'Se está enviando el correo a a***@x.co.' });
  });

  it('CA3: sin correo o con error se advierte, sin bloquear (el cambio ya está guardado)', () => {
    expect(mensajeCorreo({ estado: 'omitida', motivo: 'sin_correo' })).toMatchObject({ tipo: 'advertencia', texto: expect.stringContaining('no tiene correo') });
    expect(mensajeCorreo({ estado: 'omitida', motivo: 'revocado' }).texto).toContain('pidió no recibir');
    expect(mensajeCorreo({ estado: 'error' }).texto).toContain('quedó guardado');
    expect(mensajeCorreo(null)).toBeNull();
  });

  it('la tarjeta muestra el correo del ingreso o, desde "listo", el del aviso de listo', () => {
    expect(etiquetaCorreo({ estado: 'recibido', cliente: { tieneCorreo: true }, correos: { 'orden.recibida': 'enviada' } }))
      .toEqual({ texto: 'Correo enviado · ingreso', tipo: 'exito' });
    expect(etiquetaCorreo({ estado: 'listo', cliente: { tieneCorreo: true }, correos: { 'orden.recibida': 'enviada', 'orden.lista': 'fallida' } }))
      .toEqual({ texto: 'Correo no enviado · listo', tipo: 'error' });
    expect(etiquetaCorreo({ estado: 'recibido', cliente: { tieneCorreo: false } })).toEqual({ texto: 'Sin correo', tipo: 'neutro' });
    expect(etiquetaCorreo({ estado: 'recibido', cliente: { tieneCorreo: true }, correos: {} })).toBeNull();
  });
});

describe('HU-59 · menú y permisos por rol', () => {
  const operario = { rol: 'operario', permisos: { modulos: ['dashboard', 'clientes', 'vehiculos'], inicio: '/' } };
  const admin = { rol: 'admin' };

  it('CA1: el operario solo ve Dashboard, Clientes y Vehículos', () => {
    expect(menuPara(operario).map((m) => m.texto)).toEqual(['Dashboard', 'Clientes', 'Vehículos']);
    expect(puedeVer(operario, 'promociones')).toBe(false);
    expect(puedeVer(operario, 'branding')).toBe(false);
  });

  it('CA2: el administrador ve todos los módulos', () => {
    expect(menuPara(admin).map((m) => m.texto)).toEqual(['Dashboard', 'Clientes', 'Vehículos', 'Servicios', 'Promociones', 'Usuarios', 'Branding', 'Reportes']);
  });

  it('usa los permisos que envía la API antes que la copia local', () => {
    expect(modulosDe({ rol: 'admin', permisos: { modulos: ['dashboard'] } })).toEqual(['dashboard']);
    expect(modulosDe(null)).toEqual([]);
  });

  it('CA3: cada rol tiene su página de inicio', () => {
    expect(inicioDe(operario)).toBe('/');
    expect(inicioDe({ rol: 'superadmin' })).toBe('/superadmin');
  });
});

describe('HU-57 · reglas del panel de superadministración', () => {
  const lista = [
    { id: '1', nombre: 'Lavadero Ñandú', estado: 'prueba', administrador: { correo: 'ana@x.co', invitacionAceptada: false } },
    { id: '2', nombre: 'AutoSpa', estado: 'activo', administrador: { correo: 'beto@y.co', invitacionAceptada: true } },
    { id: '3', nombre: 'Brillo', estado: 'suspendido', administrador: null },
    { id: '4', nombre: 'Clean', estado: 'pendiente_activacion', administrador: null },
  ];

  it('acciones según el estado (mismas reglas que la API)', () => {
    expect(accionesPara(lista[0])).toEqual({ activar: true, suspender: true, reenviar: true });
    expect(accionesPara(lista[1])).toEqual({ activar: false, suspender: true, reenviar: false });
    expect(accionesPara(lista[2])).toEqual({ activar: true, suspender: false, reenviar: false });
  });

  it('cuenta por estado para las tarjetas de resumen', () => {
    expect(contarPorEstado(lista)).toEqual({ todos: 4, prueba: 1, activo: 1, pendiente_activacion: 1, suspendido: 1 });
  });

  it('filtra por estado y busca por nombre o correo sin distinguir tildes', () => {
    expect(filtrarEstablecimientos(lista, { estado: 'activo' }).map((e) => e.id)).toEqual(['2']);
    expect(filtrarEstablecimientos(lista, { buscar: 'nandu' }).map((e) => e.id)).toEqual(['1']);
    expect(filtrarEstablecimientos(lista, { buscar: 'beto@' }).map((e) => e.id)).toEqual(['2']);
  });

  it('CA1/CA2: valida nombre, correo y prueba de 14 a 30 días', () => {
    expect(validarRegistro({ nombre: 'Lavadero', correoAdministrador: 'a@b.co', diasPrueba: '14' })).toEqual({});
    expect(Object.keys(validarRegistro({ nombre: 'L', correoAdministrador: 'malo', diasPrueba: '31' }))).toEqual(['nombre', 'correoAdministrador', 'diasPrueba']);
    expect(validarRegistro({ nombre: 'Lavadero', correoAdministrador: 'a@b.co', diasPrueba: '13' })).toHaveProperty('diasPrueba');
  });

  it('calcula la fecha de fin de la prueba', () => {
    expect(finDePrueba(14, new Date(2026, 10, 3)).getDate()).toBe(17);
  });

  it('correosPorEvento convierte las filas de notificaciones al formato de etiquetaCorreo', () => {
    expect(correosPorEvento([{ evento: 'orden.lista', estado: 'enviada' }, { evento: 'orden.recibida', estado: 'fallida' }]))
      .toEqual({ 'orden.lista': 'enviada', 'orden.recibida': 'fallida' });
    expect(correosPorEvento(undefined)).toEqual({});
  });

  it('hayCorreoEnCurso: solo cuenta correos recientes que aún se están enviando', () => {
    const ahora = Date.parse('2026-11-04T12:00:00Z');
    const reciente = new Date(ahora - 5_000).toISOString();
    const vieja = new Date(ahora - 10 * 60_000).toISOString();
    const con = (estado, created_at) => [{ notificaciones: [{ evento: 'orden.lista', estado, created_at }] }];
    expect(hayCorreoEnCurso(con('pendiente', reciente), ahora)).toBe(true);
    expect(hayCorreoEnCurso(con('enviando', reciente), ahora)).toBe(true);
    expect(hayCorreoEnCurso(con('enviada', reciente), ahora)).toBe(false);
    expect(hayCorreoEnCurso(con('fallida', reciente), ahora)).toBe(false);
    expect(hayCorreoEnCurso(con('pendiente', vieja), ahora)).toBe(false); // huérfana: no se consulta para siempre
    expect(hayCorreoEnCurso([{}], ahora)).toBe(false);
  });
});
