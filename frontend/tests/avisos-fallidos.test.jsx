// HU-33 CA3 — Alerta del dashboard con los avisos que no llegaron por ningún canal.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const api = { get: vi.fn(), patch: vi.fn() };
let perfil = { rol: 'admin' };
vi.mock('../src/services/api.js', () => ({ api }));
vi.mock('../src/hooks/usePerfil.js', () => ({ usePerfil: () => perfil }));

const { default: AvisosFallidos } = await import('../src/components/AvisosFallidos.jsx');
const { canalesIntentados, haceCuanto, enlaceLlamada, celularLegible } = await import('../src/lib/avisosFallidos.js');

const AHORA = new Date('2026-11-12T20:30:00Z');
const ALERTA = {
  id: 'n-1',
  ordenId: 'o-1',
  placa: 'XYZ987',
  cliente: 'Laura Gómez',
  celular: '3003330001',
  canales: ['correo', 'sms'],
  motivo: '503 Service Unavailable',
  falloAt: '2026-11-12T20:18:00Z',
};

beforeEach(() => {
  perfil = { rol: 'admin' };
  api.get.mockReset();
  api.patch.mockReset();
});

describe('textos de la alerta', () => {
  it('nombra los canales intentados en español', () => {
    expect(canalesIntentados(['correo'])).toBe('correo');
    expect(canalesIntentados(['correo', 'sms'])).toBe('correo y SMS');
    expect(canalesIntentados(['push', 'sms', 'correo'])).toBe('notificación push, SMS y correo');
  });

  it('dice hace cuánto falló', () => {
    expect(haceCuanto('2026-11-12T20:30:00Z', AHORA)).toBe('hace un momento');
    expect(haceCuanto('2026-11-12T20:18:00Z', AHORA)).toBe('hace 12 min');
    expect(haceCuanto('2026-11-12T17:00:00Z', AHORA)).toBe('hace 3 h');
  });

  it('el celular se muestra legible y se puede llamar', () => {
    expect(celularLegible('3003330001')).toBe('300 333 0001');
    expect(enlaceLlamada('300 333 0001')).toBe('tel:+573003330001');
  });
});

describe('CA3: alerta en el dashboard del administrador', () => {
  it('muestra placa, cliente, canales y el celular para llamarlo', async () => {
    api.get.mockResolvedValue({ alertas: [ALERTA] });
    render(<AvisosFallidos ahora={AHORA} />);
    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByRole('heading')).toHaveTextContent('Un cliente no recibió el aviso de vehículo listo');
    expect(within(alerta).getByText('XYZ987')).toBeInTheDocument();
    expect(within(alerta).getByText('Laura Gómez')).toBeInTheDocument();
    expect(within(alerta).getByText('Falló por correo y SMS · hace 12 min')).toBeInTheDocument();
    expect(within(alerta).getByRole('link', { name: '300 333 0001' })).toHaveAttribute('href', 'tel:+573003330001');
    expect(api.get).toHaveBeenCalledWith('/notificaciones/fallidas');
  });

  it('"Ya lo contacté" la marca como atendida y desaparece', async () => {
    api.get.mockResolvedValue({ alertas: [ALERTA, { ...ALERTA, id: 'n-2', placa: 'ABC123' }] });
    api.patch.mockResolvedValue({ id: 'n-1', atendidaAt: AHORA.toISOString() });
    render(<AvisosFallidos ahora={AHORA} />);
    expect(await screen.findByText('2 clientes no recibieron el aviso de vehículo listo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya contacté al cliente de XYZ987' }));
    await waitFor(() => expect(screen.queryByText('XYZ987')).not.toBeInTheDocument());
    expect(api.patch).toHaveBeenCalledWith('/notificaciones/fallidas/n-1/atendida');
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });

  it('sin alertas no muestra nada', async () => {
    api.get.mockResolvedValue({ alertas: [] });
    const { container } = render(<AvisosFallidos ahora={AHORA} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('el operario no ve la alerta ni consulta la API', () => {
    perfil = { rol: 'operario' };
    const { container } = render(<AvisosFallidos ahora={AHORA} />);
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('si la consulta falla, el tablero sigue sin la alerta', async () => {
    api.get.mockRejectedValue(new Error('sin red'));
    const { container } = render(<AvisosFallidos ahora={AHORA} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
