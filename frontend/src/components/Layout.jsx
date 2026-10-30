// Estructura común de las páginas privadas: menú lateral + contenido.
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  const { pathname } = useLocation();
  const navegacion = useRef(null);

  // En celular el menú se desliza de lado: la opción actual siempre queda a la vista.
  useEffect(() => {
    const nav = navegacion.current;
    const activo = nav.querySelector('.active');
    if (activo) nav.scrollLeft = activo.offsetLeft - (nav.clientWidth - activo.offsetWidth) / 2;
  }, [pathname]);

  return (
    <div className="layout">
      <aside className="menu">
        <h1 className="logo">Zaru</h1>
        <nav ref={navegacion}>
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
