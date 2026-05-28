import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir:     'src',
      filename:   'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name:        'WA Scheduler — Plataforma Comercial',
        short_name:  'WA Scheduler',
        description: 'CRM, WhatsApp e Finanças em um único lugar',
        theme_color:       '#D4AF37',
        background_color:  '#0a0a0a',
        display:           'standalone',
        orientation:       'portrait-primary',
        start_url:         '/',
        scope:             '/',
        lang:              'pt-BR',
        categories:        ['business', 'productivity'],
        icons: [
          {
            src:     'favicon.svg',
            sizes:   'any',
            type:    'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name:       'Inbox',
            short_name: 'Inbox',
            url:        '/inbox',
            icons:      [{ src: 'favicon.svg', sizes: 'any' }],
          },
          {
            name:       'Kanban',
            short_name: 'Kanban',
            url:        '/crm/kanban',
            icons:      [{ src: 'favicon.svg', sizes: 'any' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
          'date-fns': ['date-fns'],
        },
      },
    },
  },
});
