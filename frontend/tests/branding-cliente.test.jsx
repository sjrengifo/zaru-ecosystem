// HU-22 — Personalización del branding de la sede en la app del cliente final (ZARU-41).
// CA1: si el administrador configuró su logo y sus colores en el panel, la web móvil del cliente de esa
// sede carga con ese logotipo y esa paleta. Cada sede ve solo su marca; sin marca se usa la de Zaru.
// La API se simula con fetch y el flujo de eventos del seguimiento con un EventSource mínimo.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AccesoCliente from '../src/pages/AccesoCliente.jsx';
import Seguimiento from '../src/pages/Seguimiento.jsx';

const SEDE_A = {
  slug: 'lavadero-norte',
  nombre: 'Lavadero Norte',
  logoUrl: 'https://cdn.ejemplo.test/logos/norte.png',
  colorPrimario: '#B91C1C',
  colorSecundario: '#F59E0B',
};
const SEDE_B = { slug: 'lavadero-sur', nombre: 'Lavadero Sur', logoUrl: null, colorPrimario: null, colorSecundario: null };
const SEDES = { [SEDE_A.slug]: SEDE_A, [SEDE_B.slug]: SEDE_B };

const respuesta = (status, cuerpo) => Promise.resolve({ ok: status < 400, status, json: async () => cuerpo });

/** Seguimiento mínimo de una orden con la marca de la sede que se indique. */
function seguimiento({ nombre, logoUrl, colorPrimario, colorSecundario }) {
  return {
    codigo: '7KQ2M9XH4P',
    estado: 'en_lavado',
    etapa: { estado: 'en_lavado', titulo: 'Lavado iniciado', descripcion: 'Estamos lavando tu vehículo', paso: 2, totalPasos: 5 },
    etapas: [
      { estado: 'recibido', titulo: 'En cola', completada: true, actual: false, omitida: false, at: '2026-11-10T14:00:00Z', terminadaAt: '2026-11-10T14:10:00Z' },
      { estado: 'en_lavado', titulo: 'Lavado iniciado', completada: false, actual: true, omitida: false, at: '2026-11-10T14:10:00Z', terminadaAt: null },
    ],
    entregaEstimadaAt: null,
    vehiculo: { placa: 'ABC123', marca: 'Mazda', color: 'Rojo' },
    servicios: [{ nombre: 'Lavado general', precio: 30000 }],
    subtotal: 30000,
    descuento: 0,
    total: 30000,
    notaPago: 'El pago se realiza en el establecimiento',
    establecimiento: { nombre, logoUrl, colorPrimario, colorSecundario },
    version: 1,
  };
}

class EventSourceFalso {
  addEventListener() {}
  close() {}
}

const abrir = (ruta) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/s/:slug" element={<AccesoCliente />} />
        <Route path="/seguimiento" element={<Seguimiento />} />
        <Route path="/seguimiento/:codigo" element={<Seguimiento />} />
      </Routes>
    </MemoryRouter>,
  );

const variable = (elemento, nombre) => elemento.style.getPropertyValue(nombre);

beforeEach(() => {
  vi.stubGlobal('EventSource', EventSourceFalso);
  // GET /publico/sedes/{slug}: cada slug responde con la marca de su propia sede.
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const slug = decodeURIComponent(String(url).split('/publico/sedes/')[1] ?? '');
      return SEDES[slug] ? respuesta(200, SEDES[slug]) : respuesta(404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'Sede no encontrada' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HU-22 CA1 · pantalla de acceso de la sede (/s/:slug)', () => {
  it('carga con el logo y los colores que la sede configuró en el panel', async () => {
    const { container } = abrir('/s/lavadero-norte');
    const logo = await screen.findByRole('img', { name: 'Lavadero Norte' });
    expect(logo).toHaveAttribute('src', SEDE_A.logoUrl);
    const pagina = container.querySelector('main.seguimiento');
    expect(variable(pagina, '--color-primario')).toBe('#B91C1C');
    expect(variable(pagina, '--color-secundario')).toBe('#F59E0B');
  });

  it('sin logo muestra el nombre de la sede, y sin colores deja los de Zaru', async () => {
    const { container } = abrir('/s/lavadero-sur');
    await screen.findByRole('heading', { name: 'Sigue tu vehículo' });
    expect(screen.queryByRole('img', { name: 'Lavadero Sur' })).not.toBeInTheDocument();
    expect(container.querySelector('.seg-sede')).toHaveTextContent('Lavadero Sur');
    const pagina = container.querySelector('main.seguimiento');
    expect(variable(pagina, '--color-primario')).toBe('');
    expect(variable(pagina, '--color-secundario')).toBe('');
  });

  it('cada sede recibe solo su marca: la sede B no muestra el logo ni los colores de la A', async () => {
    const a = abrir('/s/lavadero-norte');
    await screen.findByRole('img', { name: 'Lavadero Norte' });
    a.unmount();

    const { container } = abrir('/s/lavadero-sur');
    await screen.findByRole('heading', { name: 'Sigue tu vehículo' });
    expect(container.querySelector(`img[src="${SEDE_A.logoUrl}"]`)).toBeNull();
    expect(container.innerHTML).not.toContain('#B91C1C');
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/publico/sedes/lavadero-sur'));
  });

  it('un color que no es #RRGGBB no se aplica a la pantalla', async () => {
    SEDES['lavadero-raro'] = { ...SEDE_B, slug: 'lavadero-raro', nombre: 'Lavadero Raro', colorPrimario: 'red;background:url(x)' };
    const { container } = abrir('/s/lavadero-raro');
    await screen.findByRole('heading', { name: 'Sigue tu vehículo' });
    expect(variable(container.querySelector('main.seguimiento'), '--color-primario')).toBe('');
    delete SEDES['lavadero-raro'];
  });
});

describe('HU-22 CA1 · seguimiento del lavado (/seguimiento/:codigo)', () => {
  it('muestra el logo de la sede y aplica sus colores a toda la página, no solo al contenido', async () => {
    fetch.mockImplementation(() => respuesta(200, seguimiento(SEDE_A)));
    const { container } = abrir('/seguimiento/7KQ2M9XH4P');
    await screen.findByRole('heading', { level: 1, name: 'Lavado iniciado' });
    expect(screen.getByRole('img', { name: 'Lavadero Norte' })).toHaveAttribute('src', SEDE_A.logoUrl);
    const pagina = container.querySelector('main.seguimiento');
    expect(variable(pagina, '--color-primario')).toBe('#B91C1C');
    expect(variable(pagina, '--color-secundario')).toBe('#F59E0B');
  });

  it('una sede sin logo se identifica con su nombre', async () => {
    fetch.mockImplementation(() => respuesta(200, seguimiento({ ...SEDE_B, colorPrimario: '#2563EB', colorSecundario: '#0EA5E9' })));
    const { container } = abrir('/seguimiento/7KQ2M9XH4P');
    await screen.findByRole('heading', { level: 1, name: 'Lavado iniciado' });
    expect(screen.queryByRole('img', { name: 'Lavadero Sur' })).not.toBeInTheDocument();
    expect(container.querySelector('.seg-sede')).toHaveTextContent('Lavadero Sur');
  });

  it('sin código no hay sede: la página usa la marca de Zaru', () => {
    const { container } = abrir('/seguimiento');
    expect(container.querySelector('main.seguimiento').getAttribute('style')).toBeNull();
  });
});

describe('HU-22 CA1 · los tonos derivados siguen el color de la sede', () => {
  // jsdom no calcula estilos de las hojas importadas: se comprueba la regla en la hoja de estilos.
  const css = readFileSync(resolve(__dirname, '../src/styles/seguimiento.css'), 'utf8');

  it('el hover y los fondos suaves se recalculan donde llega el color de la sede', () => {
    const regla = css.match(/\.seguimiento,\s*\.seg-contenido\s*\{([^}]*)\}/);
    expect(regla).not.toBeNull();
    for (const token of ['--color-primario-hover', '--color-primario-suave', '--color-primario-suave-hover']) {
      expect(regla[1]).toMatch(new RegExp(`${token}:\\s*color-mix\\(in srgb, var\\(--color-primario\\)`));
    }
  });
});
