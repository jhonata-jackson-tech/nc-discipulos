import * as React from 'react'
import { CalendarClock, CopyPlus, ListChecks, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useWeeks } from '@/features/care/use-care'
import {
  useActivities,
  useCopyRecurringActivities,
  useDeleteActivity,
  useSetActivityStatus,
  type ActivityWithAssignees,
} from './use-activities'
import { ActivityDialog } from './activity-dialog'
import { formatDate, formatWeekRange, relativeDeadline, startOfWeek } from '@/lib/date'
import { activityStatusLabel, activityTypeLabel, weekStatusLabel } from '@/lib/labels'
import type { ActivityStatus } from '@/types/database'
import { PageHeader } from '@/components/common/page-header'
import { ActivityStatusBadge } from '@/components/common/badges'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

const STATUS_FILTERS: (ActivityStatus | 'all')[] = ['all', 'todo', 'in_progress', 'done', 'cancelled']

export function ActivitiesPage() {
  const { group, isLeader, profile } = useSession()
  const weeks = useWeeks()
  const [selectedWeekId, setSelectedWeekId] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<ActivityStatus | 'all'>('all')
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
  const setStatus = useSetActivityStatus()
  const remove = useDeleteActivity()
  const copyRecurring = useCopyRecurringActivities()

  const filtered = (activities.data ?? []).filter(
    (activity) => statusFilter === 'all' || activity.status === statusFilter,
  )

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
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as ActivityStatus | 'all')}
          className="w-full min-w-0 sm:w-auto"
        >
          {/* `min-w-0` e o que permite a lista encolher dentro do flex e rolar
              sozinha em telas estreitas, em vez de esticar a pagina. */}
          <TabsList className="scrollbar-thin w-full justify-start overflow-x-auto">
            {STATUS_FILTERS.map((status) => (
              <TabsTrigger key={status} value={status}>
                {status === 'all' ? 'Todas' : activityStatusLabel[status]}
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
          const isAssignee = activity.assignees.some((entry) => entry.profile.id === profile?.id)
          const deadline = relativeDeadline(activity.due_at)
          const late = activity.due_at && deadline?.startsWith('atrasada') && activity.status !== 'done'

          return (
            <Card key={activity.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <Badge variant="neutral">{activityTypeLabel[activity.type]}</Badge>
                <ActivityStatusBadge status={activity.status} />
              </div>

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

              <div className="mt-3 flex flex-wrap gap-1.5">
                {activity.assignees.length === 0 ? (
                  <span className="text-muted-foreground text-xs">Sem responsável definido</span>
                ) : (
                  activity.assignees.map((entry) => (
                    <Badge key={entry.profile.id} variant="outline">
                      {entry.profile.full_name}
                    </Badge>
                  ))
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 pt-1">
                {(isAssignee || isLeader) && activity.status !== 'done' && (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => setStatus.mutate({ id: activity.id, status: 'done' })}
                  >
                    Concluir
                  </Button>
                )}
                {(isAssignee || isLeader) && activity.status === 'todo' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus.mutate({ id: activity.id, status: 'in_progress' })}
                  >
                    Começar
                  </Button>
                )}
                {(isAssignee || isLeader) && activity.status === 'done' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus.mutate({ id: activity.id, status: 'todo' })}
                  >
                    Reabrir
                  </Button>
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
