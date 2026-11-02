// Estructura común de las páginas privadas: menú lateral + contenido.
// HU-13 CA2: aplica el logo y los colores guardados de la sede a todo el panel.
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';

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
  const [establecimiento, setEstablecimiento] = useState(null);
  const [errorEstablecimiento, setErrorEstablecimiento] = useState('');

  useEffect(() => {
    let vigente = true;
    api
      .get('/establecimiento')
      .then((datos) => vigente && setEstablecimiento(datos))
      .catch((e) => vigente && setErrorEstablecimiento(e.message)); // Sin branding el panel sigue con los colores de Zaru.
    return () => {
      vigente = false;
    };
  }, []);

  // Los colores de la sede reemplazan las variables de global.css; los tonos derivados se calculan solos.
  useEffect(() => {
    const raiz = document.documentElement.style;
    const colores = { '--color-primario': establecimiento?.color_primario, '--color-secundario': establecimiento?.color_secundario };
    for (const [variable, valor] of Object.entries(colores)) {
      if (valor) raiz.setProperty(variable, valor);
    }
    return () => Object.keys(colores).forEach((variable) => raiz.removeProperty(variable));
  }, [establecimiento?.color_primario, establecimiento?.color_secundario]);

  // En celular el menú se desliza de lado: la opción actual siempre queda a la vista.
  useEffect(() => {
    const nav = navegacion.current;
    const activo = nav.querySelector('.active');
    if (activo) nav.scrollLeft = activo.offsetLeft - (nav.clientWidth - activo.offsetWidth) / 2;
  }, [pathname]);

  return (
    <div className="layout">
      <aside className="menu">
        <h1 className="logo">
          {establecimiento?.logo_url ? <img src={establecimiento.logo_url} alt={establecimiento.nombre} /> : 'Zaru'}
        </h1>
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
        <Outlet context={{ establecimiento, setEstablecimiento, errorEstablecimiento }} /> {/* Aquí se dibuja la página actual */}
      </main>
    </div>
  );
}
