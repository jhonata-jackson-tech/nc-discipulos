/// <reference lib="webworker" />
/**
 * Service worker do Cuidar GC.
 *
 * Duas responsabilidades, e so duas:
 *
 * 1. Guardar em cache o **esqueleto** da aplicacao, para ela abrir no celular
 *    mesmo com internet ruim. Nenhuma resposta autenticada entra aqui: cuidado,
 *    feedback e conversa de supervisao nunca ficam gravados no aparelho.
 * 2. Receber as notificacoes push e abrir a tela certa quando alguem toca.
 */
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

// Versao nova assume assim que chega: uma correcao nao pode ficar esperando a
// pessoa fechar todas as abas.
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()

precacheAndRoute(self.__WB_MANIFEST)

// Navegacao cai no index (a aplicacao e uma SPA), exceto nos caminhos da API -
// esses precisam ir na rede, sempre.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/auth\//, /^\/rest\//, /^\/api\//],
  }),
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' }),
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
)

// ------------------------------------------------------------------- push
interface Aviso {
  title: string
  body: string
  link: string
}

/**
 * O servidor ja decide o que pode aparecer na tela de bloqueio - aqui so
 * mostramos. Se a mensagem vier ilegivel, um aviso generico e melhor do que
 * silencio: a pessoa abre o app e ve o que aconteceu.
 */
self.addEventListener('push', (event) => {
  let aviso: Aviso = { title: 'Cuidar GC', body: 'Você tem um aviso novo.', link: '/' }

  try {
    if (event.data) aviso = { ...aviso, ...(event.data.json() as Partial<Aviso>) }
  } catch {
    // Fica o aviso generico.
  }

  event.waitUntil(
    self.registration.showNotification(aviso.title, {
      body: aviso.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      lang: 'pt-BR',
      // Avisos novos substituem o anterior em vez de empilhar na barra.
      tag: 'cuidar-gc',
      data: { link: aviso.link },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = (event.notification.data as { link?: string } | null)?.link ?? '/'

  // Se a aplicacao ja esta aberta, reaproveita a aba: abrir uma segunda copia
  // da PWA a cada toque seria um incomodo.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ('focus' in janela) {
          void janela.navigate(destino)
          return janela.focus()
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})
