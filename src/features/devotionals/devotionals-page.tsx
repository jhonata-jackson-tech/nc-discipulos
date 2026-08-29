import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, HandHeart, Pencil, Plus, Trash2, UserPen } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { devotionalAudienceLabel } from '@/lib/labels'
import { formatDate } from '@/lib/date'
import { initials } from '@/lib/utils'
import { useAuthors, useDeleteDevotional, useDevotionals } from './use-devotionals'
import { DevotionalDialog } from './devotional-dialog'
import { AuthorsDialog } from './authors-dialog'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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

/**
 * A lista dos devocionais.
 *
 * Existe porque o WhatsApp não tem: lá o texto de anteontem já sumiu debaixo
 * de trinta mensagens. Aqui cada um tem endereço próprio e continua onde foi
 * deixado.
 */
export function DevotionalsPage() {
  const { isAdmin } = useSession()
  const devocionais = useDevotionals()
  const autores = useAuthors()
  const apagar = useDeleteDevotional()

  const [params, setParams] = useSearchParams()
  const [autoresAbertos, setAutoresAbertos] = React.useState(false)

  /**
   * Qual devocional está aberto para edição vive na URL, não em estado local.
   *
   * É o que faz o "Editar" da tela de leitura (`?editar=<id>`) abrir o
   * formulário certo sem ninguém copiar a URL para dentro de um `useState` — e
   * de quebra o voltar do navegador fecha o diálogo, que é o que o dedo espera
   * no celular.
   */
  const editandoId = params.get('editar')
  const dialogoAberto = Boolean(editandoId) || params.has('novo')

  const abrirDialogo = (id?: string) =>
    setParams(id ? { editar: id } : { novo: '1' }, { replace: true })

  const fecharDialogo = (aberto: boolean) => {
    if (!aberto) setParams({}, { replace: true })
  }

  const abrirNovo = () => abrirDialogo()

  const lista = devocionais.data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Devocionais"
        description="O que a liderança da igreja tem mandado. Aqui não some no meio das mensagens."
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" onClick={() => setAutoresAbertos(true)}>
                <UserPen aria-hidden />
                Autores
              </Button>
              <Button onClick={abrirNovo}>
                <Plus aria-hidden />
                Novo devocional
              </Button>
            </>
          ) : undefined
        }
      />

      {devocionais.isLoading && <CardListSkeleton rows={3} />}
      {devocionais.isError && (
        <ErrorState error={devocionais.error} onRetry={() => devocionais.refetch()} />
      )}

      {devocionais.isSuccess && lista.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={BookOpen}
              title="Nenhum devocional por aqui"
              description={
                isAdmin
                  ? 'Cole o texto que chegou, confira, e publique quando estiver pronto.'
                  : 'Quando chegar um devocional, ele aparece aqui — e você recebe um aviso.'
              }
              action={
                isAdmin ? (
                  <Button onClick={abrirNovo}>
                    <Plus aria-hidden />
                    Novo devocional
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      <ul className="space-y-3">
        {lista.map((item) => {
          const autor = autores.data?.find((a) => a.id === item.autorId)
          const rascunho = item.situacao === 'draft'

          return (
            <li key={item.id}>
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10 shrink-0">
                      {autor?.photo_url && <AvatarImage src={autor.photo_url} alt="" />}
                      <AvatarFallback>{initials(autor?.name ?? item.assinatura)}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium">{item.assinatura}</span>
                        <span className="text-muted-foreground text-xs">
                          {item.publicadoEm ? formatDate(item.publicadoEm) : 'rascunho'}
                        </span>
                      </div>

                      {/* O cartão inteiro leva ao texto: no celular, alvo
                          pequeno é alvo errado. */}
                      <Link to={`/devocionais/${item.id}`} className="mt-1 block">
                        <p className="font-display font-semibold text-pretty">{item.titulo}</p>
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm text-pretty">
                          {item.resumo}
                        </p>
                      </Link>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.amens > 0 && (
                          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            <HandHeart
                              className={item.euAmem ? 'text-primary size-3.5' : 'size-3.5'}
                              aria-hidden
                            />
                            {item.amens}
                          </span>
                        )}

                        {isAdmin && rascunho && <Badge variant="warning">Rascunho</Badge>}
                        {isAdmin && !rascunho && item.alcance !== 'todos' && (
                          <Badge variant="neutral">{devotionalAudienceLabel[item.alcance]}</Badge>
                        )}

                        {isAdmin && (
                          <span className="ml-auto flex items-center gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Editar ${item.titulo}`}
                              onClick={() => abrirDialogo(item.id)}
                            >
                              <Pencil aria-hidden />
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  aria-label={`Remover ${item.titulo}`}
                                >
                                  <Trash2 aria-hidden />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogTitle>Remover este devocional?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  “{item.titulo}” sai da lista de todo mundo, junto com os Améns. O
                                  aviso que já foi enviado não volta atrás.
                                </AlertDialogDescription>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => apagar.mutate(item.id)}>
                                    Remover
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>

      {isAdmin && (
        <>
          <DevotionalDialog
            key={editandoId ?? 'novo'}
            devotionalId={editandoId}
            open={dialogoAberto}
            onOpenChange={fecharDialogo}
          />
          <AuthorsDialog open={autoresAbertos} onOpenChange={setAutoresAbertos} />
        </>
      )}
    </div>
  )
}
