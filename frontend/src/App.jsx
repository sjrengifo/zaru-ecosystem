// Mapa de rutas: qué página se muestra en cada dirección (URL).
import { Routes, Route, Navigate } from 'react-router-dom';
import RutaProtegida from './components/RutaProtegida.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clientes from './pages/Clientes.jsx';
import Vehiculos from './pages/Vehiculos.jsx';
import Servicios from './pages/Servicios.jsx';
import Promociones from './pages/Promociones.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Branding from './pages/Branding.jsx';

export default function App() {
  return (
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<Login />} />

      {/* Privadas: exigen sesión y comparten el menú lateral */}
      <Route element={<RutaProtegida><Layout /></RutaProtegida>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/vehiculos" element={<Vehiculos />} />
        <Route path="/servicios" element={<Servicios />} />
        <Route path="/promociones" element={<Promociones />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/branding" element={<Branding />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
