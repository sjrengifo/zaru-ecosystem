// HU-40 (ZARU-70) — Registrar el dispositivo para recibir notificaciones push (web móvil).
// El navegador se simula: permiso, service worker y pushManager son objetos falsos.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  activarPush, claveABytes, marcarNoInsistir, noInsistir, soportePush,
} from '../src/lib/push.js';
import { detalleCanal, puedeRegistrarPush, textoEstado } from '../src/lib/preferenciasCanal.js';
import AvisoPush from '../src/components/AvisoPush.jsx';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const CLAVE = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const SUSCRIPCION = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } };

/** Navegador falso con push. `permiso` es lo que responde el cliente al diálogo del navegador. */
function navegador({ ua = ANDROID, permiso = 'granted', instalada = false, yaSuscrito = false } = {}) {
  const suscripcion = { endpoint: SUSCRIPCION.endpoint, toJSON: () => SUSCRIPCION, unsubscribe: vi.fn(async () => true) };
  const pushManager = {
    getSubscription: vi.fn(async () => (yaSuscrito ? suscripcion : null)),
    subscribe: vi.fn(async () => suscripcion),
  };
  const registro = { pushManager };
  const nav = {
    userAgent: ua,
    standalone: instalada,
    serviceWorker: { register: vi.fn(async () => registro), ready: Promise.resolve(registro), getRegistration: vi.fn(async () => registro) },
  };
  const win = {
    PushManager: function PushManager() {},
    Notification: { permission: 'default', requestPermission: vi.fn(async () => permiso) },
    matchMedia: () => ({ matches: instalada }),
  };
  return { nav, win, pushManager };
}

function simularApi() {
  const fetchFalso = vi.fn(async (url, opciones = {}) => {
    const cuerpo = url.endsWith('/publico/push/clave')
      ? { clavePublica: CLAVE }
      : opciones.method === 'POST' ? { registrado: true, dispositivo: 'Chrome en Android' } : { registrado: false };
    return { ok: true, status: opciones.method === 'POST' ? 201 : 200, json: async () => cuerpo };
  });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('HU-40 CA3 · soporte del navegador', () => {
  it('Chrome en Android soporta push', () => {
    const { nav, win } = navegador();
    expect(soportePush(nav, win)).toEqual({ soportado: true, motivo: null });
  });

  it('en iPhone sin instalar la web en la pantalla de inicio no hay push y se explica cómo', () => {
    const { nav, win } = navegador({ ua: IPHONE });
    expect(soportePush(nav, win)).toEqual({ soportado: false, motivo: 'ios-sin-instalar' });
    const instalada = navegador({ ua: IPHONE, instalada: true });
    expect(soportePush(instalada.nav, instalada.win).soportado).toBe(true);
  });

  it('un navegador sin Push API no lo soporta', () => {
    expect(soportePush({ userAgent: ANDROID }, {})).toEqual({ soportado: false, motivo: 'navegador' });
  });

  it('en preferencias se le sugiere SMS o correo cuando no hay soporte', () => {
    const preferencias = { canales: { push: { activo: false, disponible: false, configurado: true } } };
    const sinSoporte = { soportado: false, motivo: 'navegador', permiso: 'unsupported' };
    expect(textoEstado('push', preferencias, sinSoporte)).toBe('No disponible');
    expect(detalleCanal('push', preferencias, sinSoporte)).toMatch(/Elige SMS o correo/);
    expect(detalleCanal('push', preferencias, { soportado: false, motivo: 'ios-sin-instalar' })).toMatch(/pantalla de inicio/);
    expect(puedeRegistrarPush(preferencias, sinSoporte)).toBe(false);
  });
});

describe('HU-40 CA1 · aceptar el permiso registra el dispositivo', () => {
  it('pide el permiso, suscribe con la llave VAPID y registra la suscripción con el pase', async () => {
    const api = simularApi();
    const { nav, win, pushManager } = navegador();
    const resultado = await activarPush('pase-1', { nav, win });

    expect(resultado).toEqual({ resultado: 'activado', dispositivo: 'Chrome en Android' });
    expect(win.Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(nav.serviceWorker.register).toHaveBeenCalledWith('/sw-zaru.js');
    const { applicationServerKey, userVisibleOnly } = pushManager.subscribe.mock.calls[0][0];
    expect(userVisibleOnly).toBe(true);
    expect(applicationServerKey).toEqual(claveABytes(CLAVE));
    const [, opciones] = api.mock.calls.find(([url, o]) => url.endsWith('/publico/cliente/push') && o?.method === 'POST');
    expect(opciones.headers.Authorization).toBe('Bearer pase-1');
    expect(JSON.parse(opciones.body)).toEqual(SUSCRIPCION);
  });

  it('si el navegador ya estaba suscrito, reutiliza la suscripción', async () => {
    simularApi();
    const { nav, win, pushManager } = navegador({ yaSuscrito: true });
    await activarPush('pase-1', { nav, win });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('la llave VAPID base64url se convierte a los 65 bytes que pide el navegador', () => {
    expect(claveABytes(CLAVE)).toHaveLength(65);
  });
});

describe('HU-40 CA2 · rechazar el permiso', () => {
  it('no registra nada y no vuelve a insistir en la misma sesión', async () => {
    const api = simularApi();
    const { nav, win, pushManager } = navegador({ permiso: 'denied' });
    expect(await activarPush('pase-1', { nav, win })).toEqual({ resultado: 'rechazado' });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
    expect(noInsistir()).toBe(true);
  });

  it('con el permiso bloqueado, preferencias lo explica y no ofrece el botón', () => {
    const preferencias = { canales: { push: { activo: false, disponible: false, configurado: true } } };
    const bloqueado = { soportado: true, motivo: null, permiso: 'denied' };
    expect(detalleCanal('push', preferencias, bloqueado)).toMatch(/te avisamos por SMS o correo/);
    expect(puedeRegistrarPush(preferencias, bloqueado)).toBe(false);
    expect(puedeRegistrarPush(preferencias, { ...bloqueado, permiso: 'default' })).toBe(true);
  });
});

describe('HU-40 · invitación al entrar a la web móvil', () => {
  function navegadorGlobal() {
    const { nav, win } = navegador();
    vi.stubGlobal('PushManager', win.PushManager);
    vi.stubGlobal('Notification', win.Notification);
    Object.defineProperty(window.navigator, 'serviceWorker', { value: nav.serviceWorker, configurable: true });
    return { nav, win };
  }

  it('ofrece activar las notificaciones y "Ahora no" la oculta sin volver a insistir', async () => {
    simularApi();
    navegadorGlobal();
    render(<AvisoPush pase="pase-1" />);

    expect(await screen.findByText('¿Te avisamos en este celular?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
    expect(screen.queryByText('¿Te avisamos en este celular?')).not.toBeInTheDocument();
    expect(noInsistir()).toBe(true);
  });

  it('si ya dijo "Ahora no" en esta sesión, no aparece', async () => {
    simularApi();
    navegadorGlobal();
    marcarNoInsistir();
    render(<AvisoPush pase="pase-1" />);
    await waitFor(() => expect(screen.queryByText('¿Te avisamos en este celular?')).not.toBeInTheDocument());
  });
});
