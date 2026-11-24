// HU-57 — Panel de superadministración: resumen, filtros, registro y suspensión con confirmación.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../src/services/api.js', () => ({ api }));
vi.mock('../src/lib/supabase.js', () => ({ supabase: { auth: { signOut: vi.fn() } } }));

const { default: Superadmin } = await import('../src/pages/Superadmin.jsx');

const LISTA = [
  { id: 'e1', nombre: 'Lavadero Norte', plan: 'basico', estado: 'prueba', dias_restantes: 2, prueba_inicia_at: '2026-10-20T00:00:00Z', prueba_finaliza_at: '2026-11-05T00:00:00Z', created_at: '2026-10-20T00:00:00Z', administrador: { nombre: 'ana', correo: 'ana@norte.co', invitacionAceptada: false } },
  { id: 'e2', nombre: 'AutoSpa Sur', plan: 'empresarial', estado: 'activo', dias_restantes: null, created_at: '2026-10-01T00:00:00Z', administrador: { nombre: 'beto', correo: 'beto@sur.co', invitacionAceptada: true } },
  { id: 'e3', nombre: 'Brillo Total', plan: 'intermedio', estado: 'suspendido', dias_restantes: null, created_at: '2026-09-01T00:00:00Z', administrador: null },
];

const abrir = () => render(<MemoryRouter><Superadmin /></MemoryRouter>);

/** El nombre aparece en la tabla de establecimientos y en la de consumo: devuelve la fila de la primera. */
async function filaEstablecimiento(nombre) {
  return (await screen.findAllByText(nombre))[0].closest('tr');
}

beforeEach(() => {
  api.get.mockReset().mockImplementation((ruta) => {
    if (ruta === '/superadmin/consumo/alertas') return Promise.resolve({ mes: '2026-11', alertas: [] });
    if (ruta.startsWith('/superadmin/consumo/')) {
      const sede = [
        { establecimientoId: 'e1', nombre: 'Lavadero Norte', plan: 'basico', etiquetaPlan: 'Básico', estado: 'normal',
          sms: { usados: 10, cupo: 200, restantes: 190, porcentaje: 5, alerta80: false, agotado: false },
          correo: { usados: 20, cupo: 1000, restantes: 980, porcentaje: 2, alerta80: false, agotado: false } },
        { establecimientoId: 'e2', nombre: 'AutoSpa Sur', plan: 'empresarial', etiquetaPlan: 'Empresarial', estado: 'agotado',
          sms: { usados: 2000, cupo: 2000, restantes: 0, porcentaje: 100, alerta80: true, agotado: true },
          correo: { usados: 2000, cupo: 10000, restantes: 8000, porcentaje: 20, alerta80: false, agotado: false } },
        { establecimientoId: 'e3', nombre: 'Brillo Total', plan: 'intermedio', etiquetaPlan: 'Intermedio', estado: 'advertencia',
          sms: { usados: 500, cupo: 600, restantes: 100, porcentaje: 83.33, alerta80: true, agotado: false },
          correo: { usados: 380, cupo: 3000, restantes: 2620, porcentaje: 12.67, alerta80: false, agotado: false } },
      ].find((s) => ruta.includes(s.establecimientoId));
      return Promise.resolve({ mes: '2026-11', ...sede, historial: [{ mes: '2026-10', sms: 1200, correo: 900, push: 0 }] });
    }
    if (ruta.startsWith('/superadmin/consumo')) return Promise.resolve({
      mes: '2026-11',
      resumen: { establecimientos: 3, smsConsumidos: 900, correosConsumidos: 2400, cercanosAlLimite: 1, cupoAgotado: 1 },
      establecimientos: [
        { establecimientoId: 'e1', nombre: 'Lavadero Norte', plan: 'basico', etiquetaPlan: 'Básico', estado: 'normal',
          sms: { usados: 10, cupo: 200, restantes: 190, porcentaje: 5, alerta80: false, agotado: false },
          correo: { usados: 20, cupo: 1000, restantes: 980, porcentaje: 2, alerta80: false, agotado: false } },
        { establecimientoId: 'e2', nombre: 'AutoSpa Sur', plan: 'empresarial', etiquetaPlan: 'Empresarial', estado: 'agotado',
          sms: { usados: 2000, cupo: 2000, restantes: 0, porcentaje: 100, alerta80: true, agotado: true },
          correo: { usados: 2000, cupo: 10000, restantes: 8000, porcentaje: 20, alerta80: false, agotado: false } },
        { establecimientoId: 'e3', nombre: 'Brillo Total', plan: 'intermedio', etiquetaPlan: 'Intermedio', estado: 'advertencia',
          sms: { usados: 500, cupo: 600, restantes: 100, porcentaje: 83.33, alerta80: true, agotado: false },
          correo: { usados: 380, cupo: 3000, restantes: 2620, porcentaje: 12.67, alerta80: false, agotado: false } },
      ],
    });
    if (ruta === '/superadmin/planes') return Promise.resolve([
      { nombre: 'basico', etiqueta: 'Básico', cupo_sms_mes: 200, cupo_correo_mes: 1000 },
      { nombre: 'intermedio', etiqueta: 'Intermedio', cupo_sms_mes: 600, cupo_correo_mes: 3000 },
      { nombre: 'empresarial', etiqueta: 'Empresarial', cupo_sms_mes: 2000, cupo_correo_mes: 10000 },
    ]);
    return Promise.resolve(LISTA);
  });
  api.post.mockReset();
  api.put.mockReset();
});

describe('HU-57 · panel de superadministración', () => {
  it('CA2: resume por estado y avisa de las pruebas que vencen pronto', async () => {
    abrir();
    await filaEstablecimiento('Lavadero Norte');
    const resumen = screen.getByRole('group', { name: 'Filtrar por estado' });
    expect(within(resumen).getByRole('button', { name: /3\s*Todos/ })).toBeInTheDocument();
    expect(within(resumen).getByRole('button', { name: /1\s*Suspendidos/ })).toBeInTheDocument();
    expect(screen.getByText('Vence en 2 días')).toBeInTheDocument();
    expect(screen.getByText(/Un periodo de prueba vence/)).toBeInTheDocument();
  });

  it('HU-39: el reporte de consumo tiene un acceso visible y un anclable desde el panel', async () => {
    abrir();
    await filaEstablecimiento('Lavadero Norte');

    const enlace = screen.getByRole('link', { name: 'Ver reporte de consumo' });
    expect(enlace).toHaveAttribute('href', '#consumo-por-plan');
    expect(document.getElementById('consumo-por-plan')).toBeInTheDocument();
  });

  it('muestra el administrador y si su invitación está pendiente; permite reenviarla', async () => {
    api.post.mockResolvedValue({ correo: 'ana@norte.co', enviada: true });
    abrir();
    await filaEstablecimiento('Lavadero Norte');
    expect(screen.getByText('Invitación pendiente')).toBeInTheDocument();
    expect(screen.getByText('Cuenta activa')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar invitación' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/superadmin/establecimientos/e1/reenviar-invitacion'));
    expect(await screen.findByText('Invitación reenviada')).toBeInTheDocument();
  });

  it('filtra por estado con las tarjetas y busca por nombre', async () => {
    abrir();
    await filaEstablecimiento('Lavadero Norte');
    const tabla = document.querySelector('.tabla-establecimientos');
    fireEvent.click(screen.getByRole('button', { name: /Activos/ }));
    expect(within(tabla).queryByText('Lavadero Norte')).not.toBeInTheDocument();
    expect(within(tabla).getByText('AutoSpa Sur')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    fireEvent.change(screen.getByLabelText('Buscar establecimiento'), { target: { value: 'brillo' } });
    expect(within(tabla).getByText('Brillo Total')).toBeInTheDocument();
    expect(within(tabla).queryByText('AutoSpa Sur')).not.toBeInTheDocument();
  });

  it('CA3: suspender pide confirmación, explica que los datos se conservan y envía el motivo', async () => {
    api.post.mockResolvedValue({});
    abrir();
    const fila = await filaEstablecimiento('AutoSpa Sur');
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
    const fila = await filaEstablecimiento('Brillo Total');
    expect(within(fila).getByRole('button', { name: 'Habilitar' })).toBeInTheDocument();
    expect(within(fila).queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
  });

  it('CA1: valida el formulario antes de enviarlo y registra con plan y días de prueba', async () => {
    api.post.mockResolvedValue({ establecimiento: { nombre: 'Lavadero Nuevo' }, invitacion: { correo: 'nuevo@x.co' } });
    abrir();
    await filaEstablecimiento('Lavadero Norte');
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

  it('HU-39 CA3: muestra indicadores reales, filtra por estado y abre el detalle del establecimiento', async () => {
    abrir();
    const grupo = await screen.findByRole('group', { name: 'Resumen de consumo de la plataforma' });
    expect(within(grupo).getByText('900')).toBeInTheDocument();
    expect(within(grupo).getByText('2.400')).toBeInTheDocument();
    expect(within(grupo).getByText(/Alcanzaron el 80 %/)).toBeInTheDocument();
    expect(within(grupo).getByText(/Cupo agotado/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Estado de consumo'), { target: { value: 'agotado' } });
    const tablaConsumo = document.querySelector('.tabla-consumo');
    expect(within(tablaConsumo).getByText('AutoSpa Sur')).toBeInTheDocument();
    expect(within(tablaConsumo).queryByText('Brillo Total')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Estado de consumo'), { target: { value: 'todos' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[1]);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/Plan Empresarial/)).toBeInTheDocument();
    expect(within(dialogo).getAllByText('2.000').length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/superadmin/consumo/e2'));
  });

  it('HU-39: informa el error al consultar el reporte sin ocultarlo', async () => {
    api.get.mockImplementation((ruta) => (ruta.startsWith('/superadmin/consumo')
      ? Promise.reject(new Error('No se pudo consultar el consumo'))
      : Promise.resolve(LISTA)));
    abrir();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar el consumo');
  });

  it('muestra junto al campo el error que devuelve la API', async () => {
    const error = Object.assign(new Error('No se pudo enviar la invitación'), { detalles: [{ campo: 'correoAdministrador', mensaje: 'Este correo ya tiene una cuenta' }] });
    api.post.mockRejectedValue(error);
    abrir();
    await filaEstablecimiento('Lavadero Norte');
    fireEvent.click(screen.getByRole('button', { name: '+ Registrar establecimiento' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText('Nombre del establecimiento'), { target: { value: 'Otro' } });
    fireEvent.change(within(dialogo).getByLabelText('Correo del administrador inicial'), { target: { value: 'ya@x.co' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Crear y enviar invitación' }));
    expect(await within(dialogo).findByText('Este correo ya tiene una cuenta')).toBeInTheDocument();
  });
});
