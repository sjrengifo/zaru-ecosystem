// HU-31 — Configuración de los estados que generan notificación.
// CA1: los cinco estados con interruptor; CA2: "listo" obligatorio; CA3: guardado inmediato
// y reversión visual si la API rechaza el cambio.
// HU-39 — además, la sede ve sus canales, alertas y consumo real, y puede enviar una prueba.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock('../src/services/api.js', () => ({ api }));

const { default: Notificaciones } = await import('../src/pages/Notificaciones.jsx');

const configuracion = () => [
  { estado: 'recibido', titulo: 'En cola', activo: true, obligatorio: false },
  { estado: 'en_lavado', titulo: 'Lavado iniciado', activo: true, obligatorio: false },
  { estado: 'secado', titulo: 'Secado', activo: true, obligatorio: false },
  { estado: 'listo', titulo: 'Listo para recoger', activo: true, obligatorio: true },
  { estado: 'entregado', titulo: 'Entregado', activo: true, obligatorio: false },
];

const canales = () => [
  { canal: 'sms', etiqueta: 'SMS', activo: true, disponible: true, proveedor: 'twilio', motivo: null },
  { canal: 'correo', etiqueta: 'Correo', activo: true, disponible: true, proveedor: 'consola', motivo: null },
  {
    canal: 'push',
    etiqueta: 'Push',
    activo: true,
    disponible: false,
    proveedor: null,
    motivo: 'El canal push no está configurado en este ambiente (PUSH_PROVEEDOR y llaves VAPID)',
  },
];

const consumo = () => ({
  mes: '2026-11',
  nombre: 'Lavadero Central',
  plan: 'basico',
  etiquetaPlan: 'Básico',
  sms: { usados: 90, cupo: 200, porcentaje: 45, restantes: 110, alerta80: false, agotado: false },
  correo: { usados: 400, cupo: 1000, porcentaje: 40, restantes: 600, alerta80: false, agotado: false },
  push: { usados: 12, cupo: null, porcentaje: null, restantes: null, alerta80: false, agotado: false },
  estado: 'normal',
});

/** Los endpoints tienen formas distintas: responder por URL evita mocks que se contaminen. */
const responder = (url, consumoPersonalizado = consumo()) => {
  if (url === '/configuracion/notificaciones') return configuracion();
  if (url === '/configuracion/canales') return canales();
  if (url === '/consumo/alertas') return { mes: '2026-11', alertas: [] };
  if (url.startsWith('/consumo')) return consumoPersonalizado;
  throw new Error(`URL inesperada: ${url}`);
};

const abrir = () => render(<MemoryRouter><Notificaciones /></MemoryRouter>);
const listaEstados = async () => within(await screen.findByRole('list', { name: 'Estados que generan notificación' }));
const listaCanales = async () => within(await screen.findByRole('list', { name: 'Canales de notificación' }));
const peticiones = (url) => api.get.mock.calls.filter(([destino]) => destino === url);

const consumoCon = (cambiosSms, raiz = {}) => ({
  ...consumo(),
  ...raiz,
  sms: { ...consumo().sms, ...cambiosSms },
});

beforeEach(() => {
  api.get.mockReset().mockImplementation((url) => Promise.resolve(responder(url)));
  api.put.mockReset();
  api.post.mockReset();
});

describe('HU-31 · configuración de notificaciones', () => {
  it('CA1: muestra los cinco estados del flujo con su interruptor', async () => {
    abrir();

    expect(await screen.findByRole('heading', { name: 'Configuración de notificaciones' })).toBeInTheDocument();
    expect(await screen.findAllByRole('switch')).toHaveLength(8); // 5 estados + 3 canales
    const lista = await listaEstados();
    for (const titulo of ['En cola', 'Lavado iniciado', 'Secado', 'Listo para recoger', 'Entregado']) {
      expect(lista.getByRole('switch', { name: `Notificaciones de ${titulo}` })).toBeInTheDocument();
    }
    expect(peticiones('/configuracion/notificaciones')).toHaveLength(1);
    expect(peticiones('/configuracion/canales')).toHaveLength(1);
    expect(peticiones('/consumo')).toHaveLength(1);
  });

  it('si la carga falla muestra el error con un botón para reintentar, no una página vacía', async () => {
    api.get.mockImplementation((url) => url === '/configuracion/notificaciones'
      ? Promise.reject(new Error('Error interno del servidor'))
      : Promise.resolve(responder(url)));
    abrir();

    expect(await screen.findByText('No se pudo cargar la configuración de notificaciones: Error interno del servidor'))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Estados que generan notificación' })).toBeNull();
    // La sección de canales es independiente: un fallo en estados no la borra.
    expect((await listaCanales()).getAllByRole('switch')).toHaveLength(3);

    api.get.mockImplementation((url) => Promise.resolve(responder(url)));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await (await listaEstados()).findByRole('switch', { name: 'Notificaciones de En cola' })).toBeInTheDocument();
    expect(peticiones('/configuracion/notificaciones')).toHaveLength(2);
  });

  it('CA2: "listo" se muestra como obligatorio y no se puede apagar', async () => {
    abrir();

    const listo = await (await listaEstados()).findByRole('switch', { name: 'Notificaciones de Listo para recoger' });
    expect(listo).toBeChecked();
    expect(listo).toBeDisabled();
    expect(screen.getByText('Obligatorio')).toBeInTheDocument();

    fireEvent.click(listo);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('CA3: guarda el cambio al instante y lo revierte si la API falla', async () => {
    api.put.mockRejectedValueOnce(new Error('No se pudo guardar la configuración'));
    abrir();

    const secado = await (await listaEstados()).findByRole('switch', { name: 'Notificaciones de Secado' });
    expect(secado).toBeChecked();

    fireEvent.click(secado);
    expect(secado).not.toBeChecked(); // cambio optimista mientras se guarda
    expect(api.put).toHaveBeenCalledWith('/configuracion/notificaciones', expect.arrayContaining([
      { estado: 'secado', activo: false },
    ]));

    expect(await screen.findByText('No se pudo guardar la configuración')).toBeInTheDocument();
    await waitFor(() => expect(secado).toBeChecked());
  });

  it('CA3: al guardar bien confirma el cambio y mantiene el interruptor', async () => {
    api.put.mockImplementation(async (_ruta, lista) => configuracion().map((item) => ({
      ...item,
      activo: lista.find((cambio) => cambio.estado === item.estado)?.activo ?? item.activo,
    })));
    abrir();

    const enLavado = await (await listaEstados()).findByRole('switch', { name: 'Notificaciones de Lavado iniciado' });
    fireEvent.click(enLavado);

    expect(await screen.findByText('Aviso desactivado')).toBeInTheDocument();
    expect(enLavado).not.toBeChecked();
  });
});

describe('HU-39 · canales, consumo y prueba real en la sede', () => {
  it('muestra los tres canales con su disponibilidad real sin alterar los avisos operativos', async () => {
    abrir();
    const lista = await listaCanales();

    expect(lista.getAllByRole('switch')).toHaveLength(3);
    expect(lista.getByRole('switch', { name: 'Canal SMS' })).toBeChecked();
    expect(lista.getByRole('switch', { name: 'Canal Push' })).toBeChecked(); // activo, aunque no disponible
    expect(screen.getByText('El canal push no está configurado en este ambiente (PUSH_PROVEEDOR y llaves VAPID)')).toBeInTheDocument();
    expect((await listaEstados()).getAllByRole('switch')).toHaveLength(5);
  });

  it('guarda la preferencia de un canal en una sola petición, sin enviar el establecimiento', async () => {
    const guardados = canales().map((item) => (item.canal === 'push' ? { ...item, activo: false } : item));
    api.put.mockResolvedValueOnce(guardados);
    abrir();

    const push = await (await listaCanales()).findByRole('switch', { name: 'Canal Push' });
    fireEvent.click(push);

    expect(api.put).toHaveBeenCalledWith('/configuracion/canales', {
      canales: [
        { canal: 'sms', activo: true },
        { canal: 'correo', activo: true },
        { canal: 'push', activo: false },
      ],
    });
    await waitFor(() => expect(push).not.toBeChecked());
  });

  it('muestra la alerta al 80 % sin inventar cifras: salen del consumo del backend', async () => {
    api.get.mockImplementation((url) => Promise.resolve(responder(url,
      consumoCon({ usados: 160, porcentaje: 80, restantes: 40, alerta80: true }, { estado: 'advertencia' }))));
    abrir();

    expect(await screen.findByRole('alert')).toHaveTextContent('alcanzaste el 80 % del cupo mensual de SMS');
    expect(screen.getByText('160')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('Cercano al límite')).toBeInTheDocument();
    expect(screen.getByText('Sin cupo (no bloquea)')).toBeInTheDocument(); // push se contabiliza, no limita
  });

  it('muestra el cupo agotado y explica que los avisos operativos siguen saliendo', async () => {
    api.get.mockImplementation((url) => Promise.resolve(responder(url,
      consumoCon({ usados: 200, porcentaje: 100, restantes: 0, alerta80: true, agotado: true }, { estado: 'agotado' }))));
    abrir();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cupo de SMS agotado');
    expect(screen.getByText(/Los avisos operativos siguen saliendo por correo/)).toBeInTheDocument();
    expect(screen.getByText('Cupo agotado')).toBeInTheDocument();
  });

  it('envía una prueba real por SMS, cae al correo y muestra el resultado de cada intento', async () => {
    api.post.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      mes: '2026-11',
      canalInicial: 'sms',
      orden: ['sms', 'correo'],
      estado: 'entregado',
      canalEntregado: 'correo',
      resultados: [
        {
          canal: 'sms', estado: 'fallido', aceptado: false, proveedor: 'twilio', destino: '300****567',
          motivo: 'Twilio rechazó el mensaje', advertencia: null, idProveedor: null,
          consumo: { reservado: true, contado: false, liberado: true },
        },
        {
          canal: 'correo', estado: 'enviado', aceptado: true, proveedor: 'consola', destino: 'adm****@zaru.app',
          motivo: null, advertencia: null, idProveedor: 'correo-1',
          consumo: { reservado: true, contado: true, liberado: false },
        },
      ],
    });
    abrir();

    fireEvent.change(await screen.findByLabelText('Canal inicial'), { target: { value: 'sms' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar prueba' }));

    expect(await screen.findByText('Entregado por Correo.')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/notificaciones/prueba', { canal: 'sms' });
    expect(screen.getByText('Twilio rechazó el mensaje')).toBeInTheDocument();
    expect(screen.getByText('Reserva liberada')).toBeInTheDocument();
    expect(screen.getAllByText('Registrado')).toHaveLength(1);
    expect(screen.getByText(/Cadena probada: SMS → Correo/)).toBeInTheDocument();
  });
});
