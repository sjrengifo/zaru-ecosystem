// HU-28 CA2 (ZARU-17) — Dirección de la sede en Branding: la llevan los avisos de "listo".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/services/api.js', () => ({ api: { put: vi.fn() } }));
const { api } = await import('../src/services/api.js');
const { default: DireccionSede } = await import('../src/components/DireccionSede.jsx');

const SEDE = { id: 'e1', nombre: 'Lavadero Norte', direccion: null };

function abrir({ establecimiento = SEDE, puedeEditar = true } = {}) {
  const setEstablecimiento = vi.fn();
  const alGuardar = vi.fn();
  render(<DireccionSede establecimiento={establecimiento} setEstablecimiento={setEstablecimiento} puedeEditar={puedeEditar} alGuardar={alGuardar} />);
  return { setEstablecimiento, alGuardar };
}

beforeEach(() => api.put.mockReset());

describe('HU-28 CA2 · dirección de la sede', () => {
  it('el administrador la escribe y la guarda con los espacios normalizados', async () => {
    api.put.mockResolvedValue({ ...SEDE, direccion: 'Cra 10 # 5-20' });
    const { setEstablecimiento, alGuardar } = abrir();

    const boton = screen.getByRole('button', { name: 'Guardar dirección' });
    expect(boton).toBeDisabled(); // sin cambios no se guarda
    fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: '  Cra 10   # 5-20 ' } });
    fireEvent.click(boton);

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/establecimiento/direccion', { direccion: 'Cra 10 # 5-20' }));
    expect(setEstablecimiento).toHaveBeenCalledWith(expect.objectContaining({ direccion: 'Cra 10 # 5-20' }));
    expect(alGuardar).toHaveBeenCalledWith(expect.stringContaining('verán esta dirección'));
  });

  it('una dirección de más de 160 caracteres muestra el error junto al campo y no llama a la API', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'x'.repeat(161) } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    expect(await screen.findByText('La dirección puede tener hasta 160 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Dirección')).toHaveAttribute('aria-invalid', 'true');
    expect(api.put).not.toHaveBeenCalled();
  });

  it('un operario la ve pero no la puede cambiar', () => {
    abrir({ establecimiento: { ...SEDE, direccion: 'Cra 10 # 5-20' }, puedeEditar: false });
    expect(screen.getByLabelText('Dirección')).toHaveValue('Cra 10 # 5-20');
    expect(screen.getByLabelText('Dirección')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar dirección' })).not.toBeInTheDocument();
  });
});
