import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: { outDir: process.env.VITE_OUT_DIR || 'dist' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Gantt Chart',
        short_name: 'Gantt',
        theme_color: '#333333',
        background_color: '#333333',
      },
      pwaAssets: {
        image: 'public/icon-source.png',
        preset: 'minimal-2023',
        overrideManifestIcons: true,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
