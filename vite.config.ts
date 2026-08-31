import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Em desenvolvimento o Vite faz o papel do Caddy: a aplicacao continua falando
// com `/rest/v1`, `/auth` e `/api` na propria origem, e cada um desses caminhos
// vai para o container certo do `docker compose`.
const proxy = {
  '/rest/v1': {
    target: 'http://localhost:3002',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/rest\/v1/, ''),
  },
  '/auth': 'http://localhost:3001',
  '/api': 'http://localhost:3001',
}

/**
 * A identidade desta build, gravada dentro do pacote.
 *
 * Serve para uma pergunta que aparece toda semana: "o que estou vendo no
 * celular e a versao nova ou o cache antigo?". Sem um numero na tela, a unica
 * resposta possivel e o chute.
 *
 * O commit vem do `git` quando ele existe (desenvolvimento) e da variavel de
 * ambiente quando nao existe - dentro do Docker o `.git` fica de fora do
 * contexto de propósito, para nao mandar o historico inteiro ao daemon.
 */
function identidadeDaBuild() {
  const doAmbiente = process.env.COMMIT_SHA?.trim()
  if (doAmbiente) return { commit: doAmbiente.slice(0, 7), buildTime: new Date().toISOString() }

  try {
    const doGit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    return { commit: doGit.toString().trim(), buildTime: new Date().toISOString() }
  } catch {
    return { commit: '', buildTime: new Date().toISOString() }
  }
}

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(identidadeDaBuild()) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // `injectManifest` em vez do service worker gerado: precisamos de codigo
      // proprio dentro dele para receber as notificacoes push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'marca.png'],
      manifest: {
        name: 'Discípulos',
        short_name: 'Discípulos',
        description: 'Cuidado semanal e atividades do Grupo de Crescimento',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fafafa',
        theme_color: '#232323',
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, proxy },
  // `npm run preview` serve o build de verdade, com service worker ativo.
  // Como e localhost, o navegador aceita PWA e push - da para instalar e
  // testar o aviso sem esperar o deploy.
  preview: { port: 4173, proxy },
})
