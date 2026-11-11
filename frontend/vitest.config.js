// Pruebas del frontend (Vitest + Testing Library en un DOM simulado con jsdom).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/dashboard-correo.test.jsx', 'tests/logica.test.js', 'tests/notificaciones.test.js', 'tests/permisos-rutas.test.jsx', 'tests/seguimiento.test.jsx', 'tests/superadmin.test.jsx', 'tests/acceso-cliente.test.jsx', 'tests/autorizaciones.test.jsx', 'tests/branding-cliente.test.jsx', 'tests/notificaciones-cliente.test.jsx'],
    setupFiles: ['tests/setup.js'],
    restoreMocks: true,
  },
});
