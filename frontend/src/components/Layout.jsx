// Estructura común de las páginas privadas: menú lateral + contenido.
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useSesion } from '../hooks/useSesion.js';

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
  const { usuario, establecimiento, errorSesion } = useSesion();

  // En celular el menú se desliza de lado: la opción actual siempre queda a la vista.
  useEffect(() => {
    const nav = navegacion.current;
    const activo = nav.querySelector('.active');
    if (activo) nav.scrollLeft = activo.offsetLeft - (nav.clientWidth - activo.offsetWidth) / 2;
  }, [pathname]);

  return (
    <div className="layout">
      <aside className="menu">
        <div className="menu-marca">
          <h1 className="logo">Zaru</h1>
          {establecimiento && <span className="texto-suave">{establecimiento.nombre}</span>}
        </div>

        <nav ref={navegacion}>
          {MENU.map((item) => (
            <NavLink key={item.ruta} to={item.ruta} end className="menu-item">
              {item.texto}
            </NavLink>
          ))}
        </nav>

        <div className="menu-usuario">
          {usuario && (
            <>
              <strong>{usuario.nombre}</strong>
              <span className="texto-suave">
                {usuario.rol === 'admin' ? 'Administrador' : 'Operario'}
              </span>
            </>
          )}
          <button
            type="button"
            className="boton secundario"
            onClick={() => supabase.auth.signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="contenido">
        {errorSesion && (
          <p className="aviso aviso-advertencia" role="status">
            {errorSesion}
          </p>
        )}
        <Outlet /> {/* Aquí se dibuja la página actual */}
      </main>
    </div>
  );
}
