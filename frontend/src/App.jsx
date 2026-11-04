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
import Superadmin from './pages/Superadmin.jsx';
import AceptarInvitacion from './pages/AceptarInvitacion.jsx';

const protegida = (ruta, elemento) => <RutaProtegida roles={rolesDeRuta(ruta)}>{elemento}</RutaProtegida>;
const conModulo = (modulo, pagina) => <RequiereModulo modulo={modulo}>{pagina}</RequiereModulo>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/recuperar" element={<RecuperarContrasena />} />
      <Route path="/restablecer" element={<RestablecerContrasena />} />
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
        <Route path="/aceptar-invitacion" element={<AceptarInvitacion />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
