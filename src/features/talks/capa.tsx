import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TalkCard } from '@/types/database'
import { arquivoUrl } from './use-talks'

/**
 * A capa de um talk: a arte reduzida, ou — quando não há arte — o tema escrito
 * num fundo neutro, para o histórico continuar legível sem imagem.
 */
export function CapaDoTalk({
  talk,
  chave,
  tamanho = 'capa',
  className,
}: {
  talk: Pick<TalkCard, 'id' | 'numero' | 'tema' | 'arquivos'>
  chave: string | undefined
  /** `arte` só na tela do talk; no resto, a miniatura basta. */
  tamanho?: 'capa' | 'arte'
  className?: string
}) {
  const arquivo = talk.arquivos[tamanho] ?? talk.arquivos.capa ?? talk.arquivos.arte
  const tipo = talk.arquivos[tamanho] ? tamanho : talk.arquivos.capa ? 'capa' : 'arte'

  if (arquivo && chave) {
    return (
      <img
        src={arquivoUrl(talk.id, tipo, chave, arquivo.versao)}
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
