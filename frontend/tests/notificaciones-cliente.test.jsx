// HU-38 — Centro de notificaciones del cliente en la app.
// La API se simula con fetch; el seguimiento y el historial se reemplazan por pantallas marcador.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import NotificacionesCliente from '../src/pages/NotificacionesCliente.jsx';
import AccesoCliente from '../src/pages/AccesoCliente.jsx';
import { conLeida, etiquetaCampana, rutaDestino, textoContador } from '../src/lib/notificacionesCliente.js';

const SLUG = 'lavadero-norte';
const SEDE = { slug: SLUG, nombre: 'Lavadero Norte', logoUrl: null, colorPrimario: '#0F766E', colorSecundario: null };
const ORDEN_ENTREGADA = '11111111-0000-4000-8000-000000000002';

const NOTIFICACIONES = [
  {
    id: 'n-3', tipo: 'operativa', categoria: 'Estado del servicio', evento: 'orden.recibida', canal: 'correo',
    titulo: 'Recibimos tu vehículo ABC123 en Lavadero Norte', fecha: '2026-11-10T14:00:00Z', leida: false,
    placa: 'ABC123', destino: { pantalla: 'seguimiento', codigo: 'K7Q2M9XH4P' },
  },
  {
    id: 'n-2', tipo: 'operativa', categoria: 'Estado del servicio', evento: 'orden.lista', canal: 'correo',
    titulo: 'Tu vehículo XYZ987 está listo para recoger', fecha: '2026-11-05T14:00:00Z', leida: false,
    placa: 'XYZ987', destino: { pantalla: 'historial', ordenId: ORDEN_ENTREGADA },
  },
  {
    id: 'n-1', tipo: 'operativa', categoria: 'Estado del servicio', evento: 'orden.recibida', canal: 'sms',
    titulo: 'Recibimos tu vehículo XYZ987 en Lavadero Norte', fecha: '2026-11-01T14:00:00Z', leida: true,
    placa: 'XYZ987', destino: { pantalla: 'historial', ordenId: ORDEN_ENTREGADA },
  },
];

function respuesta(status, cuerpo) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });
}

/** Simula la API por ruta: sede, acceso con placa + celular, centro y marcar como leída. */
function simularApi({ centro = [200, { notificaciones: NOTIFICACIONES, noLeidas: 2 }], leida = [200, { leida: true }] } = {}) {
  const fetchFalso = vi.fn((url, opciones = {}) => {
    if (url.includes('/historial/acceso')) return respuesta(200, { pase: 'pase-nuevo', expiraEn: '2026-11-10T16:00:00Z', sede: SEDE, cliente: { nombre: 'Laura' } });
    if (opciones.method === 'PATCH') return respuesta(...leida);
    if (url.endsWith('/publico/cliente/notificaciones')) return respuesta(...centro);
    return respuesta(200, SEDE);
  });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

function SeguimientoMarcador() {
  const { codigo } = useParams();
  return <p>Seguimiento {codigo}</p>;
}

function HistorialMarcador() {
  const { search } = useLocation();
  return <p>Historial {search}</p>;
}

function abrir(ruta = `/s/${SLUG}/notificaciones`) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/s/:slug" element={<AccesoCliente />} />
        <Route path="/s/:slug/notificaciones" element={<NotificacionesCliente />} />
        <Route path="/s/:slug/historial" element={<HistorialMarcador />} />
        <Route path="/seguimiento/:codigo" element={<SeguimientoMarcador />} />
      </Routes>
    </MemoryRouter>,
  );
}

const conPase = () => sessionStorage.setItem(`zaru:historial:${SLUG}`, 'pase-valido');
const tarjetas = () => screen.getAllByRole('listitem').map((li) => within(li).getByRole('button'));

beforeEach(() => {
  sessionStorage.clear();
  document.title = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reglas del centro de notificaciones', () => {
  it('CA3: un aviso de estado lleva al seguimiento o al detalle del historial; los demás a ninguna pantalla', () => {
    expect(rutaDestino(SLUG, { pantalla: 'seguimiento', codigo: 'K7Q2M9XH4P' })).toBe('/seguimiento/K7Q2M9XH4P');
    expect(rutaDestino(SLUG, { pantalla: 'historial', ordenId: ORDEN_ENTREGADA })).toBe(`/s/${SLUG}/historial?orden=${ORDEN_ENTREGADA}`);
    expect(rutaDestino(SLUG, null)).toBeNull();
  });

  it('CA2: el contador no ocupa más de dos cifras y la campana lo anuncia', () => {
    expect(textoContador(3)).toBe('3');
    expect(textoContador(12)).toBe('9+');
    expect(etiquetaCampana(0)).toBe('Notificaciones');
    expect(etiquetaCampana(2)).toBe('Notificaciones, 2 sin leer');
  });

  it('marcar una como leída recalcula el contador', () => {
    const estado = { notificaciones: NOTIFICACIONES, noLeidas: 2 };
    expect(conLeida(estado, 'n-3').noLeidas).toBe(1);
    expect(conLeida(estado, 'n-3').notificaciones[0].leida).toBe(true);
  });
});

describe('HU-38 · pantalla del centro de notificaciones', () => {
  it('sin acceso pide la placa y el celular, y luego muestra los avisos', async () => {
    const api = simularApi();
    abrir();

    expect(await screen.findByRole('heading', { name: 'Mis notificaciones' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Placa del vehículo'), { target: { value: 'abc123' } });
    fireEvent.change(screen.getByLabelText('Número de celular'), { target: { value: '3001234567' } });
    fireEvent.click(screen.getByRole('button', { name: /Ver mis notificaciones/ }));

    expect(await screen.findByRole('heading', { name: 'Notificaciones' })).toBeInTheDocument();
    expect(sessionStorage.getItem(`zaru:historial:${SLUG}`)).toBe('pase-nuevo');
    const llamada = api.mock.calls.find(([url]) => url.endsWith('/publico/cliente/notificaciones'));
    expect(llamada[1].headers.Authorization).toBe('Bearer pase-nuevo');
  });

  it('CA1 y CA2: lista los avisos en el orden recibido, distingue los no leídos y dice cuántos faltan', async () => {
    conPase();
    simularApi();
    abrir();

    expect(await screen.findByText('2 avisos sin leer · últimos 90 días')).toBeInTheDocument();
    const [primera, segunda, tercera] = tarjetas();
    expect(primera).toHaveTextContent('Recibimos tu vehículo ABC123');
    expect(primera).toHaveClass('notif-no-leida');
    expect(primera).toHaveTextContent('Sin leer');
    expect(segunda).toHaveTextContent('Tu vehículo XYZ987 está listo');
    expect(tercera).toHaveClass('notif-leida');
    expect(tercera).toHaveTextContent('Leída');
  });

  it('CA3: abrir un aviso de un vehículo en servicio lo marca como leído y lleva al seguimiento', async () => {
    conPase();
    const api = simularApi();
    abrir();

    fireEvent.click((await screen.findAllByRole('button', { name: /Ver seguimiento/ }))[0]);

    expect(await screen.findByText('Seguimiento K7Q2M9XH4P')).toBeInTheDocument();
    const patch = api.mock.calls.find(([, opciones]) => opciones?.method === 'PATCH');
    expect(patch[0]).toMatch(/\/publico\/cliente\/notificaciones\/n-3\/leida$/);
    expect(patch[1].headers.Authorization).toBe('Bearer pase-valido');
  });

  it('CA3: abrir un aviso de un servicio entregado lleva al detalle en el historial', async () => {
    conPase();
    simularApi();
    abrir();

    fireEvent.click((await screen.findAllByRole('button', { name: /Ver detalle del servicio/ }))[0]);

    expect(await screen.findByText(`Historial ?orden=${ORDEN_ENTREGADA}`)).toBeInTheDocument();
  });

  it('un aviso ya leído se abre sin volver a marcarlo', async () => {
    conPase();
    const api = simularApi();
    abrir();

    const leida = (await screen.findAllByRole('button')).find((b) => b.classList.contains('notif-leida'));
    fireEvent.click(leida);

    await screen.findByText(/Historial/);
    expect(api.mock.calls.some(([, opciones]) => opciones?.method === 'PATCH')).toBe(false);
  });

  it('sin avisos en 90 días muestra un mensaje claro', async () => {
    conPase();
    simularApi({ centro: [200, { notificaciones: [], noLeidas: 0 }] });
    abrir();

    expect(await screen.findByText('No tienes notificaciones de los últimos 90 días.')).toBeInTheDocument();
  });

  it('con el acceso vencido vuelve a pedir la placa y el celular', async () => {
    conPase();
    simularApi({ centro: [401, { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Tu acceso venció' } }] });
    abrir();

    expect(await screen.findByText('Tu acceso venció. Verifica de nuevo tu placa y celular.')).toBeInTheDocument();
    expect(sessionStorage.getItem(`zaru:historial:${SLUG}`)).toBeNull();
  });
});

describe('HU-38 CA2 · campana al abrir la app', () => {
  it('con acceso verificado muestra el número de avisos sin leer y lleva al centro', async () => {
    conPase();
    simularApi();
    abrir(`/s/${SLUG}`);

    const campana = await screen.findByRole('link', { name: 'Notificaciones, 2 sin leer' });
    expect(campana).toHaveTextContent('2');
    expect(campana).toHaveAttribute('href', `/s/${SLUG}/notificaciones`);
  });

  it('sin acceso la campana no consulta la API ni muestra contador', async () => {
    const api = simularApi();
    abrir(`/s/${SLUG}`);

    const campana = await screen.findByRole('link', { name: 'Notificaciones' });
    expect(campana).not.toHaveTextContent(/\d/);
    expect(api.mock.calls.some(([url]) => url.includes('/publico/cliente/notificaciones'))).toBe(false);
  });
});
