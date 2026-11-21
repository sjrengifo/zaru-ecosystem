// HU-59 — Navegación real del panel: menú por rol y bloqueo de secciones escritas a mano.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { api, estadoSesion } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, estadoSesion: { usuario: null } }));
vi.mock('../src/services/api.js', () => ({ api }));
// El tablero lee de Supabase; se simula para que no aparezca un 2.º role="alert" (error de carga) que choque con el aviso de acceso.
vi.mock('../src/services/dashboard.js', () => ({ listarOrdenesDelTablero: async () => [] }));
vi.mock('../src/hooks/useSesion.js', () => ({
  useSesion: () => ({
    sesion: { access_token: 't' }, cargando: false, usuario: estadoSesion.usuario,
    establecimiento: { nombre: 'Lavadero A' }, errorSesion: '', recuperacion: false,
  }),
}));
vi.mock('../src/lib/supabase.js', () => {
  const canal = { on: () => canal, subscribe: () => canal };
  return { supabase: { channel: () => canal, removeChannel: () => {}, auth: { signOut: vi.fn() } } };
});

const { default: App } = await import('../src/App.jsx');

const PERMISOS = {
  operario: { modulos: ['dashboard', 'clientes', 'vehiculos'], inicio: '/' },
  admin: { modulos: ['dashboard', 'clientes', 'vehiculos', 'servicios', 'promociones', 'usuarios', 'branding', 'reportes'], inicio: '/' },
  superadmin: { modulos: ['superadmin'], inicio: '/superadmin' },
};

function sesionDe(rol) {
  estadoSesion.usuario = { id: 'u1', nombre: `Usuario ${rol}`, rol, permisos: PERMISOS[rol] };
  api.get.mockImplementation(async (ruta) => {
    if (ruta === '/me') return { usuario: { id: 'u1', nombre: `Usuario ${rol}`, rol }, permisos: PERMISOS[rol] };
    if (ruta === '/establecimiento') return { nombre: 'Lavadero A' };
    if (ruta.startsWith('/superadmin')) return [];
    return [];
  });
}

const abrir = (ruta) => render(<MemoryRouter initialEntries={[ruta]}><App /></MemoryRouter>);

beforeEach(() => { api.get.mockReset(); });

describe('HU-59 · panel según el rol', () => {
  it('CA1: el operario solo ve en el menú sus opciones de trabajo diario', async () => {
    sesionDe('operario');
    abrir('/');
    const menu = await screen.findByRole('navigation');
    const opciones = [...menu.querySelectorAll('a')].map((a) => a.textContent);
    expect(opciones).toEqual(['Dashboard', 'Clientes', 'Vehículos']);
    expect(screen.getByText('Operario')).toBeInTheDocument();
  });

  it('CA2: el administrador ve todos los módulos', async () => {
    sesionDe('admin');
    abrir('/');
    const menu = await screen.findByRole('navigation');
    expect([...menu.querySelectorAll('a')].map((a) => a.textContent)).toEqual(
      ['Dashboard', 'Clientes', 'Vehículos', 'Servicios', 'Promociones', 'Usuarios', 'Branding', 'Reportes'],
    );
  });

  it.each(['/promociones', '/branding', '/usuarios', '/servicios'])(
    'CA3: el operario que escribe %s a mano vuelve al inicio con un aviso',
    async (ruta) => {
      sesionDe('operario');
      abrir(ruta);
      expect(await screen.findByRole('alert')).toHaveTextContent('No tienes acceso a esa sección');
      expect(screen.getByRole('heading', { name: 'Dashboard operativo' })).toBeInTheDocument(); // el h2 real de la página es "Dashboard operativo"
    },
  );

  it('CA3: un administrador no puede abrir la administración de la plataforma', async () => {
    sesionDe('admin');
    abrir('/superadmin');
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes acceso');
    expect(screen.queryByText('Establecimientos afiliados')).not.toBeInTheDocument();
  });

  it('el superadministrador que abre el panel de un establecimiento vuelve a su inicio', async () => {
    sesionDe('superadmin');
    abrir('/clientes');
    expect(await screen.findByText('Establecimientos afiliados')).toBeInTheDocument();
  });
});
