import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { addDays, formatDate, todayISO } from '@/lib/date'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CapaDoTalk } from './capa'
import { useChaveDeArquivos, useTalks } from './use-talks'

/**
 * O talk da semana na home de quem conduz o GC.
 *
 * O aviso chega uma vez; a home é onde a pessoa volta na quarta à noite para
 * rever o roteiro. Some sozinho uma semana depois do GC a que pertence.
 */
export function TalkDaSemanaCard() {
  const talks = useTalks()
  const hoje = todayISO()
  const talk = talks.data?.find(
    (t) => t.situacao === 'published' && t.semanaDe >= addDays(hoje, -6),
  )
  const chave = useChaveDeArquivos(Boolean(talk))

  if (!talk) return null

  return (
    <Link to={`/talks/${talk.id}`} className="block">
      <Card className="hover:border-primary/40 transition-colors">
        <CardContent className="flex items-center gap-3 p-3">
          <CapaDoTalk talk={talk} chave={chave.data} className="w-14 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
              Talk da semana
              {!talk.euAbri && <Badge variant="info">Novo</Badge>}
            </p>
            <p className="line-clamp-2 leading-snug font-semibold text-pretty">
              {talk.numero ? `Tema ${talk.numero}: ` : ''}
              {talk.tema}
            </p>
            <p className="text-muted-foreground text-xs">
              GC de {formatDate(talk.semanaDe, 'long')}
            </p>
          </div>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </CardContent>
      </Card>
    </Link>
  )
}
