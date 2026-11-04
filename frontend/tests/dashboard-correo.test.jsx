// HU-46 — El dashboard informa el resultado del correo sin bloquear al operario.
// El tablero (HU-09) lee las órdenes con services/dashboard.js (forma de Supabase: snake_case y
// relaciones anidadas); por eso se simula ESE servicio y no api.get('/ordenes/activas').
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { api, listarOrdenesDelTablero } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  listarOrdenesDelTablero: vi.fn(),
}));
vi.mock('../src/services/api.js', () => ({ api }));
vi.mock('../src/services/dashboard.js', () => ({ listarOrdenesDelTablero }));
vi.mock('../src/lib/supabase.js', () => {
  const canal = { on: () => canal, subscribe: () => canal };
  return { supabase: { channel: () => canal, removeChannel: () => {} } };
});

const { default: Dashboard } = await import('../src/pages/Dashboard.jsx');

// `estado_desde` reciente: con una fecha vieja saltaría la alerta de demora (HU-11, role="alert")
// y ensuciaría las aserciones sobre alertas de error.
const orden = (extra = {}) => ({
  id: 'o1', vehiculo_id: 'v1', estado: 'secado', estado_desde: new Date().toISOString(), created_at: new Date().toISOString(),
  total: 30000, codigo_seguimiento: 'ABCDEFGHJK', entrega_estimada_at: null, entregada_at: null,
  vehiculos: { placa: 'ABC123' }, orden_servicios: [{ duracion_min: 30, servicios: { nombre: 'Lavado' } }], ...extra,
});

const abrir = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
  api.post.mockReset();
  listarOrdenesDelTablero.mockReset();
});

describe('HU-46 · dashboard', () => {
  const aviso = (evento, estado) => ({ evento, estado, created_at: new Date().toISOString() });

  it('muestra en cada tarjeta el estado del correo al cliente', async () => {
    listarOrdenesDelTablero.mockResolvedValue([
      orden({ id: 'o1', estado: 'listo', notificaciones: [aviso('orden.recibida', 'enviada'), aviso('orden.lista', 'enviada')] }),
      orden({ id: 'o2', estado: 'recibido', vehiculos: { placa: 'XYZ987' }, notificaciones: [aviso('orden.recibida', 'enviada')] }),
      orden({ id: 'o3', estado: 'listo', vehiculos: { placa: 'QWE456' }, notificaciones: [aviso('orden.lista', 'fallida')] }),
    ]);
    abrir();
    // Desde "listo" la tarjeta muestra el aviso de listo (el que el cliente espera), no el del ingreso.
    expect(await screen.findByText('Correo enviado · listo')).toBeInTheDocument();
    expect(screen.getByText('Correo enviado · ingreso')).toBeInTheDocument();
    expect(screen.getByText('Correo no enviado · listo')).toBeInTheDocument();
  });

  it('una orden sin correos registrados no muestra etiqueta', async () => {
    listarOrdenesDelTablero.mockResolvedValue([orden({ notificaciones: [] })]);
    abrir();
    await screen.findByText('ABC123');
    expect(screen.queryByText(/Correo/)).not.toBeInTheDocument();
  });

  it('pasa de "Enviando correo" a "Correo enviado" sin recargar la página', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      listarOrdenesDelTablero
        .mockResolvedValueOnce([orden({ estado: 'listo', notificaciones: [aviso('orden.lista', 'pendiente')] })])
        .mockResolvedValue([orden({ estado: 'listo', notificaciones: [aviso('orden.lista', 'enviada')] })]);
      abrir();

      expect(await screen.findByText('Enviando correo · listo')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); }); // espera de la re-consulta mientras hay un correo en curso
      expect(await screen.findByText('Correo enviado · listo')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('CA2: al marcar como listo confirma que se envía el aviso al cliente', async () => {
    listarOrdenesDelTablero.mockResolvedValue([orden()]);
    api.patch.mockResolvedValue({ id: 'o1', estado: 'listo', vehiculo: { placa: 'ABC123' }, notificacion: { canal: 'correo', estado: 'pendiente', destino: 'a***@x.co' } });
    abrir();

    // `secado` es el estado previo a `listo`: el botón se llama "Avanzar a Listo".
    fireEvent.click(await screen.findByRole('button', { name: 'Avanzar a Listo' }));

    expect(api.patch).toHaveBeenCalledWith('/ordenes/o1/estado', { estado: 'listo' });
    expect(await screen.findByText('Estado actualizado')).toBeInTheDocument();
    expect(screen.getByText(/ABC123 · Listo/)).toBeInTheDocument();
    expect(screen.getByText(/Se está enviando el correo a a\*\*\*@x\.co\./)).toBeInTheDocument();
  });

  it('CA3: si el cliente no tiene correo, el cambio se confirma y solo se advierte', async () => {
    listarOrdenesDelTablero.mockResolvedValue([orden()]);
    api.patch.mockResolvedValue({ id: 'o1', estado: 'listo', vehiculo: { placa: 'ABC123' }, notificacion: { canal: 'correo', estado: 'omitida', motivo: 'sin_correo' } });
    abrir();

    fireEvent.click(await screen.findByRole('button', { name: 'Avanzar a Listo' }));

    expect(await screen.findByText('Estado actualizado')).toBeInTheDocument();
    expect(screen.getByText(/no tiene correo registrado/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // no es un error
  });

  it('CA1: registra el ingreso con los servicios elegidos y confirma el correo', async () => {
    listarOrdenesDelTablero.mockResolvedValue([]);
    api.get.mockImplementation(async (ruta) => {
      if (ruta === '/servicios') {
        return [
          { id: 's1', nombre: 'Lavado', precio: '30000', duracion_min: 30, activo: true },
          { id: 's2', nombre: 'Viejo', precio: '1', duracion_min: 5, activo: false },
        ];
      }
      if (ruta.startsWith('/vehiculos')) return [{ id: 'v1', placa: 'ABC123', tipo: 'carro', clientes: { nombre: 'Ana' } }];
      return []; // promociones vigentes y política de datos
    });
    api.post.mockResolvedValue({
      id: 'o1', total: 30000, codigoSeguimiento: 'ABCDEFGHJK', vehiculo: { placa: 'ABC123' },
      notificacion: { estado: 'pendiente', destino: 'a***@x.co' },
    });
    abrir();

    fireEvent.click(await screen.findByRole('button', { name: '+ Ingresar vehículo' }));
    // El formulario ya no autocompleta: se escribe la placa y se pulsa "Buscar placa".
    fireEvent.change(screen.getByLabelText(/^Placa/), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar placa' }));
    expect(await screen.findByText(/Vehículo registrado/)).toBeInTheDocument();

    fireEvent.click(await screen.findByLabelText(/Lavado/));
    expect(screen.queryByText('Viejo')).not.toBeInTheDocument(); // servicios desactivados no se ofrecen
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));

    // El cuerpo usa `servicioIds` (contrato de POST /ordenes) y manda observaciones nulas si no hay.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ordenes', { vehiculoId: 'v1', servicioIds: ['s1'], observaciones: null }));
    expect(await screen.findByText('Vehículo ingresado')).toBeInTheDocument();
    expect(screen.getByText(/ABC123 .* Código ABCDEFGHJK/)).toBeInTheDocument();
    expect(screen.getByText(/Se está enviando el correo a a\*\*\*@x\.co/)).toBeInTheDocument();
  });
});
