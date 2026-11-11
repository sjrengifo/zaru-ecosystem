// Mapa de rutas: qué página se muestra en cada dirección (URL).
import { Routes, Route, Navigate } from 'react-router-dom';
import RutaProtegida, { RequiereModulo } from './components/RutaProtegida.jsx';
import Layout from './components/Layout.jsx';
import { rolesDeRuta } from './lib/rutas.js';

import Login from './pages/Login.jsx';
import RecuperarContrasena from './pages/RecuperarContrasena.jsx';
import RestablecerContrasena from './pages/RestablecerContrasena.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clientes from './pages/Clientes.jsx';
import Vehiculos from './pages/Vehiculos.jsx';
import Servicios from './pages/Servicios.jsx';
import Promociones from './pages/Promociones.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Branding from './pages/Branding.jsx';
import Reportes from './pages/Reportes.jsx';
import HistorialNotificaciones from './pages/HistorialNotificaciones.jsx';
import Superadmin from './pages/Superadmin.jsx';
import AceptarInvitacion from './pages/AceptarInvitacion.jsx';
import Seguimiento from './pages/Seguimiento.jsx';
import AccesoCliente from './pages/AccesoCliente.jsx';
import BajaNotificaciones from './pages/BajaNotificaciones.jsx';
import PoliticaDatos from './pages/PoliticaDatos.jsx';
import HistorialCliente from './pages/HistorialCliente.jsx';
import NotificacionesCliente from './pages/NotificacionesCliente.jsx';

const protegida = (ruta, elemento) => <RutaProtegida roles={rolesDeRuta(ruta)}>{elemento}</RutaProtegida>;
const conModulo = (modulo, pagina) => <RequiereModulo modulo={modulo}>{pagina}</RequiereModulo>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/recuperar" element={<RecuperarContrasena />} />
      <Route path="/restablecer" element={<RestablecerContrasena />} />
      {/* HU-18: pantalla pública del cliente final; no usa la sesión del panel. */}
      <Route path="/seguimiento" element={<Seguimiento />} />
      <Route path="/seguimiento/:codigo" element={<Seguimiento />} />
      {/* HU-17: el cliente entra desde el enlace o el QR de su sede con la placa o el celular. */}
      <Route path="/s/:slug" element={<AccesoCliente />} />
      {/* HU-30: "dejar de recibir" desde el correo y la política que enlazan las casillas de autorización. */}
      <Route path="/baja/:token" element={<BajaNotificaciones />} />
      <Route path="/politica-datos" element={<PoliticaDatos />} />
      {/* HU-23 / HU-24: historial y detalle de servicios del cliente final, con placa + celular. */}
      <Route path="/s/:slug/historial" element={<HistorialCliente />} />
      {/* HU-38: centro de notificaciones del cliente final, con el mismo pase del historial. */}
      <Route path="/s/:slug/notificaciones" element={<NotificacionesCliente />} />
      <Route path="/superadmin" element={protegida('/superadmin', <Superadmin />)} />

      <Route element={<RutaProtegida><Layout /></RutaProtegida>}>
        <Route path="/" element={conModulo('dashboard', <Dashboard />)} />
        <Route path="/clientes" element={conModulo('clientes', <Clientes />)} />
        <Route path="/vehiculos" element={conModulo('vehiculos', <Vehiculos />)} />
        <Route path="/servicios" element={protegida('/servicios', conModulo('servicios', <Servicios />))} />
        <Route path="/promociones" element={protegida('/promociones', conModulo('promociones', <Promociones />))} />
        <Route path="/usuarios" element={protegida('/usuarios', conModulo('usuarios', <Usuarios />))} />
        <Route path="/branding" element={protegida('/branding', conModulo('branding', <Branding />))} />
        <Route path="/reportes" element={protegida('/reportes', conModulo('reportes', <Reportes />))} />
        <Route path="/notificaciones" element={protegida('/notificaciones', conModulo('notificaciones', <HistorialNotificaciones />))} />
        <Route path="/aceptar-invitacion" element={<AceptarInvitacion />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
