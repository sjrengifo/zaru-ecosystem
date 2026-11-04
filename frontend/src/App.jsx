// Mapa de rutas: qué página se muestra en cada dirección (URL).
// HU-59: cada página de módulo exige que el rol lo tenga (RequiereModulo); si no, vuelve al inicio.
import { Routes, Route, Navigate } from 'react-router-dom';
import RutaProtegida, { RequiereModulo } from './components/RutaProtegida.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clientes from './pages/Clientes.jsx';
import Vehiculos from './pages/Vehiculos.jsx';
import Servicios from './pages/Servicios.jsx';
import Promociones from './pages/Promociones.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Branding from './pages/Branding.jsx';
import Superadmin from './pages/Superadmin.jsx';
import AceptarInvitacion from './pages/AceptarInvitacion.jsx';

const conModulo = (modulo, pagina) => <RequiereModulo modulo={modulo}>{pagina}</RequiereModulo>;

export default function App() {
  return (
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<Login />} />

      {/* HU-57: administración de la plataforma, solo el superadministrador */}
      <Route path="/superadmin" element={<RutaProtegida roles={['superadmin']}><Superadmin /></RutaProtegida>} />

      {/* HU-57: el administrador invitado define su contraseña antes de ver el panel (sin menú) */}
      <Route path="/aceptar-invitacion" element={<RutaProtegida><AceptarInvitacion /></RutaProtegida>} />

      {/* Privadas: exigen sesión y comparten el menú lateral */}
      <Route element={<RutaProtegida><Layout /></RutaProtegida>}>
        <Route path="/" element={conModulo('dashboard', <Dashboard />)} />
        <Route path="/clientes" element={conModulo('clientes', <Clientes />)} />
        <Route path="/vehiculos" element={conModulo('vehiculos', <Vehiculos />)} />
        <Route path="/servicios" element={conModulo('servicios', <Servicios />)} />
        <Route path="/promociones" element={conModulo('promociones', <Promociones />)} />
        <Route path="/usuarios" element={conModulo('usuarios', <Usuarios />)} />
        <Route path="/branding" element={conModulo('branding', <Branding />)} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
