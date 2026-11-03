// Estructura común de las páginas privadas: menú lateral + contenido.
// HU-13 CA2: aplica el logo y los colores guardados de la sede a todo el panel. Al recargar se usa la
// última copia conocida (lib/brandingGuardado.js) para no mostrar primero el branding de Zaru.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { leerBranding, guardarBranding, borrarBranding } from '../lib/brandingGuardado.js';
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
  const [establecimiento, setEstablecimiento] = useState(leerBranding);
  const [cargado, setCargado] = useState(false);
  const [errorEstablecimiento, setErrorEstablecimiento] = useState('');

  useEffect(() => {
    let vigente = true;
    api
      .get('/establecimiento')
      .then((datos) => {
        if (!vigente) return;
        setEstablecimiento(datos);
        setCargado(true);
      })
      .catch((e) => {
        if (!vigente) return;
        setErrorEstablecimiento(e.message); // Sin branding el panel sigue con los colores de Zaru.
        setCargado(true);
      });
    return () => {
      vigente = false;
    };
  }, []);

  // Cada versión que llega de la API (o que guarda la página de Branding) queda como copia para la próxima carga.
  useEffect(() => {
    if (cargado && establecimiento) guardarBranding(establecimiento);
  }, [cargado, establecimiento]);

  // Los colores de la sede reemplazan las variables de global.css; los tonos derivados se calculan solos.
  // useLayoutEffect los aplica antes de pintar la pantalla, así no se alcanzan a ver los colores de Zaru.
  useLayoutEffect(() => {
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
          {establecimiento?.logo_url ? (
            <img src={establecimiento.logo_url} alt={establecimiento.nombre} />
          ) : establecimiento || cargado ? (
            'Zaru'
          ) : (
            <span className="logo-espacio" aria-label="Cargando" /> // Reserva el lugar del logo mientras llega.
          )}
        </h1>
        <nav ref={navegacion}>
          {MENU.map((item) => (
            <NavLink key={item.ruta} to={item.ruta} end className="menu-item">
              {item.texto}
            </NavLink>
          ))}
        </nav>
        <button
          className="boton secundario"
          onClick={() => {
            borrarBranding(); // Quien entre después en este equipo no ve el branding de esta sede.
            supabase.auth.signOut();
          }}
        >
          Cerrar sesión
        </button>
      </aside>

      <main className="contenido">
        <Outlet context={{ establecimiento, setEstablecimiento, errorEstablecimiento }} /> {/* Aquí se dibuja la página actual */}
      </main>
    </div>
  );
}
