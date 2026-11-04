// Estructura común de las páginas privadas: menú lateral + contenido.
// HU-13 CA2: aplica el logo y los colores guardados de la sede a todo el panel. Al recargar se usa la
// última copia conocida (lib/brandingGuardado.js) para no mostrar primero el branding de Zaru.
// HU-59 CA1/CA2: el menú muestra solo los módulos del rol. CA3: si se intentó abrir una sección
// ajena, RutaProtegida/RequiereModulo traen al usuario aquí y se muestra el aviso.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { leerBranding, guardarBranding, borrarBranding } from '../lib/brandingGuardado.js';
import { menuPara, NOMBRE_ROL } from '../lib/permisos.js';
import { usePerfil } from '../hooks/usePerfil.js';
import { api } from '../services/api.js';

export default function Layout() {
  const { pathname, state } = useLocation();
  const navegar = useNavigate();
  const perfil = usePerfil();
  const menu = menuPara(perfil);
  const [accesoDenegado, setAccesoDenegado] = useState(state?.accesoDenegado ?? null);

  // El aviso se toma una vez y se limpia del historial: al recargar o volver no reaparece.
  useEffect(() => {
    if (!state?.accesoDenegado) return;
    setAccesoDenegado(state.accesoDenegado);
    navegar(pathname, { replace: true, state: null });
  }, [state?.accesoDenegado, pathname, navegar]);
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
          {menu.map((item) => (
            <NavLink key={item.ruta} to={item.ruta} end className="menu-item">
              {item.texto}
            </NavLink>
          ))}
        </nav>
        {perfil && (
          <p className="menu-usuario">
            <span className="menu-usuario-nombre">{perfil.nombre}</span>
            <span className={`rol-insignia rol-${perfil.rol}`}>{NOMBRE_ROL[perfil.rol] ?? perfil.rol}</span>
          </p>
        )}
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
        {accesoDenegado && (
          <div className="aviso aviso-advertencia aviso-acceso" role="alert">
            <p>No tienes acceso a esa sección con tu rol. Te trajimos a tu página de inicio.</p>
            <button type="button" className="boton-icono" aria-label="Cerrar aviso" onClick={() => setAccesoDenegado(null)}>×</button>
          </div>
        )}
        <Outlet context={{ establecimiento, setEstablecimiento, errorEstablecimiento }} /> {/* Aquí se dibuja la página actual */}
      </main>
    </div>
  );
}
