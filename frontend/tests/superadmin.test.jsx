// HU-57 — Panel de superadministración: resumen, filtros, registro y suspensión con confirmación.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/services/api.js', () => ({ api }));
vi.mock('../src/lib/supabase.js', () => ({ supabase: { auth: { signOut: vi.fn() } } }));

const { default: Superadmin } = await import('../src/pages/Superadmin.jsx');

const LISTA = [
  { id: 'e1', nombre: 'Lavadero Norte', plan: 'basico', estado: 'prueba', dias_restantes: 2, prueba_inicia_at: '2026-10-20T00:00:00Z', prueba_finaliza_at: '2026-11-05T00:00:00Z', created_at: '2026-10-20T00:00:00Z', administrador: { nombre: 'ana', correo: 'ana@norte.co', invitacionAceptada: false } },
  { id: 'e2', nombre: 'AutoSpa Sur', plan: 'empresarial', estado: 'activo', dias_restantes: null, created_at: '2026-10-01T00:00:00Z', administrador: { nombre: 'beto', correo: 'beto@sur.co', invitacionAceptada: true } },
  { id: 'e3', nombre: 'Brillo Total', plan: 'intermedio', estado: 'suspendido', dias_restantes: null, created_at: '2026-09-01T00:00:00Z', administrador: null },
];

const abrir = () => render(<MemoryRouter><Superadmin /></MemoryRouter>);

beforeEach(() => {
  api.get.mockReset().mockResolvedValue(LISTA);
  api.post.mockReset();
});

describe('HU-57 · panel de superadministración', () => {
  it('CA2: resume por estado y avisa de las pruebas que vencen pronto', async () => {
    abrir();
    await screen.findByText('Lavadero Norte');
    const resumen = screen.getByRole('group', { name: 'Filtrar por estado' });
    expect(within(resumen).getByRole('button', { name: /3\s*Todos/ })).toBeInTheDocument();
    expect(within(resumen).getByRole('button', { name: /1\s*Suspendidos/ })).toBeInTheDocument();
    expect(screen.getByText('Vence en 2 días')).toBeInTheDocument();
    expect(screen.getByText(/Un periodo de prueba vence/)).toBeInTheDocument();
  });

  it('muestra el administrador y si su invitación está pendiente; permite reenviarla', async () => {
    api.post.mockResolvedValue({ correo: 'ana@norte.co', enviada: true });
    abrir();
    await screen.findByText('ana@norte.co');
    expect(screen.getByText('Invitación pendiente')).toBeInTheDocument();
    expect(screen.getByText('Cuenta activa')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar invitación' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/superadmin/establecimientos/e1/reenviar-invitacion'));
    expect(await screen.findByText('Invitación reenviada')).toBeInTheDocument();
  });

  it('filtra por estado con las tarjetas y busca por nombre', async () => {
    abrir();
    await screen.findByText('Lavadero Norte');
    fireEvent.click(screen.getByRole('button', { name: /Activos/ }));
    expect(screen.queryByText('Lavadero Norte')).not.toBeInTheDocument();
    expect(screen.getByText('AutoSpa Sur')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    fireEvent.change(screen.getByLabelText('Buscar establecimiento'), { target: { value: 'brillo' } });
    expect(screen.getByText('Brillo Total')).toBeInTheDocument();
    expect(screen.queryByText('AutoSpa Sur')).not.toBeInTheDocument();
  });

  it('CA3: suspender pide confirmación, explica que los datos se conservan y envía el motivo', async () => {
    api.post.mockResolvedValue({});
    abrir();
    await screen.findByText('AutoSpa Sur');
    const fila = screen.getByText('AutoSpa Sur').closest('tr');
    fireEvent.click(within(fila).getByRole('button', { name: 'Suspender' }));

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText(/se conservan/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'Mora en el pago' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Suspender' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/superadmin/establecimientos/e2/suspender', { motivo: 'Mora en el pago' }));
    expect(await screen.findByText('AutoSpa Sur suspendido')).toBeInTheDocument();
  });

  it('un establecimiento suspendido se puede habilitar, pero no suspender otra vez', async () => {
    abrir();
    const fila = (await screen.findByText('Brillo Total')).closest('tr');
    expect(within(fila).getByRole('button', { name: 'Habilitar' })).toBeInTheDocument();
    expect(within(fila).queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
  });

  it('CA1: valida el formulario antes de enviarlo y registra con plan y días de prueba', async () => {
    api.post.mockResolvedValue({ establecimiento: { nombre: 'Lavadero Nuevo' }, invitacion: { correo: 'nuevo@x.co' } });
    abrir();
    await screen.findByText('Lavadero Norte');
    fireEvent.click(screen.getByRole('button', { name: '+ Registrar establecimiento' }));

    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear y enviar invitación' }));
    expect(within(dialogo).getByText(/mínimo 2 caracteres/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(within(dialogo).getByLabelText('Nombre del establecimiento'), { target: { value: 'Lavadero Nuevo' } });
    fireEvent.click(within(dialogo).getByLabelText(/Empresarial/));
    fireEvent.change(within(dialogo).getByLabelText('Correo del administrador inicial'), { target: { value: 'nuevo@x.co' } });
    fireEvent.change(within(dialogo).getByLabelText('Número de días de prueba'), { target: { value: '21' } });
    expect(within(dialogo).getByText(/La prueba termina el/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear y enviar invitación' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/superadmin/establecimientos', {
      nombre: 'Lavadero Nuevo', plan: 'empresarial', correoAdministrador: 'nuevo@x.co', diasPrueba: 21,
    }));
    expect(await screen.findByText('Lavadero Nuevo registrado')).toBeInTheDocument();
  });

  it('muestra junto al campo el error que devuelve la API', async () => {
    const error = Object.assign(new Error('No se pudo enviar la invitación'), { detalles: [{ campo: 'correoAdministrador', mensaje: 'Este correo ya tiene una cuenta' }] });
    api.post.mockRejectedValue(error);
    abrir();
    await screen.findByText('Lavadero Norte');
    fireEvent.click(screen.getByRole('button', { name: '+ Registrar establecimiento' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText('Nombre del establecimiento'), { target: { value: 'Otro' } });
    fireEvent.change(within(dialogo).getByLabelText('Correo del administrador inicial'), { target: { value: 'ya@x.co' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear y enviar invitación' }));
    expect(await within(dialogo).findByText('Este correo ya tiene una cuenta')).toBeInTheDocument();
  });
});
