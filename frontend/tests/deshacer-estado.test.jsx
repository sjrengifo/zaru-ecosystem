// HU-10 — Deshacer el último avance desde la tarjeta del tablero (el aviso al cliente lo corrige HU-28 CA3).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TarjetaOrden from '../src/components/TarjetaOrden.jsx';

const ORDEN = {
  id: 'o1',
  estado: 'en_lavado',
  estado_desde: '2026-11-21T15:00:00Z',
  created_at: '2026-11-21T14:55:00Z',
  total: 25000,
  vehiculos: { placa: 'ABC123' },
  orden_servicios: [{ servicios: { nombre: 'Lavado básico' } }],
};

function abrir(props = {}) {
  const onAvanzar = vi.fn();
  const onDeshacer = vi.fn();
  render(
    <MemoryRouter>
      <TarjetaOrden
        orden={ORDEN}
        onAvanzar={onAvanzar}
        onDeshacer={onDeshacer}
        avanzando={null}
        ahora={new Date('2026-11-21T15:00:10Z')}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onAvanzar, onDeshacer };
}

describe('HU-10 · deshacer el último avance', () => {
  it('justo después de avanzar muestra "Deshacer" con los segundos que quedan', () => {
    const { onDeshacer } = abrir({ segundosDeshacer: 42 });
    const boton = screen.getByRole('button', { name: /Deshacer el cambio a En lavado de ABC123. Quedan 42 segundos/ });
    expect(boton).toHaveTextContent('42 s');

    fireEvent.click(boton);
    expect(onDeshacer).toHaveBeenCalledWith(ORDEN);
    // "Avanzar" sigue disponible: deshacer no reemplaza el flujo normal.
    expect(screen.getByRole('button', { name: /Avanzar a/ })).toBeInTheDocument();
  });

  it('vencido el tiempo (o si el cambio no lo hizo este tablero) no aparece', () => {
    abrir({ segundosDeshacer: 0 });
    expect(screen.queryByRole('button', { name: /Deshacer/ })).not.toBeInTheDocument();
  });

  it('mientras se guarda otra acción queda deshabilitado', () => {
    abrir({ segundosDeshacer: 30, avanzando: 'otra-orden' });
    expect(screen.getByRole('button', { name: /Deshacer/ })).toBeDisabled();
  });
});
