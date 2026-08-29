import { HandHeart } from 'lucide-react'
import { cn, initials } from '@/lib/utils'
import { formatDateTime } from '@/lib/date'
import { lerDevocional, tempoDeLeitura } from './texto'
import type { Devotional, DevotionalAuthor } from '@/types/database'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

/**
 * O devocional como texto para ler.
 *
 * A medida da linha é curta de propósito — perto de 65 caracteres, que é onde
 * o olho volta para a linha certa sem se perder. Numa tela larga, um parágrafo
 * de ponta a ponta é o jeito mais rápido de fazer alguém parar de ler.
 */
export function DevotionalPost({
  devocional,
  autor,
  onAmem,
  enviandoAmem,
}: {
  devocional: Devotional
  autor?: DevotionalAuthor
  onAmem?: () => void
  enviandoAmem?: boolean
}) {
  const paragrafos = lerDevocional(devocional.corpo)
  const minutos = tempoDeLeitura(devocional.corpo)

  return (
    <article className="space-y-6">
      <header className="flex items-center gap-3">
        <Avatar className="size-12">
          {autor?.photo_url && <AvatarImage src={autor.photo_url} alt="" />}
          <AvatarFallback>{initials(autor?.name ?? devocional.assinatura)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 leading-tight">
          <p className="font-medium">{devocional.assinatura}</p>
          <p className="text-muted-foreground text-xs">
            {devocional.publicadoEm ? formatDateTime(devocional.publicadoEm) : 'ainda em rascunho'}
            {' · '}
            {minutos} min de leitura
          </p>
        </div>
      </header>

      <h1 className="font-display max-w-[24ch] text-2xl leading-tight font-bold text-pretty sm:text-3xl">
        {devocional.titulo}
      </h1>

      <div className="max-w-[65ch] space-y-4 text-[15px] leading-relaxed">
        {paragrafos.map((paragrafo, indice) => (
          <p key={indice} className="text-pretty">
            {paragrafo.map((linha, ordem) => (
              <span key={ordem}>
                {/* A quebra dentro do parágrafo é do próprio texto: é o que
                    mantém um versículo citado inteiro, verso a verso. */}
                {ordem > 0 && <br />}
                {linha.map((trecho, posicao) => (
                  <span
                    key={posicao}
                    className={cn(trecho.forte && 'font-semibold', trecho.enfase && 'italic')}
                  >
                    {trecho.texto}
                  </span>
                ))}
              </span>
            ))}
          </p>
        ))}
      </div>

      {onAmem && (
        <footer className="max-w-[65ch] border-t pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={devocional.euAmem ? 'default' : 'outline'}
              onClick={onAmem}
              loading={enviandoAmem}
              aria-pressed={devocional.euAmem}
            >
              <HandHeart aria-hidden />
              Amém
            </Button>
            <p className="text-muted-foreground text-sm">{contagem(devocional)}</p>
          </div>
        </footer>
      )}
    </article>
  )
}

/**
 * "Você e mais 22 marcaram Amém."
 *
 * A frase muda conforme quem está lendo já marcou, porque "23 pessoas
 * marcaram" some com a pessoa que acabou de marcar — e ela quer se ver ali.
 * Nomes nunca aparecem: um gesto de fé não é lista de presença.
 */
function contagem({ amens, euAmem }: Pick<Devotional, 'amens' | 'euAmem'>): string {
  if (amens === 0) return 'Ninguém marcou ainda.'
  if (!euAmem) return amens === 1 ? '1 pessoa marcou Amém.' : `${amens} pessoas marcaram Amém.`
  if (amens === 1) return 'Você marcou Amém.'
  if (amens === 2) return 'Você e mais 1 pessoa marcaram Amém.'
  return `Você e mais ${amens - 1} pessoas marcaram Amém.`
}
