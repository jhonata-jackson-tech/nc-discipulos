import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, Pencil, Send } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { devotionalAudienceLabel } from '@/lib/labels'
import { useAmen, useAuthors, useDevotional, usePublishDevotional } from './use-devotionals'
import { DevotionalPost } from './devotional-post'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

export function DevotionalPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useSession()
  const navegar = useNavigate()
  const devocional = useDevotional(id)
  const autores = useAuthors()
  const amem = useAmen()
  const publicar = usePublishDevotional()

  const autor = autores.data?.find((a) => a.id === devocional.data?.autorId)

  if (devocional.isLoading) return <CardListSkeleton rows={3} />
  if (devocional.isError) {
    return <ErrorState error={devocional.error} onRetry={() => devocional.refetch()} />
  }

  if (!devocional.data) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={BookOpen}
            title="Devocional não encontrado"
            description="Ele pode ter sido removido, ou não estar disponível para você."
            action={
              <Button asChild variant="outline">
                <Link to="/devocionais">Ver os devocionais</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  const item = devocional.data
  const rascunho = item.situacao === 'draft'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/devocionais">
            <ArrowLeft aria-hidden />
            Devocionais
          </Link>
        </Button>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{devotionalAudienceLabel[item.alcance]}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navegar('/devocionais?editar=' + item.id)}
            >
              <Pencil aria-hidden />
              Editar
            </Button>
            {rascunho && (
              <PublicarBotao
                enviando={publicar.isPending}
                onConfirmar={() => publicar.mutate(item.id)}
              />
            )}
          </div>
        )}
      </div>

      {rascunho && (
        <div className="border-warning/40 bg-warning/12 rounded-lg border px-4 py-3 text-sm text-pretty">
          Ainda é um rascunho: só você está vendo. Ninguém foi avisado.
        </div>
      )}

      <Card>
        <CardContent className="p-5 sm:p-7">
          <DevotionalPost
            devocional={item}
            autor={autor}
            /* Rascunho não recebe Amém: não há a quem responder ainda. */
            onAmem={rascunho ? undefined : () => amem.mutate(item.id)}
            enviandoAmem={amem.isPending}
          />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Publicar manda um aviso para dezenas de celulares e não tem como voltar
 * atrás. Por isso pergunta antes, e diz exatamente o que vai acontecer.
 */
function PublicarBotao({ enviando, onConfirmar }: { enviando: boolean; onConfirmar: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" loading={enviando}>
          <Send aria-hidden />
          Publicar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Publicar e avisar?</AlertDialogTitle>
        <AlertDialogDescription>
          Todo mundo que alcança este devocional vai receber um aviso no celular agora. Não dá para
          desfazer um aviso já enviado.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Ainda não</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>Publicar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
