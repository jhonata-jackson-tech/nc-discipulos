import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TalkCard } from '@/types/database'
import type { LinksDoTalk } from './use-talks'

/**
 * A capa de um talk: a arte reduzida, ou — quando não há arte — o tema escrito
 * num fundo neutro, para o histórico continuar legível sem imagem.
 */
export function CapaDoTalk({
  talk,
  links,
  tamanho = 'capa',
  className,
}: {
  talk: Pick<TalkCard, 'numero' | 'tema'>
  links: LinksDoTalk | undefined
  /** `arte` só na tela do talk; no resto, a miniatura basta. */
  tamanho?: 'capa' | 'arte'
  className?: string
}) {
  const url = links?.[tamanho] ?? links?.capa ?? links?.arte

  if (url) {
    return (
      <img
        src={url}
        alt={`Arte do talk: ${talk.tema}`}
        loading="lazy"
        decoding="async"
        className={cn('bg-secondary aspect-[9/16] w-full rounded-lg object-cover', className)}
      />
    )
  }

  return (
    <div
      aria-hidden
      className={cn(
        'bg-secondary text-muted-foreground flex aspect-[9/16] w-full flex-col justify-between rounded-lg p-3',
        className,
      )}
    >
      <Mic className="size-5" />
      <div>
        {talk.numero && <p className="text-xs font-medium uppercase">Tema {talk.numero}</p>}
        <p className="font-display text-foreground line-clamp-4 text-sm font-semibold text-balance">
          {talk.tema}
        </p>
      </div>
    </div>
  )
}
