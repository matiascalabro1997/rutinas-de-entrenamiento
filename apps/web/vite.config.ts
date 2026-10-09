import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const WEB_PORT = Number(process.env.WEB_PORT ?? 5000);
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // El service worker se regenera y toma control solo en cuanto hay versión
      // nueva. Sin esto, alguien con la app instalada seguiría viendo la
      // versión vieja hasta cerrar todas las pestañas, que en un celular casi
      // nunca pasa.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Rutinas de entrenamiento',
        // El nombre corto es el que entra debajo del ícono en la pantalla de
        // inicio; más largo que esto se recorta con puntos suspensivos.
        short_name: 'Rutinas',
        description: 'Armá tus rutinas y registrá tus entrenamientos.',
        lang: 'es-AR',
        // 'standalone' la abre sin barra del navegador, como una app nativa.
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/routines',
        scope: '/',
        background_color: '#f9fafb',
        theme_color: '#4f46e5',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            // Android recorta el ícono con la forma del sistema; el maskable
            // tiene márgenes para que no le corte la mancuerna.
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // La API nunca se cachea: los entrenamientos tienen que venir del
        // server siempre. Que funcione sin señal es la Fase 4 y necesita un
        // diseño propio, no un cache a ciegas.
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        // Permite probar la instalación con `npm run dev`, sin compilar.
        enabled: true,
        type: 'module',
      },
    }),
  ],
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
