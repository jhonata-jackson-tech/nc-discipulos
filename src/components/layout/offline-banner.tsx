import * as React from 'react'
import { CloudOff } from 'lucide-react'

/**
 * Offline, a PWA mostra o que ja estava em tela em modo somente leitura. As
 * gravacoes ficam bloqueadas: nada de fila silenciosa com dado sensivel.
 */
export function OfflineBanner() {
  const [offline, setOffline] = React.useState(!navigator.onLine)

  React.useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      className="bg-warning/20 text-warning-foreground safe-top sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm"
    >
      <CloudOff className="size-4 shrink-0" aria-hidden />
      Você está sem conexão. Dá para consultar a semana, mas não é possível salvar agora.
    </div>
  )
}
