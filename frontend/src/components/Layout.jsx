// Estructura común de las páginas privadas: menú lateral + contenido.
import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const MENU = [
  { ruta: '/', texto: 'Dashboard' },
  { ruta: '/clientes', texto: 'Clientes' },
  { ruta: '/vehiculos', texto: 'Vehículos' },
  { ruta: '/servicios', texto: 'Servicios' },
  { ruta: '/promociones', texto: 'Promociones' },
  { ruta: '/usuarios', texto: 'Usuarios' },
  { ruta: '/branding', texto: 'Branding' },
];

export default function Layout() {
  return (
    <div className="layout">
      <aside className="menu">
        <h1 className="logo">Zaru</h1>
        <nav>
          {MENU.map((item) => (
            <NavLink key={item.ruta} to={item.ruta} end className="menu-item">
              {item.texto}
            </NavLink>
          ))}
        </nav>
        <button className="boton secundario" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </aside>

      <main className="contenido">
        <Outlet /> {/* Aquí se dibuja la página actual */}
      </main>
    </div>
  );
}
