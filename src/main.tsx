import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

/**
 * Versao nova assume sozinha.
 *
 * O service worker novo chama `skipWaiting`, entao ele toma o controle assim
 * que instala - mas a pagina ja carregada continua sendo a antiga ate alguem
 * recarregar. Num grupo de 33 pessoas, ninguem vai limpar cache: recarregamos
 * por conta propria quando a troca acontece.
 *
 * A guarda do `controller` evita recarregar na primeira visita, quando nao ha
 * versao anterior nenhuma para substituir.
 */
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let recarregando = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregando) return
    recarregando = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
