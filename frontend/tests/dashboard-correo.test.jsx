// HU-46 — El dashboard informa el resultado del correo sin bloquear al operario.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('../src/services/api.js', () => ({ api }));
vi.mock('../src/lib/supabase.js', () => {
  const canal = { on: () => canal, subscribe: () => canal };
  return { supabase: { channel: () => canal, removeChannel: () => {} } };
});

const { default: Dashboard } = await import('../src/pages/Dashboard.jsx');

const orden = (extra = {}) => ({
  id: 'o1', estado: 'en_lavado', estadoDesde: '2026-11-03T15:00:00Z', creadaEn: '2026-11-03T14:30:00Z', total: 30000,
  vehiculo: { id: 'v1', placa: 'ABC123' }, cliente: { id: 'c1', nombre: 'Ana', tieneCorreo: true },
  servicios: [], correos: { 'orden.recibida': 'enviada' }, ...extra,
});

const abrir = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
  api.post.mockReset();
});

describe('HU-46 · dashboard', () => {
  it('muestra en cada tarjeta el estado del correo al cliente', async () => {
    api.get.mockResolvedValue([orden(), orden({ id: 'o2', estado: 'recibido', vehiculo: { placa: 'XYZ987' }, cliente: { nombre: 'Luis', tieneCorreo: false }, correos: {} })]);
    abrir();
    expect(await screen.findByText(/Correo enviado · ingreso/)).toBeInTheDocument();
    expect(screen.getByText(/Sin correo/)).toBeInTheDocument();
  });

  it('CA2: al marcar como listo confirma que se envía el aviso al cliente', async () => {
    api.get.mockResolvedValue([orden()]);
    api.patch.mockResolvedValue({ id: 'o1', estado: 'listo', notificacion: { canal: 'correo', estado: 'pendiente', destino: 'a***@x.co' } });
    abrir();

    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como listo' }));

    expect(api.patch).toHaveBeenCalledWith('/ordenes/o1/estado', { estado: 'listo' });
    expect(await screen.findByText('ABC123 pasó a Listo')).toBeInTheDocument();
    expect(screen.getByText('Se está enviando el correo a a***@x.co.')).toBeInTheDocument();
  });

  it('CA3: si el cliente no tiene correo, el cambio se confirma y solo se advierte', async () => {
    api.get.mockResolvedValue([orden()]);
    api.patch.mockResolvedValue({ id: 'o1', estado: 'listo', notificacion: { canal: 'correo', estado: 'omitida', motivo: 'sin_correo' } });
    abrir();

    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como listo' }));

    expect(await screen.findByText('ABC123 pasó a Listo')).toBeInTheDocument();
    expect(screen.getByText(/no tiene correo registrado/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // no es un error
  });

  it('CA1: registra el ingreso con los servicios elegidos y confirma el correo', async () => {
    api.get.mockImplementation(async (ruta) => {
      if (ruta === '/ordenes/activas') return [];
      if (ruta === '/servicios') return [{ id: 's1', nombre: 'Lavado', precio: '30000', activo: true }, { id: 's2', nombre: 'Viejo', precio: '1', activo: false }];
      if (ruta.startsWith('/vehiculos')) return [{ id: 'v1', placa: 'ABC123', clientes: { nombre: 'Ana' } }];
      return [];
    });
    api.post.mockResolvedValue({ id: 'o1', vehiculo: { placa: 'ABC123' }, notificacion: { estado: 'pendiente', destino: 'a***@x.co' } });
    abrir();

    fireEvent.click(await screen.findByRole('button', { name: '+ Ingresar vehículo' }));
    fireEvent.change(screen.getByLabelText('Placa del vehículo'), { target: { value: 'abc' } });
    fireEvent.click(await screen.findByRole('button', { name: /ABC123/ }));
    expect(screen.queryByText('Viejo')).not.toBeInTheDocument(); // servicios desactivados no se ofrecen
    fireEvent.click(screen.getByLabelText(/Lavado/));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ordenes', { vehiculoId: 'v1', servicios: ['s1'] }));
    expect(await screen.findByText('Ingreso de ABC123 registrado')).toBeInTheDocument();
  });
});
