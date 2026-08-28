import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cuidar GC',
        short_name: 'Cuidar GC',
        description: 'Gestão do cuidado semanal do Grupo de Crescimento',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf9f7',
        theme_color: '#0f766e',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Nunca interceptar chamadas autenticadas: dados de cuidado e feedback
        // sensivel jamais podem ficar em cache persistente do service worker.
        navigateFallbackDenylist: [/^\/auth\//, /^\/rest\//, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // Em desenvolvimento o Vite faz o papel do Caddy: a aplicacao continua
  // falando com `/rest/v1`, `/auth` e `/api` na propria origem, e cada um
  // desses caminhos vai para o container certo do `docker compose`.
  server: {
    port: 5173,
    proxy: {
      '/rest/v1': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/rest\/v1/, ''),
      },
      '/auth': 'http://localhost:3001',
      '/api': 'http://localhost:3001',
    },
  },
})
