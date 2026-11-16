// HU-26 — Explorador de promociones activas de la sede (ZARU-45).
// CA1: el cliente ve solo las promociones vigentes que entrega la API para su sede (o un aviso si no hay).
// CA2: cada slug pide únicamente sus propias promociones; nunca aparecen las de otra sede.
// CA3: la pantalla usa el logo y los colores de la sede (HU-22).
// Además: "Válida hasta" sin corrimiento de zona horaria y tarjeta lista para el detalle (HU-27).
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PromocionesCliente from '../src/pages/PromocionesCliente.jsx';
import AccesoCliente from '../src/pages/AccesoCliente.jsx';
import TarjetaPromocion from '../src/components/TarjetaPromocion.jsx';
import { textoDescuento, validaHasta } from '../src/lib/promocionesCliente.js';

const SEDE_A = { slug: 'lavadero-norte', nombre: 'Lavadero Norte', logoUrl: 'https://cdn.ejemplo.test/logos/norte.png', colorPrimario: '#B91C1C', colorSecundario: '#F59E0B' };
const SEDE_B = { slug: 'lavadero-sur', nombre: 'Lavadero Sur', logoUrl: null, colorPrimario: null, colorSecundario: null };
const PROMOS = {
  [SEDE_A.slug]: [
    { id: 'a1', nombre: 'Martes de motor', descripcion: '20 % en el lavado de motor', descuentoPct: 20, fechaFin: '2026-11-30', servicios: ['Lavado de motor'] },
    { id: 'a2', nombre: 'Black Friday', descripcion: null, descuentoPct: 12.5, fechaFin: '2026-12-31', servicios: ['Lavado básico', 'Polichado'] },
  ],
  [SEDE_B.slug]: [],
};
const SEDES = { [SEDE_A.slug]: SEDE_A, [SEDE_B.slug]: SEDE_B };

const respuesta = (status, cuerpo) => Promise.resolve({ ok: status < 400, status, json: async () => cuerpo });

const abrir = (ruta) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/s/:slug" element={<AccesoCliente />} />
        <Route path="/s/:slug/promociones" element={<PromocionesCliente />} />
      </Routes>
    </MemoryRouter>,
  );

class EventSourceFalso {
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  vi.stubGlobal('EventSource', EventSourceFalso);
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const texto = String(url);
      const slug = decodeURIComponent(texto.split('/publico/sedes/')[1]?.split('/')[0] ?? '');
      if (!SEDES[slug]) return respuesta(404, { error: { codigo: 'NO_ENCONTRADO', mensaje: 'Sede no encontrada' } });
      if (texto.endsWith('/promociones')) return respuesta(200, { sede: SEDES[slug], promociones: PROMOS[slug] });
      if (texto.includes('/publico/cliente/')) return respuesta(401, { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Sin pase' } });
      return respuesta(200, SEDES[slug]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HU-26 · explorador de promociones', () => {
  it('se llega desde la pantalla de inicio de la sede con "Ver promociones"', async () => {
    abrir('/s/lavadero-norte');
    const enlace = await screen.findByRole('link', { name: 'Ver promociones de Lavadero Norte' });
    expect(enlace).toHaveAttribute('href', '/s/lavadero-norte/promociones');
  });

  it('CA1: muestra las promociones vigentes de la sede con descuento, servicios y vigencia', async () => {
    abrir('/s/lavadero-norte/promociones');
    const lista = await screen.findByRole('list', { name: 'Promociones de Lavadero Norte' });
    const tarjetas = within(lista).getAllByRole('listitem');
    expect(tarjetas).toHaveLength(2);
    expect(within(tarjetas[0]).getByText('Martes de motor')).toBeInTheDocument();
    expect(within(tarjetas[0]).getByText('20 %')).toBeInTheDocument();
    expect(within(tarjetas[0]).getByText('Lavado de motor')).toBeInTheDocument();
    expect(within(tarjetas[1]).getByText('12,5 %')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 promociones vigentes en Lavadero Norte');
  });

  it('CA1: si la sede no tiene promociones vigentes muestra un aviso claro', async () => {
    abrir('/s/lavadero-sur/promociones');
    expect(await screen.findByText('Hoy no hay promociones activas en Lavadero Sur.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('CA2: cada sede pide solo sus promociones y no ve las de otra', async () => {
    abrir('/s/lavadero-sur/promociones');
    await screen.findByText('Hoy no hay promociones activas en Lavadero Sur.');
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([expect.stringMatching(/\/publico\/sedes\/lavadero-sur\/promociones$/)]);
    expect(screen.queryByText('Martes de motor')).not.toBeInTheDocument();
  });

  it('CA3: usa el logo y los colores de la sede', async () => {
    const { container } = abrir('/s/lavadero-norte/promociones');
    expect(await screen.findByRole('img', { name: 'Lavadero Norte' })).toHaveAttribute('src', SEDE_A.logoUrl);
    const main = container.querySelector('main');
    expect(main.style.getPropertyValue('--color-primario')).toBe('#B91C1C');
    expect(main.style.getPropertyValue('--color-secundario')).toBe('#F59E0B');
  });

  it('CA3: una sede sin marca muestra su nombre y conserva los colores de Zaru', async () => {
    const { container } = abrir('/s/lavadero-sur/promociones');
    await screen.findByText('Hoy no hay promociones activas en Lavadero Sur.');
    expect(screen.queryByRole('img', { name: 'Lavadero Sur' })).not.toBeInTheDocument();
    expect(container.querySelector('main').style.getPropertyValue('--color-primario')).toBe('');
  });

  it('un enlace de una sede inexistente muestra que no está disponible', async () => {
    abrir('/s/no-existe/promociones');
    expect(await screen.findByText('Este enlace no está disponible')).toBeInTheDocument();
  });
});

describe('"Válida hasta" sin corrimiento de zona horaria', () => {
  const tzOriginal = process.env.TZ;
  beforeAll(() => {
    // Colombia (UTC-5): justo donde new Date('2026-11-30') se convierte en el 29 de noviembre.
    process.env.TZ = 'America/Bogota';
  });
  afterAll(() => {
    process.env.TZ = tzOriginal;
  });

  it('la prueba sí reproduce el riesgo: con new Date() la fecha saldría el día anterior', () => {
    expect(new Date('2026-11-30').getDate()).toBe(29);
  });

  it('fecha_fin 2026-11-30 se muestra como 30 de nov, no 29', () => {
    const texto = validaHasta('2026-11-30', '2026-11-15');
    expect(texto).toBe('Válida hasta el 30 de nov');
    expect(texto).not.toContain('29');
  });

  it('el primer día del mes no retrocede al mes anterior', () => {
    expect(validaHasta('2026-12-01', '2026-11-15')).toBe('Válida hasta el 1 de dic');
  });

  it('muestra el año cuando no es el actual y "solo hoy" cuando termina hoy', () => {
    expect(validaHasta('2027-01-31', '2026-11-15')).toBe('Válida hasta el 31 de ene de 2027');
    expect(validaHasta('2026-11-15', '2026-11-15')).toBe('Válida solo hoy');
    expect(validaHasta('basura')).toBe('');
  });

  it('la tarjeta renderiza el 30 con su fecha exacta en dateTime', () => {
    render(
      <MemoryRouter>
        <ul>
          <TarjetaPromocion promocion={PROMOS[SEDE_A.slug][0]} />
        </ul>
      </MemoryRouter>,
    );
    const fecha = screen.getByText(/Válida hasta el 30 de nov/);
    expect(fecha).toHaveAttribute('dateTime', '2026-11-30');
  });
});

describe('tarjeta lista para el detalle (HU-27)', () => {
  const promo = PROMOS[SEDE_A.slug][0];

  it('sin enlace es una tarjeta sin interacción', () => {
    render(<MemoryRouter><ul><TarjetaPromocion promocion={promo} /></ul></MemoryRouter>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Martes de motor' })).toBeInTheDocument();
  });

  it('con enlace toda la tarjeta lleva al detalle', () => {
    render(<MemoryRouter><ul><TarjetaPromocion promocion={promo} enlace="/s/lavadero-norte/promociones/a1" /></ul></MemoryRouter>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/s/lavadero-norte/promociones/a1');
  });

  it('textoDescuento usa la coma decimal', () => {
    expect(textoDescuento(20)).toBe('20 %');
    expect(textoDescuento('12.5')).toBe('12,5 %');
  });
});
