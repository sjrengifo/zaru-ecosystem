// HU-30 — Autorización y revocación del tratamiento de datos para notificaciones.
// CA1 casillas en el registro, perfil con estado e historial (CA4) y página "dejar de recibir" (CA3).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
vi.mock('../src/services/api.js', () => ({ api }));

const { default: CasillasNotificaciones, AUTORIZACIONES_INICIALES, camposAutorizacion } = await import('../src/components/CasillasNotificaciones.jsx');
const { default: FormularioCliente } = await import('../src/components/FormularioCliente.jsx');
const { default: AutorizacionesCliente } = await import('../src/components/AutorizacionesCliente.jsx');
const { default: BajaNotificaciones } = await import('../src/pages/BajaNotificaciones.jsx');
const { formatoFechaHora: formatoOriginal } = await import('../src/lib/formato.js');
// Intl separa "p. m." con espacios especiales; Testing Library los normaliza a espacios comunes.
const formatoFechaHora = (f) => formatoOriginal(f).replace(/\s+/g, ' ');
Element.prototype.scrollIntoView ||= () => {};

const POLITICA = { version: '1.1', titulo: 'Política', contenido: '# Finalidades\nAvisos del servicio.' };
const SEDE = { nombre: 'Lavadero Norte', logoUrl: null, colorPrimario: '#0F766E', colorSecundario: null };

const sinFecha = { otorgado: false, fecha: null, canal: null, politicaVersion: null };
const AUTORIZACIONES = {
  tratamientoDatos: { otorgado: true, fecha: '2026-11-01T15:00:00Z', canal: 'panel', politicaVersion: '1.1' },
  notificacionesServicio: { otorgado: true, fecha: '2026-11-01T15:00:00Z', canal: 'panel', politicaVersion: '1.1' },
  comerciales: { ...sinFecha },
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('CA1: dos casillas separadas, desmarcadas, con enlace a la política', () => {
  it('se muestran desmarcadas y cada una cambia solo su autorización', () => {
    const onCambio = vi.fn();
    render(<CasillasNotificaciones prefijo="t" valores={AUTORIZACIONES_INICIALES} onCambio={onCambio} politicaVersion="1.1" />);
    const servicio = screen.getByRole('checkbox', { name: /Avisos del servicio/ });
    const promociones = screen.getByRole('checkbox', { name: /Promociones/ });
    expect(servicio).not.toBeChecked();
    expect(promociones).not.toBeChecked();
    fireEvent.click(promociones);
    expect(onCambio).toHaveBeenCalledWith({ notificaciones: false, comerciales: true });
  });

  it('enlaza la política vigente en otra pestaña', () => {
    render(<CasillasNotificaciones prefijo="t" valores={AUTORIZACIONES_INICIALES} onCambio={() => {}} politicaVersion="1.1" />);
    const enlace = screen.getByRole('link', { name: /política de tratamiento de datos \(versión 1\.1\)/ });
    expect(enlace).toHaveAttribute('href', '/politica-datos');
    expect(enlace).toHaveAttribute('target', '_blank');
  });

  it('traduce las casillas a los campos de la API', () => {
    expect(camposAutorizacion(AUTORIZACIONES_INICIALES)).toEqual({ autorizaNotificaciones: false, autorizaComerciales: false });
    expect(camposAutorizacion({ notificaciones: true, comerciales: false })).toEqual({ autorizaNotificaciones: true, autorizaComerciales: false });
  });

  it('el registro de cliente envía cada autorización por separado', async () => {
    api.get.mockResolvedValue(POLITICA);
    api.post.mockResolvedValue({ id: 'c1' });
    const onCreado = vi.fn();
    render(<FormularioCliente onCreado={onCreado} onCancelar={() => {}} />);
    await screen.findByText('Avisos del servicio.');

    fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '3001234567' } });
    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: 'ana@correo.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /autoriza el tratamiento/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Avisos del servicio/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar cliente/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.queryAllByRole('alert')).toEqual([]);
    expect(api.post).toHaveBeenCalledWith('/clientes', expect.objectContaining({
      autorizacionDatos: true,
      politicaVersion: '1.1',
      autorizaNotificaciones: true,
      autorizaComerciales: false,
    }));
  });
});

describe('perfil del cliente: estado, cambio y evidencia', () => {
  const cliente = { id: 'c1', nombre: 'Ana Pérez', autorizaciones: AUTORIZACIONES };

  it('muestra cada autorización con su fecha, hora, canal y versión', () => {
    render(<AutorizacionesCliente cliente={cliente} esAdmin={false} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Avisos del estado del vehículo');
    expect(items[0]).toHaveTextContent(`Autorizado · ${formatoFechaHora('2026-11-01T15:00:00Z')} · Panel del establecimiento · política v1.1`);
    expect(items[1]).toHaveTextContent('Promociones y ofertas');
    expect(items[1]).toHaveTextContent('No autorizado');
    expect(screen.queryByRole('button', { name: /historial/ })).not.toBeInTheDocument();
  });

  it('CA3: retirar desde el panel actualiza el estado y avisa', async () => {
    api.put.mockResolvedValue({ cambio: true, autorizaciones: { ...AUTORIZACIONES, notificacionesServicio: { otorgado: false, fecha: '2026-11-10T20:00:00Z', canal: 'panel', politicaVersion: '1.1' } } });
    const onCambio = vi.fn();
    render(<AutorizacionesCliente cliente={cliente} esAdmin={false} onCambio={onCambio} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirar: Avisos del estado del vehículo' }));
    await screen.findByRole('button', { name: 'Autorizar: Avisos del estado del vehículo' });
    expect(api.put).toHaveBeenCalledWith('/clientes/c1/autorizaciones', { tipo: 'notificaciones_servicio', otorgado: false });
    expect(onCambio).toHaveBeenCalledWith({ nombre: 'Avisos del estado del vehículo', otorgado: false });
  });

  it('CA4: el administrador consulta el historial completo', async () => {
    api.get.mockResolvedValue([
      { tipo: 'comerciales', otorgado: false, canal: 'enlace_baja', politicaVersion: '1.1', fecha: '2026-11-05T14:30:00Z' },
      { tipo: 'comerciales', otorgado: true, canal: 'panel', politicaVersion: '1.0', fecha: '2026-10-01T13:00:00Z' },
      { tipo: 'comerciales', otorgado: false, canal: 'panel', politicaVersion: '1.0', fecha: '2026-09-01T13:00:00Z' },
    ]);
    render(<AutorizacionesCliente cliente={cliente} esAdmin />);
    fireEvent.click(screen.getByRole('button', { name: /Ver historial/ }));
    const historial = await screen.findByRole('list', { name: /Historial de autorizaciones/ });
    const filas = within(historial).getAllByRole('listitem');
    expect(api.get).toHaveBeenCalledWith('/clientes/c1/consentimientos');
    expect(filas[0]).toHaveTextContent('Retirada');
    expect(filas[0]).toHaveTextContent(`${formatoFechaHora('2026-11-05T14:30:00Z')} · Enlace "dejar de recibir" · Política v1.1`);
    expect(filas[1]).toHaveTextContent('Otorgada');
    expect(filas[1]).toHaveTextContent('Política v1.0');
    expect(filas[2]).toHaveTextContent('No otorgada');
  });

  it('la hora se muestra en hora de Colombia', () => {
    expect(formatoFechaHora('2026-11-05T14:30:00Z')).toMatch(/9:30/);
  });
});

describe('CA3: página "dejar de recibir"', () => {
  function respuesta(status, cuerpo) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });
  }
  function simular({ get = [200, { tipo: 'comerciales', nombreTipo: 'Promociones y ofertas', autorizado: true, sede: SEDE }], post } = {}) {
    const f = vi.fn((url, opciones = {}) => (opciones.method === 'POST' ? respuesta(...post) : respuesta(...get)));
    vi.stubGlobal('fetch', f);
    return f;
  }
  const abrir = () =>
    render(
      <MemoryRouter initialEntries={['/baja/abc.def']}>
        <Routes>
          <Route path="/baja/:token" element={<BajaNotificaciones />} />
        </Routes>
      </MemoryRouter>,
    );

  it('abrir el enlace no da de baja: pide confirmar', async () => {
    const f = simular();
    abrir();
    expect(await screen.findByRole('heading', { name: '¿Dejar de recibir promociones y ofertas?' })).toBeInTheDocument();
    expect(screen.getByText('Lavadero Norte', { selector: 'strong' })).toBeInTheDocument();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1]?.method).toBeUndefined();
  });

  it('al confirmar, revoca y muestra la fecha y hora registradas', async () => {
    const revocadaAt = '2026-11-10T21:05:00Z';
    const f = simular({ post: [200, { tipo: 'comerciales', nombreTipo: 'Promociones y ofertas', autorizado: false, revocadaAt, sede: SEDE }] });
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, dejar de recibirlos' }));
    expect(await screen.findByRole('heading', { name: 'Listo, ya no recibirás promociones y ofertas' })).toBeInTheDocument();
    expect(screen.getByText(formatoFechaHora(revocadaAt))).toBeInTheDocument();
    expect(f.mock.calls[1][0]).toMatch(/\/publico\/baja\/abc\.def$/);
    expect(f.mock.calls[1][1].method).toBe('POST');
  });

  it('si ya estaba retirada, lo dice sin pedir nada', async () => {
    simular({ get: [200, { tipo: 'notificaciones_servicio', nombreTipo: 'Avisos del estado del vehículo', autorizado: false, sede: SEDE }] });
    abrir();
    expect(await screen.findByRole('heading', { name: 'Ya no recibes avisos del estado del vehículo' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('un enlace alterado muestra un mensaje claro', async () => {
    simular({ get: [404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'Este enlace no es válido o ya no está disponible' } }] });
    abrir();
    expect(await screen.findByRole('heading', { name: 'Este enlace no está disponible' })).toBeInTheDocument();
  });
});
