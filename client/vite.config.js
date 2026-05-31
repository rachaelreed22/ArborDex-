import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('jspdf')) {
            return 'vendor-jspdf';
          }

          if (id.includes('html2canvas')) {
            return 'vendor-html2canvas';
          }

          if (id.includes('jsqr')) {
            return 'vendor-jsqr';
          }

          if (id.includes('@supabase')) {
            return 'vendor-supabase';
          }

          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
            return 'vendor-react';
          }

          return 'vendor-misc';
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        timeout: 30000,
        proxyTimeout: 30000,
      },
      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        timeout: 30000,
        proxyTimeout: 30000,
      },
    },
  },
}))

