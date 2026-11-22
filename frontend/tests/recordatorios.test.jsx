// HU-36 CA3 — Página pública para dejar de recibir recordatorios de un vehículo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const servicio = { consultarRecordatorio: vi.fn(), desactivarRecordatorio: vi.fn() };
vi.mock('../src/services/recordatorios.js', () => servicio);

const { default: BajaRecordatorios } = await import('../src/pages/BajaRecordatorios.jsx');

const DATOS = {
  vehiculo: { placa: 'XYZ987' },
  activos: true,
  proximaFecha: '2026-11-20',
  sede: { nombre: 'Lavadero Norte', logoUrl: null, colorPrimario: '#0F766E', colorSecundario: null },
};

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/recordatorios/token-firmado/desactivar']}>
      <Routes>
        <Route path="/recordatorios/:token/desactivar" element={<BajaRecordatorios />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  servicio.consultarRecordatorio.mockReset();
  servicio.desactivarRecordatorio.mockReset();
});
afterEach(cleanup);

describe('HU-36 baja de recordatorios', () => {
  it('muestra el vehículo y la fecha estimada antes de confirmar', async () => {
    servicio.consultarRecordatorio.mockResolvedValue(DATOS);
    renderizar();

    expect(await screen.findByRole('heading', { name: /XYZ987/ })).toBeInTheDocument();
    expect(screen.getByText('20 de nov de 2026')).toBeInTheDocument();
  });

  it('desactiva solo al confirmar y muestra la confirmación', async () => {
    servicio.consultarRecordatorio.mockResolvedValue(DATOS);
    servicio.desactivarRecordatorio.mockResolvedValue({
      ...DATOS,
      activos: false,
      desactivadoAt: '2026-11-11T15:00:00Z',
    });
    renderizar();

    fireEvent.click(await screen.findByRole('button', { name: /no volver a recordarme/i }));

    await waitFor(() => expect(servicio.desactivarRecordatorio).toHaveBeenCalledWith('token-firmado'));
    expect(await screen.findByText(/no volveremos a recordarte este vehículo/i)).toBeInTheDocument();
  });
});
