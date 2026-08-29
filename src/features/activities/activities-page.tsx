import * as React from 'react'
import {
  CalendarClock,
  Check,
  CopyPlus,
  ListChecks,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useWeeks } from '@/features/care/use-care'
import {
  useActivities,
  useCopyRecurringActivities,
  useDeleteActivity,
  useRespondActivity,
  type ActivityWithAssignees,
} from './use-activities'
import { ActivityDialog } from './activity-dialog'
import { formatDate, formatWeekRange, relativeDeadline, startOfWeek } from '@/lib/date'
import { activityResponseLabel, activityTypeLabel, weekStatusLabel } from '@/lib/labels'
import type { ActivityResponse } from '@/types/database'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

/** O filtro segue o combinado, não a antiga situação da atividade. */
const FILTROS: (ActivityResponse | 'all')[] = ['all', 'pendente', 'aceita', 'recusada']

export function ActivitiesPage() {
  const { group, isLeader, profile } = useSession()
  const weeks = useWeeks()
  const [selectedWeekId, setSelectedWeekId] = React.useState<string | null>(null)
  const [respostaFiltro, setRespostaFiltro] = React.useState<ActivityResponse | 'all'>('all')
  const [editing, setEditing] = React.useState<ActivityWithAssignees | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  // A semana em foco e derivada: enquanto ninguem escolher outra, vale a
  // semana corrente.
  const thisWeek = startOfWeek()
  const defaultWeek =
    weeks.data?.find((week) => week.status !== 'draft' && week.starts_on <= thisWeek) ??
    weeks.data?.[0]
  const weekId = selectedWeekId ?? defaultWeek?.id ?? ''

  const activities = useActivities(weekId || null)
  const responder = useRespondActivity()
  const [recusando, setRecusando] = React.useState<ActivityWithAssignees | null>(null)
  const remove = useDeleteActivity()
  const copyRecurring = useCopyRecurringActivities()

  // O filtro olha o combinado: uma atividade "pendente" é a que ainda espera
  // alguém responder - é isso que a liderança precisa caçar na segunda-feira.
  const filtered = (activities.data ?? []).filter((activity) => {
    if (respostaFiltro === 'all') return true
    if (activity.assignees.length === 0) return respostaFiltro === 'pendente'
    return activity.assignees.some((entry) => entry.response === respostaFiltro)
  })

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (activity: ActivityWithAssignees) => {
    setEditing(activity)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Atividades"
        description="Talk, lanche, dinâmica, aniversariantes e o que mais a semana pedir."
        actions={
          isLeader ? (
            <>
              {weekId && group && (
                <Button
                  variant="outline"
                  loading={copyRecurring.isPending}
                  onClick={() => copyRecurring.mutate({ groupId: group.id, weekId })}
                >
                  <CopyPlus aria-hidden />
                  Trazer recorrentes
                </Button>
              )}
              <Button onClick={openNew}>
                <Plus aria-hidden />
                Nova atividade
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={weekId} onValueChange={setSelectedWeekId}>
          <SelectTrigger className="sm:max-w-xs" aria-label="Semana">
            <SelectValue placeholder="Semana" />
          </SelectTrigger>
          <SelectContent>
            {(weeks.data ?? []).map((week) => (
              <SelectItem key={week.id} value={week.id}>
                {formatWeekRange(week.starts_on, week.ends_on)} · {weekStatusLabel[week.status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs
          value={respostaFiltro}
          onValueChange={(value) => setRespostaFiltro(value as ActivityResponse | 'all')}
          className="w-full min-w-0 sm:w-auto"
        >
          {/* `min-w-0` e o que permite a lista encolher dentro do flex e rolar
              sozinha em telas estreitas, em vez de esticar a pagina. */}
          <TabsList className="w-full scrollbar-thin justify-start overflow-x-auto">
            {FILTROS.map((opcao) => (
              <TabsTrigger key={opcao} value={opcao}>
                {opcao === 'all' ? 'Todas' : activityResponseLabel[opcao]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {activities.isLoading && <CardListSkeleton rows={3} />}
      {activities.isError && (
        <ErrorState error={activities.error} onRetry={() => activities.refetch()} />
      )}

      {activities.isSuccess && filtered.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ListChecks}
              title="Nenhuma atividade nesta lista"
              description={
                isLeader
                  ? 'Crie a primeira atividade da semana ou traga as recorrentes.'
                  : 'Quando a liderança criar atividades para você, elas aparecem aqui.'
              }
              action={
                isLeader ? (
                  <Button onClick={openNew}>
                    <Plus aria-hidden />
                    Nova atividade
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((activity) => {
          const minhaEntrada = activity.assignees.find((entry) => entry.profile.id === profile?.id)
          const minhaResposta = minhaEntrada?.response
          const deadline = relativeDeadline(activity.due_at)
          const late = activity.due_at && deadline?.startsWith('atrasada')

          return (
            <Card key={activity.id} className="flex flex-col p-4">
              <Badge variant="neutral" className="self-start">
                {activityTypeLabel[activity.type]}
              </Badge>

              <p className="mt-2.5 font-medium text-pretty">{activity.title}</p>
              {activity.description && (
                <p className="text-muted-foreground mt-1 line-clamp-3 text-sm text-pretty">
                  {activity.description}
                </p>
              )}

              {activity.due_at && (
                <p
                  className={`mt-2 flex items-center gap-1.5 text-xs ${late ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  <CalendarClock className="size-3.5" aria-hidden />
                  {formatDate(activity.due_at)} · {deadline}
                </p>
              )}

              {activity.is_recurring && (
                <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                  <Repeat className="size-3.5" aria-hidden />
                  Recorrente
                </p>
              )}

              <div className="mt-3 space-y-1.5">
                {activity.assignees.length === 0 ? (
                  <span className="text-muted-foreground text-xs">Sem responsável definido</span>
                ) : (
                  activity.assignees.map((entry) => (
                    <div key={entry.profile.id} className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          entry.response === 'aceita'
                            ? 'success'
                            : entry.response === 'recusada'
                              ? 'danger'
                              : 'outline'
                        }
                      >
                        {entry.profile.full_name}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {activityResponseLabel[entry.response]}
                      </span>
                      {entry.justification && (
                        <span className="text-muted-foreground w-full text-xs text-pretty italic">
                          “{entry.justification}”
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 pt-1">
                {/* Só quem foi indicado responde, e só enquanto não respondeu:
                    a atividade não tem "situação" - tem combinado. */}
                {minhaResposta === 'pendente' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => responder.mutate({ id: activity.id, accept: true })}
                    >
                      <Check aria-hidden />
                      Aceitar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRecusando(activity)}>
                      Não vou conseguir
                    </Button>
                  </>
                )}

                {isLeader && (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Editar ${activity.title}`}
                      onClick={() => openEdit(activity)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remover ${activity.title}`}
                          className="text-destructive"
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogTitle>Remover esta atividade?</AlertDialogTitle>
                        <AlertDialogDescription>
                          “{activity.title}” será apagada. Essa ação não pode ser desfeita.
                        </AlertDialogDescription>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(activity.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <RecusaDialog
        key={recusando?.id ?? 'sem-recusa'}
        atividade={recusando}
        onClose={() => setRecusando(null)}
        onConfirmar={(justificativa) => {
          if (!recusando) return
          responder.mutate(
            { id: recusando.id, accept: false, justification: justificativa },
            { onSuccess: () => setRecusando(null) },
          )
        }}
        enviando={responder.isPending}
      />

      {group && (
        <ActivityDialog
          activity={editing}
          groupId={group.id}
          weekId={weekId || null}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  )
}

/**
 * Recusa com motivo.
 *
 * A justificativa é exigida porque a liderança precisa dela para repassar bem:
 * "não vou conseguir" sozinho obriga a perguntar de novo, e a resposta se perde
 * no WhatsApp. O banco também exige — a tela não é a única guardiã disso.
 */
function RecusaDialog({
  atividade,
  onClose,
  onConfirmar,
  enviando,
}: {
  atividade: ActivityWithAssignees | null
  onClose: () => void
  onConfirmar: (justificativa: string) => void
  enviando: boolean
}) {
  // A chave por atividade remonta o campo a cada abertura: mais simples (e mais
  // confiável) do que limpar por efeito.
  const [motivo, setMotivo] = React.useState('')

  return (
    <Dialog open={Boolean(atividade)} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent key={atividade?.id}>
        <DialogHeader>
          <DialogTitle>Não vou conseguir</DialogTitle>
          <DialogDescription>
            “{atividade?.title}” volta para a liderança repassar. Diga o motivo — é o que permite
            remanejar sem ficar perguntando.
          </DialogDescription>
        </DialogHeader>

        {/* Sem o par `htmlFor`/`id` o rótulo não pertence ao campo: quem usa
            leitor de tela ouviria "caixa de texto" e mais nada. */}
        <Field label="Motivo" htmlFor="motivo" required>
          <Textarea
            id="motivo"
            rows={3}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            placeholder="Ex.: estarei viajando nesse dia."
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={motivo.trim().length < 3}
            loading={enviando}
            onClick={() => onConfirmar(motivo.trim())}
          >
            Enviar recusa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
