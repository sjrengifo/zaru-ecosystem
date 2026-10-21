import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración de Vite (la herramienta que corre y empaqueta el frontend).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
