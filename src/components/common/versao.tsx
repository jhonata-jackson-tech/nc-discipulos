import * as React from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Qual versao esta na tela - e o botao para deixar de ver a antiga.
 *
 * A pergunta aparece toda vez que uma correcao sobe: "o que estou vendo no
 * celular ja e a nova ou e o cache?". Sem um numero na tela nao ha resposta,
 * so chute - e num grupo de 33 pessoas ninguem vai abrir as configuracoes do
 * navegador para limpar cache.
 *
 * Entao mostramos a data da build e o commit, que e o que se compara com quem
 * publicou, e ao lado o gesto que resolve: apagar o cache, descartar o service
 * worker e recarregar. Na volta ele se registra de novo sozinho.
 */
const carimbo = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function versaoDoApp(): string {
  const quando = __VERSAO__.buildTime ? carimbo.format(new Date(__VERSAO__.buildTime)) : '--'
  return __VERSAO__.commit ? `${quando} · ${__VERSAO__.commit}` : quando
}

export function Versao({
  className,
  discreta,
}: {
  className?: string
  /** Sem a frase de explicação, para caber no rodapé de uma folha. */
  discreta?: boolean
}) {
  const [limpando, setLimpando] = React.useState(false)

  /**
   * O caminho mais curto entre "estou vendo o antigo" e "estou vendo o novo".
   *
   * Recarregar nao basta: o service worker responde do cache antes de a rede
   * ser consultada. Por isso ele sai do caminho junto com os caches - e o
   * `reload` seguinte busca tudo de novo, do servidor.
   */
  const limparEAtualizar = async () => {
    setLimpando(true)
    try {
      if ('serviceWorker' in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registros.map((registro) => registro.unregister()))
      }
      if ('caches' in window) {
        const nomes = await caches.keys()
        await Promise.all(nomes.map((nome) => caches.delete(nome)))
      }
    } catch {
      // Navegador sem service worker ou com o armazenamento bloqueado: o
      // recarregar abaixo ainda e a melhor tentativa que temos.
    }
    window.location.reload()
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-muted-foreground min-w-0 text-xs">
        Versão <span className="tabular text-foreground">{versaoDoApp()}</span>
        {!discreta && (
          <span className="block">
            Se a tela não bate com o que foi publicado, é cache: toque em buscar atualização.
          </span>
        )}
      </p>

      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        loading={limpando}
        onClick={limparEAtualizar}
      >
        <RefreshCw aria-hidden />
        Buscar atualização
      </Button>
    </div>
  )
}
