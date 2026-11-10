// HU-17 — Acceso a la plataforma móvil con la placa o el celular, sin contraseña.
// La API se simula con fetch; el seguimiento (HU-18) se reemplaza por una pantalla marcador.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import AccesoCliente from '../src/pages/AccesoCliente.jsx';
import { cuerpoBusqueda, enlaceSede, errorBusqueda, formatoCelular, limpiarCelular, limpiarPlaca } from '../src/lib/accesoCliente.js';

const SEDE = { slug: 'lavadero-norte', nombre: 'Lavadero Norte', logoUrl: null, colorPrimario: '#0F766E', colorSecundario: null };

function respuesta(status, cuerpo) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });
}

/** Simula la API: GET de la sede y POST de la búsqueda según lo que se configure en cada prueba. */
function simularApi({ sede = [200, SEDE], buscar = [200, { sede: SEDE, resultados: [{ codigo: 'K7Q2M9XH4P', placa: 'ABC123' }] }] } = {}) {
  const fetchFalso = vi.fn((url, opciones = {}) => {
    if (opciones.method === 'POST') return respuesta(...buscar);
    return respuesta(...sede);
  });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

function SeguimientoMarcador() {
  const { codigo } = useParams();
  return <p>Seguimiento {codigo}</p>;
}

function abrir(ruta = '/s/lavadero-norte') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/s/:slug" element={<AccesoCliente />} />
        <Route path="/seguimiento/:codigo" element={<SeguimientoMarcador />} />
        <Route path="/seguimiento" element={<p>Buscar por código</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const campo = () => screen.getByRole('textbox');
const enviar = () => fireEvent.click(screen.getByRole('button', { name: /Ver mi vehículo/ }));

beforeEach(() => {
  document.title = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reglas de la pantalla', () => {
  it('limpia la placa y el celular mientras el cliente escribe', () => {
    expect(limpiarPlaca('abc-123')).toBe('ABC123');
    expect(limpiarPlaca('abc 123 456')).toBe('ABC1234');
    expect(limpiarCelular('+57 300 123 4567')).toBe('3001234567');
    expect(formatoCelular('3001234567')).toBe('300 123 4567');
  });

  it('valida antes de llamar a la API', () => {
    expect(errorBusqueda('placa', '')).toMatch(/Escribe la placa/);
    expect(errorBusqueda('placa', 'AB1')).toMatch(/entre 5 y 7/);
    expect(errorBusqueda('placa', 'ABC123')).toBe('');
    expect(errorBusqueda('celular', '601234')).toMatch(/10 dígitos/);
    expect(errorBusqueda('celular', '3001234567')).toBe('');
    expect(cuerpoBusqueda('celular', '300 123 4567')).toEqual({ celular: '3001234567' });
  });

  it('CA2: el enlace de la sede es /s/{slug}', () => {
    expect(enlaceSede('lavadero-norte', 'https://zaru-panel.vercel.app')).toBe('https://zaru-panel.vercel.app/s/lavadero-norte');
  });
});

describe('acceso con la placa o el celular', () => {
  it('CA2/CA3: abre el enlace de la sede con su nombre y pide la placa', async () => {
    simularApi();
    abrir();
    expect(await screen.findByText('Lavadero Norte')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sigue tu vehículo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Placa/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Placa del vehículo')).toBeInTheDocument();
    expect(document.title).toBe('Lavadero Norte · Sigue tu vehículo');
  });

  it('CA1: con la placa entra directo al seguimiento de su vehículo', async () => {
    const api = simularApi();
    abrir();
    await screen.findByText('Lavadero Norte');
    fireEvent.change(campo(), { target: { value: 'abc-123' } });
    expect(campo()).toHaveValue('ABC123');
    enviar();
    expect(await screen.findByText('Seguimiento K7Q2M9XH4P')).toBeInTheDocument();
    const [url, opciones] = api.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(url).toMatch(/\/publico\/sedes\/lavadero-norte\/buscar$/);
    expect(JSON.parse(opciones.body)).toEqual({ placa: 'ABC123' });
  });

  it('CA1: con el celular y varios vehículos en servicio, deja elegir cuál ver', async () => {
    const api = simularApi({
      buscar: [200, { sede: SEDE, resultados: [{ codigo: 'P4HX9M2Q7K', placa: 'XYZ98D' }, { codigo: 'K7Q2M9XH4P', placa: 'ABC123' }] }],
    });
    abrir();
    await screen.findByText('Lavadero Norte');
    fireEvent.click(screen.getByRole('radio', { name: /Celular/ }));
    expect(screen.getByLabelText('Número de celular')).toBeInTheDocument();
    fireEvent.change(campo(), { target: { value: '3001234567' } });
    expect(campo()).toHaveValue('300 123 4567');
    enviar();
    expect(await screen.findByText(/Tienes 2 vehículos en servicio/)).toBeInTheDocument();
    expect(JSON.parse(api.mock.calls.find(([, o]) => o?.method === 'POST')[1].body)).toEqual({ celular: '3001234567' });
    fireEvent.click(screen.getByRole('link', { name: /XYZ98D/ }));
    expect(await screen.findByText('Seguimiento P4HX9M2Q7K')).toBeInTheDocument();
  });

  it('CA4: una placa sin servicio activo muestra el mensaje y no sale de la pantalla', async () => {
    simularApi({ buscar: [404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'El vehículo no se encuentra en servicio actualmente' } }] });
    abrir();
    await screen.findByText('Lavadero Norte');
    fireEvent.change(campo(), { target: { value: 'ZZZ999' } });
    enviar();
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('El vehículo no se encuentra en servicio actualmente.');
    expect(aviso).toHaveTextContent('Revisa que la placa esté bien escrita o pregunta en la recepción del car wash.');
    expect(campo()).toHaveValue('ZZZ999');
  });

  it('no llama a la API si la placa está incompleta, y explica el formato', async () => {
    const api = simularApi();
    abrir();
    await screen.findByText('Lavadero Norte');
    fireEvent.change(campo(), { target: { value: 'AB1' } });
    enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent(/entre 5 y 7/);
    expect(api.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
  });

  it('avisa cuando se agotaron los intentos (429)', async () => {
    simularApi({ buscar: [429, { error: { codigo: 'LIMITE_EXCEDIDO', mensaje: 'Hiciste demasiadas búsquedas sin resultado. Espera unos minutos e inténtalo de nuevo' } }] });
    abrir();
    await screen.findByText('Lavadero Norte');
    fireEvent.change(campo(), { target: { value: 'ABC123' } });
    enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Espera unos minutos/);
  });

  it('un enlace de una sede inexistente o suspendida lo dice y ofrece el código de seguimiento', async () => {
    simularApi({ sede: [404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'Sede no encontrado' } }] });
    abrir('/s/no-existe');
    expect(await screen.findByRole('heading', { name: 'Este enlace no está disponible' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /código de seguimiento/ }));
    await waitFor(() => expect(screen.getByText('Buscar por código')).toBeInTheDocument());
  });
});
