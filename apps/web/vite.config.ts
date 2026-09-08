import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const WEB_PORT = Number(process.env.WEB_PORT ?? 5000);
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: WEB_PORT,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Hoy el cliente sólo importa TIPOS de @rutinas/shared, así que el paquete se
  // borra en compilación y nada de él llega al navegador.
  //
  // Si en algún momento se importa un valor en runtime (por ejemplo un schema
  // zod para validar un formulario del lado del cliente), hace falta agregar
  // `optimizeDeps: { include: ['@rutinas/shared'] }`: el paquete se publica como
  // CommonJS y, al estar enlazado por symlink, Vite lo deja fuera del pre-bundle
  // del dev server y el navegador falla con "exports is not defined".
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    commonjsOptions: {
      include: [/@rutinas\/shared/, /node_modules/],
    },
  },
});
