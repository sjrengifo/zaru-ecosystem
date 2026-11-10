// HU-18 — Seguimiento en tiempo real del estado del lavado (pantalla del cliente final).
// La API se simula con fetch y el flujo de eventos con un EventSource falso.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Seguimiento from '../src/pages/Seguimiento.jsx';
import TarjetaOrden from '../src/components/TarjetaOrden.jsx';
import { anuncioEtapa, avance, enlaceSeguimiento, esMasReciente, normalizarCodigo, vistaEtapa } from '../src/lib/seguimiento.js';

const ETAPAS = [
  ['recibido', 'En cola'],
  ['en_lavado', 'Lavado iniciado'],
  ['secado', 'Secado'],
  ['listo', 'Listo para recoger'],
  ['entregado', 'Entregado'],
];

function seguimiento(estado = 'recibido', version = 1) {
  const posicion = ETAPAS.findIndex(([e]) => e === estado);
  const terminado = estado === 'entregado';
  const [, titulo] = ETAPAS[posicion];
  return {
    codigo: '7KQ2M9XH4P',
    estado,
    etapa: { estado, titulo, descripcion: `Descripción de ${titulo}`, paso: posicion + 1, totalPasos: 5 },
    etapas: ETAPAS.map(([e, t], i) => ({
      estado: e,
      titulo: t,
      completada: i < posicion || (terminado && i === posicion),
      actual: i === posicion,
      omitida: false,
      at: i <= posicion ? `2026-11-08T14:${String(i * 10).padStart(2, '0')}:00Z` : null,
      terminadaAt:
        i < posicion || (terminado && i === posicion) ? `2026-11-08T14:${String((i + (terminado && i === posicion ? 0 : 1)) * 10).padStart(2, '0')}:00Z` : null,
    })),
    entregaEstimadaAt: '2026-11-08T14:40:00Z',
    vehiculo: { placa: 'ABC123', marca: 'Mazda', color: 'Rojo' },
    servicios: [{ nombre: 'Lavado general', precio: 30000 }],
    subtotal: 30000,
    descuento: 0,
    total: 30000,
    notaPago: 'El pago se realiza en el establecimiento',
    establecimiento: { nombre: 'Lavadero Norte', logoUrl: null, colorPrimario: '#0F766E', colorSecundario: '#0EA5E9' },
    version,
  };
}

/** EventSource falso: la prueba decide cuándo llega cada evento. */
class EventSourceFalso {
  static instancias = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.oyentes = {};
    this.cerrado = false;
    EventSourceFalso.instancias.push(this);
  }
  addEventListener(tipo, fn) {
    (this.oyentes[tipo] ??= []).push(fn);
  }
  emitir(tipo, datos) {
    for (const fn of this.oyentes[tipo] ?? []) fn({ data: JSON.stringify(datos) });
  }
  close() {
    this.cerrado = true;
    this.readyState = 2;
  }
}

const respuesta = (status, cuerpo) => Promise.resolve({ ok: status < 400, status, json: async () => cuerpo });

const abrir = (ruta = '/seguimiento/7KQ2M9XH4P') =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/seguimiento" element={<Seguimiento />} />
        <Route path="/seguimiento/:codigo" element={<Seguimiento />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  EventSourceFalso.instancias = [];
  vi.stubGlobal('EventSource', EventSourceFalso);
  vi.stubGlobal('fetch', vi.fn(() => respuesta(200, seguimiento())));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HU-18 · reglas de la pantalla', () => {
  it('normaliza el código que escribe el cliente', () => {
    expect(normalizarCodigo(' 7kq2-m9xh4p ')).toBe('7KQ2M9XH4P');
    expect(normalizarCodigo('abc')).toBeNull();
  });

  it('arma el enlace público con el origen del sitio', () => {
    expect(enlaceSeguimiento('7KQ2M9XH4P', 'https://zaru-panel.vercel.app')).toBe('https://zaru-panel.vercel.app/seguimiento/7KQ2M9XH4P');
  });

  it('calcula el avance y el anuncio de la etapa', () => {
    expect(avance(seguimiento('recibido'))).toBe(0);
    expect(avance(seguimiento('secado'))).toBe(50);
    expect(avance(seguimiento('entregado'))).toBe(100);
    expect(anuncioEtapa(seguimiento('secado'))).toBe('Tu vehículo ahora está en: Secado.');
  });

  it('un evento atrasado no devuelve la pantalla a una etapa anterior', () => {
    expect(esMasReciente(seguimiento('secado', 3), seguimiento('en_lavado', 2))).toBe(false);
    expect(esMasReciente(seguimiento('en_lavado', 2), seguimiento('secado', 3))).toBe(true);
  });
});

describe('HU-19 · línea de tiempo de las etapas del lavado', () => {
  const clases = (container) => [...container.querySelectorAll('.seg-paso')].map((li) => li.className.replace('seg-paso ', ''));
  const horas = (container) => [...container.querySelectorAll('.seg-paso-hora')].map((el) => el.firstChild?.nodeType === 3 ? el.firstChild.textContent : '');

  it('CA1: muestra todas las etapas en orden, con completadas, la actual resaltada y las pendientes en gris', async () => {
    fetch.mockImplementation(() => respuesta(200, seguimiento('secado', 3)));
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 2, name: 'Línea de tiempo' })).toBeInTheDocument();
    expect([...container.querySelectorAll('.seg-paso-titulo')].map((el) => el.textContent)).toEqual(ETAPAS.map(([, t]) => t));
    expect(clases(container)).toEqual(['seg-paso-hecho', 'seg-paso-hecho', 'seg-paso-actual', 'seg-paso-pendiente', 'seg-paso-pendiente']);
    expect(container.querySelector('[aria-current="step"] .seg-paso-titulo').textContent).toBe('Secado');
  });

  it('CA2: las etapas completadas muestran la hora en que terminaron', async () => {
    fetch.mockImplementation(() => respuesta(200, seguimiento('secado', 3)));
    const { container } = abrir();
    await screen.findByRole('heading', { level: 2, name: 'Línea de tiempo' });
    const [cola, lavado, secado, listo, entregado] = horas(container);
    expect(cola).toMatch(/^Terminó \d/);
    expect(lavado).toMatch(/^Terminó \d/);
    expect(cola).not.toBe(lavado);
    expect(secado).toMatch(/^Desde \d/);
    expect(listo).toBe('');
    expect(entregado).toBe('');
  });

  it('CA3: con el vehículo entregado, todas las etapas aparecen completadas con su hora', async () => {
    fetch.mockImplementation(() => respuesta(200, seguimiento('entregado', 5)));
    const { container } = abrir();
    await screen.findByRole('heading', { level: 1, name: 'Entregado' });
    expect(clases(container).every((c) => c === 'seg-paso-hecho')).toBe(true);
    expect(horas(container).every((h) => h.startsWith('Terminó '))).toBe(true);
  });

  it('vistaEtapa: un secado omitido dice "No aplica", completado solo si ya se entregó', () => {
    expect(vistaEtapa({ omitida: true, completada: false, actual: false })).toMatchObject({ clase: 'omitido', hora: 'No aplica' });
    expect(vistaEtapa({ omitida: true, completada: true, actual: false })).toMatchObject({ clase: 'hecho', hora: 'No aplica' });
    expect(vistaEtapa({ completada: false, actual: false })).toEqual({ clase: 'pendiente', hora: '', estadoLector: 'pendiente' });
  });
});

describe('HU-18 CA1 · indicador de la etapa actual', () => {
  it('muestra la etapa actual, el recorrido, el vehículo, el total y la nota de pago', async () => {
    abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'En cola' })).toBeInTheDocument();
    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance del lavado' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('Lavadero Norte')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('El pago se realiza en el establecimiento')).toBeInTheDocument();
    const pasos = screen.getAllByRole('listitem').filter((li) => li.classList.contains('seg-paso'));
    expect(pasos.map((li) => li.querySelector('.seg-paso-titulo').textContent)).toEqual(ETAPAS.map(([, t]) => t));
    expect(pasos[0]).toHaveAttribute('aria-current', 'step');
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/publico\/seguimiento\/7KQ2M9XH4P$/), expect.anything());
  });

  it('al entregar el vehículo, el paso "Entregado" aparece con su check', async () => {
    fetch.mockImplementation(() => respuesta(200, seguimiento('entregado', 5)));
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Entregado' })).toBeInTheDocument();
    const pasos = [...container.querySelectorAll('.seg-paso')];
    expect(pasos.every((li) => li.classList.contains('seg-paso-hecho'))).toBe(true);
    expect(pasos.every((li) => li.querySelector('.seg-paso-marca svg'))).toBe(true);
    expect(pasos[4]).toHaveAttribute('aria-current', 'step');
  });

  it('aplica los colores de la sede', async () => {
    const { container } = abrir();
    await screen.findByRole('heading', { level: 1, name: 'En cola' });
    expect(container.querySelector('.seg-contenido').style.getPropertyValue('--color-primario')).toBe('#0F766E');
  });

  it('un código inexistente o vencido muestra el aviso y permite escribir otro', async () => {
    fetch.mockImplementation(() => respuesta(404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'Seguimiento no encontrado' } }));
    abrir();
    expect(await screen.findByRole('heading', { name: 'No encontramos ese servicio' })).toBeInTheDocument();
    expect(screen.getByLabelText('Código de seguimiento')).toBeInTheDocument();
    expect(EventSourceFalso.instancias).toHaveLength(0);
  });

  it('sin código en la URL pide escribirlo y valida el formato', async () => {
    abrir('/seguimiento');
    expect(screen.getByRole('heading', { name: 'Sigue tu lavado' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Código de seguimiento'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: /consultar/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el código');
    fireEvent.change(screen.getByLabelText('Código de seguimiento'), { target: { value: '7kq2m9xh4p' } });
    fireEvent.click(screen.getByRole('button', { name: /consultar/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'En cola' })).toBeInTheDocument();
  });

  it('si la red falla, ofrece reintentar', async () => {
    fetch.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'En cola' })).toBeInTheDocument();
  });
});

describe('HU-18 CA2 · actualización automática', () => {
  it('cuando el operario cambia el estado, la pantalla se actualiza sin recargar', async () => {
    abrir();
    await screen.findByRole('heading', { level: 1, name: 'En cola' });
    const fuente = EventSourceFalso.instancias[0];
    expect(fuente.url).toMatch(/\/publico\/seguimiento\/7KQ2M9XH4P\/eventos$/);

    act(() => fuente.emitir('open'));
    expect(screen.getByText('En vivo')).toBeInTheDocument();

    act(() => fuente.emitir('estado', seguimiento('en_lavado', 2)));
    expect(screen.getByRole('heading', { level: 1, name: 'Lavado iniciado' })).toBeInTheDocument();
    expect(screen.getByText('Tu vehículo ahora está en: Lavado iniciado.')).toBeInTheDocument();

    act(() => fuente.emitir('estado', seguimiento('secado', 3)));
    expect(screen.getByRole('heading', { level: 1, name: 'Secado' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    // Solo hubo una consulta: los cambios llegaron por el flujo de eventos.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('si se pierde la conexión lo indica y vuelve a "En vivo" al reconectar', async () => {
    abrir();
    await screen.findByRole('heading', { level: 1, name: 'En cola' });
    const fuente = EventSourceFalso.instancias[0];
    act(() => {
      fuente.readyState = 0;
      fuente.onerror();
    });
    expect(screen.getByText('Reconectando…')).toBeInTheDocument();
    act(() => fuente.emitir('estado', seguimiento('listo', 4)));
    expect(screen.getByText('En vivo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Listo para recoger' })).toBeInTheDocument();
  });

  it('cuando el código vence con la pantalla abierta, cierra la conexión y lo informa', async () => {
    abrir();
    await screen.findByRole('heading', { level: 1, name: 'En cola' });
    const fuente = EventSourceFalso.instancias[0];
    act(() => fuente.emitir('fin', {}));
    expect(fuente.cerrado).toBe(true);
    expect(screen.getByRole('heading', { name: 'No encontramos ese servicio' })).toBeInTheDocument();
  });

  it('al salir de la pantalla cierra la conexión', async () => {
    const { unmount } = abrir();
    await screen.findByRole('heading', { level: 1, name: 'En cola' });
    const fuente = EventSourceFalso.instancias[0];
    unmount();
    expect(fuente.cerrado).toBe(true);
  });

  it('sin soporte de eventos en el navegador, consulta periódicamente', async () => {
    vi.stubGlobal('EventSource', undefined);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      abrir();
      await screen.findByRole('heading', { level: 1, name: 'En cola' });
      fetch.mockImplementation(() => respuesta(200, seguimiento('en_lavado', 2)));
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Lavado iniciado' })).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('HU-20 · tiempo estimado de entrega', () => {
  it('CA1: muestra la hora estimada de entrega en la hora de Bogotá', async () => {
    abrir();
    await screen.findByRole('heading', { level: 1, name: 'En cola' });
    expect(screen.getByText(/Entrega estimada: 09:40/)).toBeInTheDocument();
  });

  it('CA2: una demora actualiza la hora estimada sin recargar', async () => {
    abrir();
    await screen.findByRole('heading', { level: 1, name: 'En cola' });
    const fuente = EventSourceFalso.instancias[0];

    act(() =>
      fuente.emitir('estado', {
        ...seguimiento('en_lavado', 2),
        entregaEstimadaAt: '2026-11-08T15:15:00Z',
      }),
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Lavado iniciado' })).toBeInTheDocument();
    expect(screen.getByText(/Entrega estimada: 10:15/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('CA3: con el vehículo listo o entregado no muestra una hora estimada', async () => {
    fetch.mockImplementation(() => respuesta(200, seguimiento('listo', 4)));
    const { unmount } = abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Listo para recoger' })).toBeInTheDocument();
    expect(screen.queryByText(/Entrega estimada/)).not.toBeInTheDocument();
    unmount();

    fetch.mockImplementation(() => respuesta(200, seguimiento('entregado', 5)));
    abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Entregado' })).toBeInTheDocument();
    expect(screen.queryByText(/Entrega estimada/)).not.toBeInTheDocument();
  });
});

describe('HU-18 · enlace en el tablero del operario', () => {
  const orden = (extra = {}) => ({
    id: 'o1', estado: 'en_lavado', estado_desde: new Date().toISOString(), created_at: new Date().toISOString(),
    total: 30000, codigo_seguimiento: '7KQ2M9XH4P', vehiculos: { placa: 'ABC123' },
    orden_servicios: [{ servicios: { nombre: 'Lavado' } }], ...extra,
  });

  it('copia el enlace público de seguimiento para compartirlo con el cliente', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<TarjetaOrden orden={orden()} onAvanzar={() => {}} avanzando={null} ahora={new Date()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar el enlace de seguimiento del vehículo ABC123' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/seguimiento/7KQ2M9XH4P`));
    expect(await screen.findByText('Enlace de seguimiento copiado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir el seguimiento del vehículo ABC123' })).toHaveAttribute(
      'href',
      `${window.location.origin}/seguimiento/7KQ2M9XH4P`,
    );
  });

  it('una orden entregada solo muestra el código', () => {
    render(<TarjetaOrden orden={orden({ estado: 'entregado' })} onAvanzar={() => {}} avanzando={null} ahora={new Date()} />);
    expect(screen.getByText('7KQ2M9XH4P')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copiar el enlace/i })).not.toBeInTheDocument();
  });
});
