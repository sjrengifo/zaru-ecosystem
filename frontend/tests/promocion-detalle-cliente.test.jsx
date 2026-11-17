// HU-27 — Detalle y condiciones de una promoción (ZARU-46 · RF-F5-10).
// CA1: al seleccionar la tarjeta de una promoción activa se abre una vista ampliada con la descripción
//      completa y las condiciones de uso configuradas por el establecimiento.
// Además: "Válida hasta" sin corrimiento de zona horaria, logo y colores de la sede, sin huecos cuando
// faltan descripción o condiciones, y un mensaje amable si la promoción ya no está disponible.
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PromocionesCliente from '../src/pages/PromocionesCliente.jsx';
import PromocionDetalleCliente from '../src/pages/PromocionDetalleCliente.jsx';

const SEDE_A = { slug: 'lavadero-norte', nombre: 'Lavadero Norte', logoUrl: 'https://cdn.ejemplo.test/logos/norte.png', colorPrimario: '#B91C1C', colorSecundario: '#F59E0B' };
const SEDE_B = { slug: 'lavadero-sur', nombre: 'Lavadero Sur', logoUrl: null, colorPrimario: null, colorSecundario: null };

const MOTOR = {
  id: 'a1',
  nombre: 'Martes de motor',
  descripcion: '20 % en el lavado de motor todos los martes. Incluye desengrase y secado con aire a presión.',
  condiciones: 'Válida solo los martes.\nNo acumulable con otras promociones.',
  descuentoPct: 20,
  fechaInicio: '2026-11-01',
  fechaFin: '2026-11-30',
  servicios: ['Lavado de motor', 'Lavado básico'],
};
const SIN_TEXTOS = { id: 'a2', nombre: 'Aspirado', descripcion: null, condiciones: null, descuentoPct: 12.5, fechaInicio: '2026-11-01', fechaFin: '2026-12-01', servicios: [] };

const DETALLES = { 'lavadero-norte': { a1: MOTOR, a2: SIN_TEXTOS }, 'lavadero-sur': {} };
const SEDES = { 'lavadero-norte': SEDE_A, 'lavadero-sur': SEDE_B };
const lista = (p) => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion, descuentoPct: p.descuentoPct, fechaFin: p.fechaFin, servicios: p.servicios });

const respuesta = (status, cuerpo) => Promise.resolve({ ok: status < 400, status, json: async () => cuerpo });
const noEncontrado = (mensaje) => respuesta(404, { error: { codigo: 'NO_ENCONTRADO', mensaje } });

const abrir = (ruta) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/s/:slug/promociones" element={<PromocionesCliente />} />
        <Route path="/s/:slug/promociones/:id" element={<PromocionDetalleCliente />} />
      </Routes>
    </MemoryRouter>,
  );

const tzOriginal = process.env.TZ;
beforeAll(() => {
  // Colombia (UTC-5) y un "hoy" fijo: así "Válida hasta" no depende del día en que corra la prueba.
  process.env.TZ = 'America/Bogota';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T15:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = tzOriginal;
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const [slugCodificado, , idCodificado] = String(url).split('/publico/sedes/')[1].split('/');
      const slug = decodeURIComponent(slugCodificado);
      if (!SEDES[slug]) return noEncontrado('Sede no encontrado');
      if (idCodificado === undefined) return respuesta(200, { sede: SEDES[slug], promociones: Object.values(DETALLES[slug]).map(lista) });
      const promocion = DETALLES[slug][decodeURIComponent(idCodificado)];
      return promocion ? respuesta(200, { sede: SEDES[slug], promocion }) : noEncontrado('Promoción no encontrada');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HU-27 · detalle y condiciones de una promoción', () => {
  it('CA1: la tarjeta de la lista enlaza al detalle de su promoción', async () => {
    abrir('/s/lavadero-norte/promociones');
    const listaPromos = await screen.findByRole('list', { name: 'Promociones de Lavadero Norte' });
    const enlaces = within(listaPromos).getAllByRole('link');
    expect(enlaces.map((e) => e.getAttribute('href'))).toEqual(['/s/lavadero-norte/promociones/a1', '/s/lavadero-norte/promociones/a2']);
  });

  it('CA1: al seleccionar la tarjeta se abre la vista ampliada con la descripción completa y las condiciones', async () => {
    abrir('/s/lavadero-norte/promociones');
    const listaPromos = await screen.findByRole('list', { name: 'Promociones de Lavadero Norte' });
    fireEvent.click(within(listaPromos).getAllByRole('link')[0]);

    expect(await screen.findByRole('heading', { level: 1, name: 'Martes de motor' })).toBeInTheDocument();
    expect(screen.getByText(MOTOR.descripcion)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Condiciones de uso' })).toBeInTheDocument();
    expect(screen.getByText(/Válida solo los martes\.\s+No acumulable con otras promociones\./)).toBeInTheDocument();
    expect(screen.getByText('20 %')).toBeInTheDocument();
    const servicios = screen.getByRole('heading', { name: 'Servicios incluidos' }).nextElementSibling;
    expect(within(servicios).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Lavado de motor', 'Lavado básico']);
    expect(fetch.mock.calls.map(([u]) => String(u)).at(-1)).toMatch(/\/publico\/sedes\/lavadero-norte\/promociones\/a1$/);
  });

  it('"Válida hasta" muestra el 30 de nov (sin correrse al 29) con la fecha exacta en dateTime', async () => {
    abrir('/s/lavadero-norte/promociones/a1');
    const fecha = await screen.findByText('Válida hasta el 30 de nov');
    expect(fecha).toHaveAttribute('dateTime', '2026-11-30');
    expect(fecha.textContent).not.toContain('29');
  });

  it('usa el logo y los colores de la sede', async () => {
    const { container } = abrir('/s/lavadero-norte/promociones/a1');
    expect(await screen.findByRole('img', { name: 'Lavadero Norte' })).toHaveAttribute('src', SEDE_A.logoUrl);
    const main = container.querySelector('main');
    expect(main.style.getPropertyValue('--color-primario')).toBe('#B91C1C');
    expect(main.style.getPropertyValue('--color-secundario')).toBe('#F59E0B');
  });

  it('sin descripción, condiciones ni servicios no deja secciones vacías', async () => {
    const { container } = abrir('/s/lavadero-norte/promociones/a2');
    expect(await screen.findByRole('heading', { level: 1, name: 'Aspirado' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Condiciones de uso' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Servicios incluidos' })).not.toBeInTheDocument();
    expect(container.querySelector('.promo-detalle-descripcion')).toBeNull();
    expect(screen.getByText('12,5 %')).toBeInTheDocument();
  });

  it('"← Volver a promociones" regresa a la lista de la sede', async () => {
    abrir('/s/lavadero-norte/promociones/a1');
    const volver = await screen.findByRole('link', { name: 'Volver a promociones' });
    expect(volver).toHaveAttribute('href', '/s/lavadero-norte/promociones');
    fireEvent.click(volver);
    expect(await screen.findByRole('list', { name: 'Promociones de Lavadero Norte' })).toBeInTheDocument();
  });

  it('una promoción que ya no está disponible muestra un mensaje amable con la marca de la sede', async () => {
    const { container } = abrir('/s/lavadero-norte/promociones/vencida');
    expect(await screen.findByRole('heading', { name: 'Esta promoción ya no está disponible' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a promociones' })).toHaveAttribute('href', '/s/lavadero-norte/promociones');
    expect(screen.getByRole('img', { name: 'Lavadero Norte' })).toBeInTheDocument();
    expect(container.querySelector('main').style.getPropertyValue('--color-primario')).toBe('#B91C1C');
  });

  it('una promoción de otra sede no se muestra con el slug ajeno', async () => {
    abrir('/s/lavadero-sur/promociones/a1');
    expect(await screen.findByRole('heading', { name: 'Esta promoción ya no está disponible' })).toBeInTheDocument();
    expect(screen.queryByText('Martes de motor')).not.toBeInTheDocument();
  });

  it('una sede inexistente muestra que el enlace no está disponible', async () => {
    abrir('/s/no-existe/promociones/a1');
    expect(await screen.findByText('Este enlace no está disponible')).toBeInTheDocument();
  });

  it('un error de red ofrece reintentar', async () => {
    fetch.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    abrir('/s/lavadero-norte/promociones/a1');
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Martes de motor' })).toBeInTheDocument();
  });
});
