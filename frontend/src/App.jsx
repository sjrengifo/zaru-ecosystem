// Mapa de rutas: qué página se muestra en cada dirección (URL).
import { Routes, Route, Navigate } from 'react-router-dom';
import RutaProtegida from './components/RutaProtegida.jsx';
import Layout from './components/Layout.jsx';


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
import Superadmin from './pages/Superadmin.jsx';
import AceptarInvitacion from './pages/AceptarInvitacion.jsx';

export default function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/recuperar" element={<RecuperarContrasena />} />
      <Route path="/restablecer" element={<RestablecerContrasena />} />

      <Route path="/superadmin" element={<RutaProtegida roles={['superadmin']}><Superadmin /></RutaProtegida>} />

      {/* Privadas: exigen sesión y comparten el menú lateral */}
      <Route element={<RutaProtegida><Layout /></RutaProtegida>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/vehiculos" element={<Vehiculos />} />
        <Route path="/servicios" element={<Servicios />} />
        <Route path="/promociones" element={<Promociones />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/branding" element={<Branding />} />
        <Route path="/aceptar-invitacion" element={<AceptarInvitacion />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
