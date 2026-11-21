// HU-35 (ZARU-24) — Campañas de promociones segmentadas en el panel.
// CA1: segmentar por días sin visita, servicios usados y tipo de vehículo.
// CA2: previsualizar el total y las exclusiones antes de confirmar.
// CA3: el límite semanal se explica en la previsualización.
// CA4: avisar cuando la hora cae fuera de la franja y se moverá a las 7:00 a. m.
// Además: historial de campañas y clave de idempotencia al confirmar.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../src/services/api.js', () => ({ api }));

const { default: CampanaPromociones } = await import('../src/components/CampanaPromociones.jsx');
const lib = await import('../src/lib/campanas.js');

const PROMOCIONES = [
  {
    id: 'p1',
    nombre: 'Cambio de aceite',
    descuento_pct: 20,
    fecha_inicio: '2026-11-01',
    fecha_fin: '2026-12-31',
    servicios: [{ id: 's1', nombre: 'Lavado premium' }],
  },
];
const SERVICIOS = [
  { id: 's1', nombre: 'Lavado premium', precio: 30000, activo: true },
  { id: 's2', nombre: 'Polichado', precio: 50000, activo: true },
];
const VEHICULOS = [
  { id: 'v1', tipo: 'Automóvil' },
  { id: 'v2', tipo: 'Camioneta' },
];
const HISTORIAL = {
  campanas: [
    {
      id: 'c1',
      promocion: { nombre: 'Promo anterior' },
      estado: 'enviada',
      programadaPara: '2026-11-10T15:00:00.000Z',
      programadaSolicitada: '2026-11-10T15:00:00.000Z',
      ajustada: false,
      totalDestinatarios: 4,
      exclusiones: { sinAutorizacion: 1 },
      omitidos: {},
    },
  ],
  paginacion: { pagina: 1, porPagina: 20, total: 1, totalPaginas: 1 },
};

/** Mañana en Bogotá a la hora indicada, en el formato de datetime-local. */
function mananaBogota(hora, minuto) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [anio, mes, dia] = hoy.split('-').map(Number);
  const manana = new Date(Date.UTC(anio, mes - 1, dia + 1, 12)).toISOString().slice(0, 10);
  return `${manana}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockImplementation(async (ruta) => {
    if (ruta.startsWith('/promociones')) return PROMOCIONES;
    if (ruta === '/servicios') return SERVICIOS;
    if (ruta === '/vehiculos') return VEHICULOS;
    if (ruta.startsWith('/campanas')) return HISTORIAL;
    throw new Error(`Ruta inesperada en la prueba: ${ruta}`);
  });
  api.post.mockImplementation(async (ruta, cuerpo) => {
    if (ruta === '/campanas/estimar') {
      return { total: 3, exclusiones: { sinAutorizacion: 2, limiteSemanal: 1, sinCanal: 0 }, promocion: PROMOCIONES[0] };
    }
    if (ruta === '/campanas') {
      return {
        id: 'nueva',
        promocion: { nombre: 'Cambio de aceite' },
        estado: 'programada',
        programadaPara: cuerpo.programadaPara,
        totalDestinatarios: 3,
        ajustada: false,
      };
    }
    throw new Error(`Ruta inesperada en la prueba: ${ruta}`);
  });
});

const abrir = () => render(<CampanaPromociones />);

async function elegirPromocion() {
  fireEvent.click(await screen.findByRole('radio', { name: /Cambio de aceite/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}

async function llegarAPrevisualizacion({ dias = 60, servicios = [], tipos = [] } = {}) {
  abrir();
  await elegirPromocion();
  if (dias !== 60) fireEvent.change(screen.getByLabelText('Días sin visita'), { target: { value: String(dias) } });
  for (const nombre of servicios) fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(nombre) }));
  for (const tipo of tipos) fireEvent.click(screen.getByRole('checkbox', { name: tipo }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByText(/destinatarios recibirán la promoción/);
}

describe('HU-35 CA1/CA2/CA3 · segmento y previsualización', () => {
  it('ofrece solo promociones vigentes y pide elegir una antes de continuar', async () => {
    abrir();
    const radio = await screen.findByRole('radio', { name: /Cambio de aceite/ });
    expect(radio).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elige la promoción');
    expect(screen.queryByLabelText('Días sin visita')).not.toBeInTheDocument();
  });

  it('CA1: envía a la API los días, los servicios y los tipos elegidos', async () => {
    await llegarAPrevisualizacion({ dias: 90, servicios: ['Lavado premium'], tipos: ['Camioneta'] });

    expect(api.post).toHaveBeenCalledWith('/campanas/estimar', {
      promocionId: 'p1',
      segmento: { diasSinVisita: 90, servicioIds: ['s1'], tiposVehiculo: ['Camioneta'] },
    });
  });

  it('CA2/CA3: muestra el total y las exclusiones con su motivo, sin los motivos en cero', async () => {
    await llegarAPrevisualizacion();

    expect(screen.getByText(/destinatarios recibirán la promoción/).closest('p')).toHaveTextContent('3 destinatarios');
    const exclusiones = screen.getByRole('heading', { name: 'Se excluyen' }).closest('div');
    expect(within(exclusiones).getByText(/No autorizó promociones/)).toHaveTextContent('2');
    expect(within(exclusiones).getByText(/Ya recibió 2 promociones esta semana/)).toHaveTextContent('1');
    expect(within(exclusiones).queryByText(/Sin correo registrado/)).not.toBeInTheDocument();
  });

  it('permite agregar un tipo de vehículo que aún no está registrado', async () => {
    abrir();
    await elegirPromocion();
    fireEvent.change(screen.getByLabelText('Otro tipo'), { target: { value: 'Motocarro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tipo' }));
    const casilla = screen.getByRole('checkbox', { name: 'Motocarro' });
    expect(casilla).toBeChecked();
  });

  it('bloquea el avance cuando el segmento no tiene destinatarios', async () => {
    api.post.mockResolvedValueOnce({ total: 0, exclusiones: { sinAutorizacion: 5 }, promocion: PROMOCIONES[0] });
    abrir();
    await elegirPromocion();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByText(/destinatarios recibirán la promoción/);
    expect(screen.getByText(/destinatarios recibirán la promoción/).closest('p')).toHaveTextContent('0 destinatarios');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ajusta el segmento');
  });

  it('muestra el error de la API si la estimación falla', async () => {
    api.post.mockRejectedValueOnce(new Error('La promoción no está vigente'));
    abrir();
    await elegirPromocion();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('La promoción no está vigente')).toBeInTheDocument();
  });
});

describe('HU-35 CA4 · horario y confirmación', () => {
  async function llegarAHorario(valorFecha) {
    await llegarAPrevisualizacion();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    const campo = screen.getByLabelText('Fecha y hora de envío (hora de Colombia)');
    fireEvent.change(campo, { target: { value: valorFecha } });
    return campo;
  }

  async function llegarAConfirmacion(valorFecha) {
    const campo = await llegarAHorario(valorFecha);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    return campo;
  }

  it('avisa que las 9:30 p. m. se moverán a las 7:00 a. m. del día siguiente', async () => {
    await llegarAHorario(mananaBogota(21, 30));

    expect(screen.getByText(/fuera de la franja permitida/)).toBeInTheDocument();
    expect(screen.getByText(/Se enviará el/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/Pediste/)).toHaveTextContent('7:00 a. m.');
    expect(screen.getByText(/ajustado al horario permitido/)).toBeInTheDocument();
  });

  it('no avisa nada si la hora está dentro de la franja permitida', async () => {
    await llegarAHorario(mananaBogota(10, 0));

    expect(screen.queryByText(/fuera de la franja permitida/)).not.toBeInTheDocument();
    expect(screen.getByText(/Se enviará el/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByText(/ajustado al horario permitido/)).not.toBeInTheDocument();
  });

  it('confirma con la hora pedida y una clave de idempotencia', async () => {
    const valor = mananaBogota(10, 0);
    await llegarAConfirmacion(valor);
    fireEvent.click(screen.getByRole('button', { name: 'Programar campaña' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/campanas', expect.anything(), expect.anything()));
    const [ruta, cuerpo, opciones] = api.post.mock.calls.find(([r]) => r === '/campanas');
    expect(ruta).toBe('/campanas');
    expect(cuerpo).toEqual({
      promocionId: 'p1',
      segmento: { diasSinVisita: 60, servicioIds: [], tiposVehiculo: [] },
      programadaPara: new Date(`${valor}:00-05:00`).toISOString(),
    });
    expect(opciones.headers['Idempotency-Key']).toMatch(/.+/);
    expect(await screen.findByText('Campaña programada')).toBeInTheDocument();
  });
});

describe('HU-35 · historial de campañas', () => {
  it('muestra las campañas de la sede con estado, envío, destinatarios y exclusiones', async () => {
    abrir();

    const fila = (await screen.findByText('Promo anterior')).closest('tr');
    expect(within(fila).getByText('Enviada')).toBeInTheDocument();
    expect(within(fila).getByText('4')).toBeInTheDocument();
    expect(within(fila).getByText(/No autorizó promociones: 1/)).toBeInTheDocument();
  });

  it('avisa si el historial no se puede cargar', async () => {
    api.get.mockImplementation(async (ruta) => {
      if (ruta.startsWith('/campanas')) throw new Error('Sin conexión con el servidor');
      if (ruta.startsWith('/promociones')) return PROMOCIONES;
      if (ruta === '/servicios') return SERVICIOS;
      return VEHICULOS;
    });
    abrir();
    expect(await screen.findByText('Sin conexión con el servidor')).toBeInTheDocument();
  });
});

describe('HU-35 · reglas de horario en el navegador', () => {
  it('mueve las 9:30 p. m. a las 7:00 a. m. del día siguiente', () => {
    const { programadaPara, ajustada } = lib.ajustarHorarioBogota(
      new Date('2026-11-20T21:30:00-05:00'),
      new Date('2026-11-18T09:00:00-05:00'),
    );
    expect(programadaPara.toISOString()).toBe('2026-11-21T12:00:00.000Z');
    expect(ajustada).toBe(true);
  });

  it('deja igual una hora dentro de la franja', () => {
    const fecha = new Date('2026-11-20T15:00:00-05:00');
    const { programadaPara, ajustada } = lib.ajustarHorarioBogota(fecha, new Date('2026-11-18T09:00:00-05:00'));
    expect(programadaPara.toISOString()).toBe(fecha.toISOString());
    expect(ajustada).toBe(false);
  });

  it('interpreta el campo datetime-local en hora de Bogotá', () => {
    expect(lib.aFechaBogota('2026-11-20T21:30').toISOString()).toBe('2026-11-21T02:30:00.000Z');
    expect(lib.aFechaBogota('no-es-fecha')).toBeNull();
    expect(lib.aValorDatetimeLocal(new Date('2026-11-21T12:00:00.000Z'))).toBe('2026-11-21T07:00');
  });

  it('traduce las exclusiones y omite los conteos en cero', () => {
    expect(lib.resumenExclusiones({ sinAutorizacion: 2, limiteSemanal: 0, sinCanal: 1 })).toEqual([
      { clave: 'sinAutorizacion', etiqueta: 'No autorizó promociones', cantidad: 2 },
      { clave: 'sinCanal', etiqueta: 'Sin correo registrado', cantidad: 1 },
    ]);
    expect(lib.textoDias(90)).toBe('Sin visita hace 90 días o más');
  });
});
