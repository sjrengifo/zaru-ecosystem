import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: { post: vi.fn(), subir: vi.fn() } }));
vi.mock('../src/services/api.js', () => ({ api }));

const { default: FormularioNovedad } = await import('../src/components/FormularioNovedad.jsx');
const { default: TarjetaOrden } = await import('../src/components/TarjetaOrden.jsx');

const ORDEN = { id: 'orden-1', vehiculos: { placa: 'ABC123' } };

describe('HU-37 formulario de novedades', () => {
  beforeEach(() => {
    api.post.mockReset();
    api.subir.mockReset();
  });

  it('muestra los mensajes predefinidos y limita el texto a 300 caracteres', () => {
    render(<FormularioNovedad orden={ORDEN} onCerrar={vi.fn()} onGuardado={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Demora estimada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daño preexistente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Objeto encontrado' })).toBeInTheDocument();
    const textarea = screen.getByLabelText('Mensaje para el cliente');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(350) } });
    expect(textarea).toHaveValue('x'.repeat(300));
  });

  it('ofrece notificar novedad en la tarjeta que está en lavado', () => {
    const notificar = vi.fn();
    render(<TarjetaOrden orden={{ ...ORDEN, estado: 'en_lavado' }} onAvanzar={vi.fn()} onNotificarNovedad={notificar} ahora={new Date()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notificar novedad' }));
    expect(notificar).toHaveBeenCalledWith(expect.objectContaining({ id: ORDEN.id }));
  });

  it('envía la demora con minutos adicionales para actualizar la entrega estimada', async () => {
    const guardado = vi.fn();
    api.post.mockResolvedValue({ id: 'novedad-1', tipo: 'demora', entregaEstimadaAt: '2026-11-19T18:30:00Z' });
    render(<FormularioNovedad orden={ORDEN} onCerrar={vi.fn()} onGuardado={guardado} />);

    fireEvent.change(screen.getByLabelText('Minutos adicionales estimados'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar novedad' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ordenes/orden-1/novedades', {
      tipo: 'demora',
      mensaje: 'Tu vehículo presenta una demora en el lavado.',
      minutosExtra: 25,
    }));
    expect(guardado).toHaveBeenCalledWith(expect.objectContaining({ entregaEstimadaAt: '2026-11-19T18:30:00Z' }));
  });

  it('adjunta hasta tres fotos al mensaje de daño preexistente', async () => {
    api.post.mockResolvedValue({ id: 'novedad-2', tipo: 'dano_preexistente' });
    api.subir.mockResolvedValue({ fotos: [] });
    const guardado = vi.fn();
    render(<FormularioNovedad orden={ORDEN} onCerrar={vi.fn()} onGuardado={guardado} />);
    fireEvent.click(screen.getByRole('button', { name: 'Daño preexistente' }));
    const archivos = [
      new File(['uno'], 'uno.jpg', { type: 'image/jpeg' }),
      new File(['dos'], 'dos.png', { type: 'image/png' }),
      new File(['tres'], 'tres.jpg', { type: 'image/jpeg' }),
    ];
    fireEvent.change(screen.getByLabelText(/Fotos de evidencia/), { target: { files: archivos } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar novedad' }));

    await waitFor(() => expect(api.subir).toHaveBeenCalledWith(
      '/ordenes/orden-1/novedades/novedad-2/fotos',
      expect.any(FormData),
    ));
    expect(guardado).toHaveBeenCalled();
  });

  it('rechaza una selección de más de tres fotos antes de enviarla', () => {
    api.post.mockResolvedValue({ id: 'novedad-3', tipo: 'dano_preexistente' });
    render(<FormularioNovedad orden={ORDEN} onCerrar={vi.fn()} onGuardado={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Daño preexistente' }));
    const archivos = Array.from({ length: 4 }, (_, indice) => new File([`foto-${indice}`], `foto-${indice}.jpg`, { type: 'image/jpeg' }));
    fireEvent.change(screen.getByLabelText('Fotos de evidencia'), { target: { files: archivos } });
    expect(screen.getByRole('alert')).toHaveTextContent('hasta 3 fotos');
    expect(api.post).not.toHaveBeenCalled();
  });
});
