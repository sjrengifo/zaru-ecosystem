// HU-31 — Configuración de los estados que generan notificación.
// CA1: los cinco estados con interruptor; CA2: "listo" obligatorio; CA3: guardado inmediato
// y reversión visual si la API rechaza el cambio.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../src/services/api.js', () => ({ api }));

const { default: Notificaciones } = await import('../src/pages/Notificaciones.jsx');

const configuracion = () => [
  { estado: 'recibido', titulo: 'En cola', activo: true, obligatorio: false },
  { estado: 'en_lavado', titulo: 'Lavado iniciado', activo: true, obligatorio: false },
  { estado: 'secado', titulo: 'Secado', activo: true, obligatorio: false },
  { estado: 'listo', titulo: 'Listo para recoger', activo: true, obligatorio: true },
  { estado: 'entregado', titulo: 'Entregado', activo: true, obligatorio: false },
];

const abrir = () => render(<MemoryRouter><Notificaciones /></MemoryRouter>);

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
});

describe('HU-31 · configuración de notificaciones', () => {
  it('CA1: muestra los cinco estados del flujo con su interruptor', async () => {
    api.get.mockResolvedValue(configuracion());
    abrir();

    expect(await screen.findByRole('heading', { name: 'Configuración de notificaciones' })).toBeInTheDocument();
    expect(await screen.findAllByRole('switch')).toHaveLength(5);
    for (const titulo of ['En cola', 'Lavado iniciado', 'Secado', 'Listo para recoger', 'Entregado']) {
      expect(screen.getByRole('switch', { name: `Notificaciones de ${titulo}` })).toBeInTheDocument();
    }
    expect(api.get).toHaveBeenCalledWith('/configuracion/notificaciones');
  });

  it('si la carga falla muestra el error con un botón para reintentar, no una página vacía', async () => {
    api.get.mockRejectedValueOnce(new Error('Error interno del servidor'));
    abrir();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo cargar la configuración de notificaciones: Error interno del servidor');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();

    api.get.mockResolvedValueOnce(configuracion());
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findAllByRole('switch')).toHaveLength(5);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('CA2: "listo" se muestra como obligatorio y no se puede apagar', async () => {
    api.get.mockResolvedValue(configuracion());
    abrir();

    const listo = await screen.findByRole('switch', { name: 'Notificaciones de Listo para recoger' });
    expect(listo).toBeChecked();
    expect(listo).toBeDisabled();
    expect(screen.getByText('Obligatorio')).toBeInTheDocument();

    fireEvent.click(listo);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('CA3: guarda el cambio al instante y lo revierte si la API falla', async () => {
    api.get.mockResolvedValue(configuracion());
    api.put.mockRejectedValueOnce(new Error('No se pudo guardar la configuración'));
    abrir();

    const secado = await screen.findByRole('switch', { name: 'Notificaciones de Secado' });
    expect(secado).toBeChecked();

    fireEvent.click(secado);
    expect(secado).not.toBeChecked(); // cambio optimista mientras se guarda
    expect(api.put).toHaveBeenCalledWith('/configuracion/notificaciones', expect.arrayContaining([
      { estado: 'secado', activo: false },
    ]));

    expect(await screen.findByText('No se pudo guardar la configuración')).toBeInTheDocument();
    await waitFor(() => expect(secado).toBeChecked()); // vuelve a lo último guardado
  });

  it('CA3: al guardar bien confirma el cambio y mantiene el interruptor', async () => {
    api.get.mockResolvedValue(configuracion());
    api.put.mockImplementation(async (_ruta, lista) => configuracion().map((item) => ({
      ...item,
      activo: lista.find((cambio) => cambio.estado === item.estado)?.activo ?? item.activo,
    })));
    abrir();

    const enLavado = await screen.findByRole('switch', { name: 'Notificaciones de Lavado iniciado' });
    fireEvent.click(enLavado);

    expect(await screen.findByText('Aviso desactivado')).toBeInTheDocument();
    expect(enLavado).not.toBeChecked();
  });
});
