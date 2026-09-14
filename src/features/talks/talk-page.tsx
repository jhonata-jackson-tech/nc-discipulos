import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  ListMusic,
  Mic,
  Pencil,
  Send,
  Share2,
  SquarePlay,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from '@/features/auth/session-context'
import { formatDate, formatDateTime, weekdayName } from '@/lib/date'
import { roleLabel } from '@/lib/labels'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Talk } from '@/types/database'
import { CapaDoTalk } from './capa'
import { tamanhoLegivel } from './talk-texto'
import {
  arquivoUrl,
  useAbrirTalk,
  useApagarTalk,
  useChaveDeArquivos,
  usePublicarTalk,
  useTalk,
} from './use-talks'

/**
 * A arte já baixada, pronta para compartilhar.
 *
 * O iPhone só deixa abrir a folha de compartilhar logo depois do toque. Baixar
 * a imagem só na hora do toque às vezes passa desse prazo e o gesto some sem
 * erro nenhum — então ela vem antes, junto com a tela.
 */
function useArteParaCompartilhar(talk: Talk | null | undefined, chave: string | undefined) {
  const arte = talk?.arquivos.arte
  return useQuery({
    queryKey: ['talk-arte', talk?.id, arte?.versao],
    enabled: Boolean(talk && arte && chave && typeof navigator.share === 'function'),
    staleTime: Infinity,
    queryFn: async () => {
      const resposta = await fetch(arquivoUrl(talk!.id, 'arte', chave!, arte!.versao))
      if (!resposta.ok) throw new Error('Não foi possível baixar a arte.')
      const blob = await resposta.blob()
      return new File([blob], `talk-${talk!.numero ?? 'gc'}.jpg`, {
        type: blob.type || 'image/jpeg',
      })
    },
  })
}

export function TalkPage() {
  const { id } = useParams<{ id: string }>()
  const { isLeader, isLeadership } = useSession()
  const navegar = useNavigate()
  const talk = useTalk(id)
  const chave = useChaveDeArquivos()
  const abrir = useAbrirTalk()
  const publicar = usePublicarTalk()
  const apagar = useApagarTalk()
  const arteBaixada = useArteParaCompartilhar(talk.data, chave.data)

  if (talk.isLoading) return <CardListSkeleton rows={3} />
  if (talk.isError) return <ErrorState error={talk.error} onRetry={() => talk.refetch()} />

  if (!talk.data) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Mic}
            title="Talk não encontrado"
            description="Ele pode ter sido removido, ou não estar disponível para você."
            action={
              <Button asChild variant="outline">
                <Link to="/talks">Ver os talks</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  const t = talk.data
  const rascunho = t.situacao === 'draft'
  const pdf = t.arquivos.pdf
  const arte = t.arquivos.arte

  const marcarAberto = () => {
    if (!rascunho && !t.euAbri) abrir.mutate(t.id)
  }

  const compartilharArte = async () => {
    const arquivo = arteBaixada.data
    if (arquivo && navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: t.tema })
      } catch {
        // Fechar a folha de compartilhar não é erro.
      }
      return
    }
    if (arte && chave.data) {
      window.open(arquivoUrl(t.id, 'arte', chave.data, arte.versao, true), '_blank', 'noopener')
    } else {
      toast.error('A arte ainda está carregando. Tente de novo em instantes.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/talks">
            <ArrowLeft aria-hidden />
            Talks
          </Link>
        </Button>

        {isLeader && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navegar(`/talks?editar=${t.id}`)}>
              <Pencil aria-hidden />
              Editar
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 aria-hidden />
                  Remover
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>Remover este talk?</AlertDialogTitle>
                <AlertDialogDescription>
                  O PDF, a arte e o registro de quem abriu saem junto. O aviso que já foi enviado
                  não volta atrás.
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => apagar.mutate(t.id, { onSuccess: () => navegar('/talks') })}
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {rascunho && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" loading={publicar.isPending} disabled={!pdf}>
                    <Send aria-hidden />
                    Publicar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Publicar e avisar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os líderes, supervisores e discípulos recebem agora o aviso “O talk da
                    semana chegou”. Irmãos e irmãs não veem o talk. Não dá para desfazer um aviso já
                    enviado.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Ainda não</AlertDialogCancel>
                    <AlertDialogAction onClick={() => publicar.mutate(t.id)}>
                      Publicar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {rascunho && (
        <div className="border-warning/40 bg-warning/12 rounded-lg border px-4 py-3 text-sm text-pretty">
          {pdf
            ? 'Ainda é um rascunho: só a liderança está vendo. Ninguém foi avisado.'
            : 'Ainda é um rascunho, e falta o PDF — sem ele não dá para publicar. Toque em Editar para anexar.'}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,17rem)_1fr]">
        <CapaDoTalk
          talk={t}
          chave={chave.data}
          tamanho="arte"
          className="mx-auto max-w-[17rem] shadow-sm md:mx-0"
        />

        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            {t.serie && (
              <p className="text-muted-foreground text-xs font-medium uppercase">{t.serie}</p>
            )}
            <h1 className="font-display text-2xl leading-tight font-bold text-balance">
              {t.numero ? `Tema ${t.numero}: ` : ''}
              {t.tema}
            </h1>
            <p className="text-muted-foreground text-sm">
              Para o GC de {weekdayName(t.semanaDe)}, {formatDate(t.semanaDe, 'long')}
            </p>
          </div>

          {t.mensagem && (
            <p className="bg-secondary/60 rounded-lg px-4 py-3 text-sm text-pretty whitespace-pre-line">
              {t.mensagem}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {pdf && chave.data ? (
              <>
                {/* Link de verdade, e não um fetch: é o que abre o leitor de
                    PDF do próprio celular, inclusive no app instalado. */}
                <Button asChild size="lg" className="sm:col-span-2">
                  <a
                    href={arquivoUrl(t.id, 'pdf', chave.data, pdf.versao)}
                    target="_blank"
                    rel="noopener"
                    onClick={marcarAberto}
                  >
                    <FileText aria-hidden />
                    Abrir o talk (PDF)
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a
                    href={arquivoUrl(t.id, 'pdf', chave.data, pdf.versao, true)}
                    onClick={marcarAberto}
                  >
                    <Download aria-hidden />
                    Baixar · {tamanhoLegivel(pdf.tamanho)}
                  </a>
                </Button>
              </>
            ) : (
              pdf && (
                <Button size="lg" className="sm:col-span-2" loading>
                  Preparando o PDF…
                </Button>
              )
            )}

            {arte && (
              <Button variant="outline" onClick={compartilharArte}>
                <Share2 aria-hidden />
                Compartilhar a arte
              </Button>
            )}

            {t.spotifyUrl && (
              <Button asChild variant="outline">
                <a href={t.spotifyUrl} target="_blank" rel="noopener noreferrer">
                  <ListMusic aria-hidden />
                  Playlist no Spotify
                </a>
              </Button>
            )}

            {t.youtubeUrl && (
              <Button asChild variant="outline">
                <a href={t.youtubeUrl} target="_blank" rel="noopener noreferrer">
                  <SquarePlay aria-hidden />
                  Playlist no YouTube
                </a>
              </Button>
            )}
          </div>

          {t.publicadoEm && (
            <p className="text-muted-foreground text-xs">
              Publicado em {formatDateTime(t.publicadoEm)}
            </p>
          )}
        </div>
      </div>

      {isLeadership && !rascunho && t.leituras && <QuemAbriu leituras={t.leituras} />}
    </div>
  )
}

/**
 * Quem já abriu o PDF, e quem ainda não.
 *
 * É material de trabalho de quem conduz o GC: saber na quarta que um discípulo
 * ainda não abriu o roteiro é o que permite falar com ele antes de quinta.
 */
function QuemAbriu({ leituras }: { leituras: NonNullable<Talk['leituras']> }) {
  const [todos, setTodos] = React.useState(false)
  const abriram = leituras.filter((l) => l.abriuEm)
  const faltam = leituras.filter((l) => !l.abriuEm)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Abriram o PDF · {abriram.length} de {leituras.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {faltam.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Ainda não abriram</p>
            <ul className="flex flex-wrap gap-1.5">
              {faltam.map((l) => (
                <li
                  key={l.id}
                  className="border-border flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                  title={roleLabel[l.papel]}
                >
                  <Circle className="text-muted-foreground size-3" aria-hidden />
                  {l.nomeCompleto}
                </li>
              ))}
            </ul>
          </div>
        )}

        {abriram.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Já abriram</p>
            <ul className="divide-border divide-y text-sm">
              {(todos ? abriram : abriram.slice(0, 6)).map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-1.5">
                  <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{l.nomeCompleto}</span>
                  <span className="text-muted-foreground text-xs">{formatDateTime(l.abriuEm)}</span>
                </li>
              ))}
            </ul>
            {abriram.length > 6 && (
              <Button variant="ghost" size="sm" onClick={() => setTodos((v) => !v)}>
                {todos ? 'Mostrar menos' : `Ver todos (${abriram.length})`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
