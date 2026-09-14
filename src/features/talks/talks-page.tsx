import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mic, Plus } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { addDays, formatDate, todayISO } from '@/lib/date'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import type { TalkCard } from '@/types/database'
import { CapaDoTalk } from './capa'
import { TalkDialog } from './talk-dialog'
import { useLinksDosTalks, useTalks } from './use-talks'

/**
 * O talk da semana e os das semanas anteriores.
 *
 * Um mural de capas, e não uma lista de nomes de arquivo: quem procura "aquele
 * talk da alegria" lembra da arte antes de lembrar do número.
 */
export function TalksPage() {
  const { isLeader, isLeadership } = useSession()
  const talks = useTalks()
  const links = useLinksDosTalks()
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()

  // Qual talk está aberto para edição vive na URL, como nos devocionais: o
  // "Editar" da tela do talk abre o formulário certo, e o voltar do celular
  // fecha o diálogo.
  const editandoId = params.get('editar')
  const dialogoAberto = Boolean(editandoId) || params.has('novo')
  const fechar = () => setParams({}, { replace: true })

  const lista = talks.data ?? []
  const hoje = todayISO()
  // "Da semana" é o publicado mais recente cujo GC ainda não passou há mais de
  // uma semana. Depois disso ele é só mais um do histórico.
  const daSemana = lista.find((t) => t.situacao === 'published' && t.semanaDe >= addDays(hoje, -6))
  const resto = lista.filter((t) => t.id !== daSemana?.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Talks"
        description="O material do GC de cada semana: o PDF, a arte e as playlists. Só quem conduz o GC vê."
        actions={
          isLeader ? (
            <Button onClick={() => setParams({ novo: '1' }, { replace: true })}>
              <Plus aria-hidden />
              Novo talk
            </Button>
          ) : undefined
        }
      />

      {talks.isLoading && <CardListSkeleton rows={2} />}
      {talks.isError && <ErrorState error={talks.error} onRetry={() => talks.refetch()} />}

      {talks.isSuccess && lista.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Mic}
              title="Nenhum talk por aqui ainda"
              description={
                isLeader
                  ? 'Suba o PDF que a igreja mandou, com a arte e as playlists, e publique quando estiver pronto.'
                  : 'Quando a liderança publicar o talk da semana, ele aparece aqui — e você recebe um aviso.'
              }
            />
          </CardContent>
        </Card>
      )}

      {daSemana && (
        <section aria-labelledby="talk-da-semana" className="space-y-2">
          <h2 id="talk-da-semana" className="font-display text-lg font-semibold">
            Talk da semana
          </h2>
          <Link to={`/talks/${daSemana.id}`} className="block">
            <Card className="hover:border-primary/40 transition-colors">
              <CardContent className="flex gap-4 p-4">
                <CapaDoTalk
                  talk={daSemana}
                  links={links.data?.[daSemana.id]}
                  className="w-24 shrink-0 sm:w-32"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  {daSemana.serie && (
                    <p className="text-muted-foreground text-xs font-medium uppercase">
                      {daSemana.serie}
                    </p>
                  )}
                  <p className="font-display text-lg leading-snug font-semibold text-pretty">
                    {daSemana.numero ? `Tema ${daSemana.numero}: ` : ''}
                    {daSemana.tema}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Para o GC de {formatDate(daSemana.semanaDe, 'long')}
                  </p>
                  <Selos talk={daSemana} lideranca={isLeadership} />
                </div>
              </CardContent>
            </Card>
          </Link>
        </section>
      )}

      {resto.length > 0 && (
        <section aria-labelledby="historico-talks" className="space-y-2">
          <h2 id="historico-talks" className="font-display text-lg font-semibold">
            {daSemana ? 'Anteriores' : 'Histórico'}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {resto.map((talk) => (
              <li key={talk.id}>
                <Link to={`/talks/${talk.id}`} className="group block space-y-2">
                  <CapaDoTalk
                    talk={talk}
                    links={links.data?.[talk.id]}
                    className="group-hover:ring-primary/40 transition-shadow group-hover:ring-2"
                  />
                  <div className="space-y-1">
                    <p className="line-clamp-2 text-sm leading-snug font-medium text-pretty">
                      {talk.numero ? `Tema ${talk.numero} · ` : ''}
                      {talk.tema}
                    </p>
                    <p className="text-muted-foreground text-xs">{formatDate(talk.semanaDe)}</p>
                    <Selos talk={talk} lideranca={isLeadership} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isLeader && dialogoAberto && (
        <TalkDialog
          key={editandoId ?? 'novo'}
          talkId={editandoId}
          open
          onOpenChange={(aberto) => !aberto && fechar()}
          ultimo={lista[0]}
          onSalvo={(id) => {
            fechar()
            navegar(`/talks/${id}`)
          }}
        />
      )}
    </div>
  )
}

function Selos({ talk, lideranca }: { talk: TalkCard; lideranca: boolean }) {
  const rascunho = talk.situacao === 'draft'
  if (!rascunho && talk.euAbri && !(lideranca && talk.aberturas !== null)) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {rascunho && <Badge variant="warning">Rascunho</Badge>}
      {!rascunho && !talk.euAbri && <Badge variant="info">Novo</Badge>}
      {!rascunho && !talk.arquivos.pdf && <Badge variant="danger">Sem PDF</Badge>}
      {lideranca && !rascunho && talk.aberturas !== null && (
        <Badge variant="neutral">{talk.aberturas} abriram</Badge>
      )}
    </div>
  )
}
