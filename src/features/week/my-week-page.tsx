import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CalendarX2,
  Cake,
  CheckCircle2,
  HeartHandshake,
  ListChecks,
  Sparkles,
} from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useAssignments, useCurrentWeek, useTransferRequests } from '@/features/care/use-care'
import { useCareActions } from '@/features/care/use-care-actions'
import { CareCard } from '@/features/care/care-card'
import { useActivities } from '@/features/activities/use-activities'
import { useActiveMembers } from '@/features/members/use-members'
import { birthdayInWindow, formatDate, formatWeekRange } from '@/lib/date'
import { pluralize } from '@/lib/utils'
import { comoChamar } from '@/lib/labels'
import { Constancia } from './constancia'
import { PageHeader } from '@/components/common/page-header'
import { StatTile } from '@/components/common/stat-tile'
import { CardListSkeleton, ErrorState, StatsSkeleton } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ActivityStatusBadge } from '@/components/common/badges'
import { TransfersInbox } from './transfers-inbox'
import { GroupProgressCard } from './group-progress-card'
import { SupervisorOverview } from './supervisor-overview'

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  )
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * "Minha semana" e a tela mais importante do produto: ela responde, de uma so
 * vez, o que esta pessoa precisa fazer nesta semana.
 */
export function MyWeekPage() {
  const { profile, role, isLeader, isSupervisor } = useSession()
  // Irmaos e irmas nao entram no rodizio como cuidadores: para eles, a home
  // fala de atividades e avisos, nao de carga de cuidado.
  const isCaregiver = role === 'leader' || role === 'disciple'
  const week = useCurrentWeek()
  const assignments = useAssignments(week.data?.id, profile?.id)
  const transfers = useTransferRequests(profile?.id)
  const activities = useActivities(week.data?.id)
  const members = useActiveMembers()
  const care = useCareActions()

  const myAssignments = assignments.data ?? []
  const done = myAssignments.filter((a) => a.status !== 'pending').length
  const progress = myAssignments.length > 0 ? Math.round((done / myAssignments.length) * 100) : 0

  const myActivities = React.useMemo(
    () =>
      (activities.data ?? []).filter((activity) =>
        activity.assignees.some((entry) => entry.profile.id === profile?.id),
      ),
    [activities.data, profile?.id],
  )

  const pendingTransfers = (transfers.data ?? []).filter(
    (transfer) => transfer.status === 'pending' && transfer.recipient_id === profile?.id,
  )

  const attentionPoints = myAssignments.filter((a) => a.attention_level !== 'normal')

  const birthdays = React.useMemo(
    () => (members.data ?? []).filter((m) => m.birth_date && birthdayInWindow(m.birth_date, 10)),
    [members.data],
  )

  if (week.isLoading) {
    return (
      <div className="space-y-5">
        <StatsSkeleton tiles={3} />
        <CardListSkeleton />
      </div>
    )
  }

  if (week.isError) return <ErrorState error={week.error} onRetry={() => week.refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${profile ? comoChamar(profile) : ''}`}
        description={
          week.data
            ? `Semana de ${formatWeekRange(week.data.starts_on, week.data.ends_on)}`
            : 'Ainda não há uma semana publicada.'
        }
      />

      {!week.data && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarX2}
              title="Nenhuma semana publicada ainda"
              description={
                isLeader
                  ? 'Gere a distribuição da semana e publique para que todos vejam seus cuidados.'
                  : 'Assim que a liderança publicar a semana, ela aparece aqui.'
              }
              action={
                isLeader ? (
                  <Button asChild>
                    <Link to="/distribuicao">Gerar distribuição</Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {pendingTransfers.length > 0 && (
        <Alert variant="info">
          <ArrowLeftRight aria-hidden />
          <div className="min-w-0 flex-1">
            <AlertTitle>
              {pluralize(pendingTransfers.length, 'pedido de transferência', 'pedidos de transferência')}{' '}
              esperando você
            </AlertTitle>
            <AlertDescription>Veja logo abaixo e responda quando puder.</AlertDescription>
          </div>
        </Alert>
      )}

      {week.data && isCaregiver && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Pessoas para cuidar"
            value={myAssignments.length}
            icon={HeartHandshake}
          />
          <StatTile label="Contatos feitos" value={done} icon={CheckCircle2} tone="success" />
          <StatTile
            label="Minhas atividades"
            value={myActivities.filter((a) => a.status !== 'done' && a.status !== 'cancelled').length}
            icon={ListChecks}
          />
          <StatTile
            label="Pontos de atenção"
            value={attentionPoints.length}
            icon={AlertTriangle}
            tone={attentionPoints.length > 0 ? 'warning' : 'default'}
          />
        </section>
      )}

      {week.data && !isCaregiver && (
        <section className="grid grid-cols-2 gap-3">
          <StatTile
            label="Minhas atividades"
            value={myActivities.filter((a) => a.status !== 'done' && a.status !== 'cancelled').length}
            icon={ListChecks}
          />
          <StatTile
            label="Aniversariantes por perto"
            value={birthdays.length}
            icon={Cake}
            tone="success"
          />
        </section>
      )}

      {week.data && isCaregiver && myAssignments.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Seu progresso nesta semana</span>
              <span className="tabular text-muted-foreground">
                {done} de {myAssignments.length}
              </span>
            </div>
            <Progress
              value={progress}
              aria-label={`Progresso do cuidado: ${progress}%`}
              indicatorClassName={progress === 100 ? 'bg-success' : undefined}
            />
            {progress === 100 && (
              <p className="text-success flex items-center gap-1.5 text-sm">
                <Sparkles className="size-4" aria-hidden />
                Você falou com todo mundo desta semana. Obrigado!
              </p>
            )}

            <Constancia />
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------ pessoas para cuidar */}
      {week.data && isCaregiver && (
        <section aria-labelledby="pessoas-para-cuidar" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="pessoas-para-cuidar" className="font-display text-lg font-semibold">
              Pessoas para cuidar
            </h2>
            {myAssignments.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/cuidados">Ver todos</Link>
              </Button>
            )}
          </div>

          {assignments.isLoading && <CardListSkeleton />}
          {assignments.isError && (
            <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
          )}

          {assignments.isSuccess && myAssignments.length === 0 && (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={HeartHandshake}
                  title="Você não tem cuidados nesta semana"
                  description="A liderança ainda não atribuiu pessoas a você nesta semana."
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {myAssignments.map((assignment) => (
              <CareCard
                key={assignment.id}
                assignment={assignment}
                onContact={() => care.onContact(assignment)}
                onTransfer={() => care.onTransfer(assignment)}
                onHistory={() => care.onHistory(assignment)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- atividades */}
      <section aria-labelledby="minhas-atividades" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="minhas-atividades" className="font-display text-lg font-semibold">
            Minhas atividades
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/atividades">Ver agenda</Link>
          </Button>
        </div>

        {activities.isLoading && <CardListSkeleton rows={2} />}

        {activities.isSuccess && myActivities.length === 0 && (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={ListChecks}
                title="Nenhuma atividade para você"
                description="Quando a liderança indicar você para o Talk, o lanche ou a dinâmica, aparece aqui."
              />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {myActivities.map((activity) => (
            <Card key={activity.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{activity.title}</p>
                  {activity.due_at && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {formatDate(activity.due_at)}
                    </p>
                  )}
                </div>
                <ActivityStatusBadge status={activity.status} />
              </div>
              {activity.assignees.length > 1 && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Com{' '}
                  {activity.assignees
                    .filter((entry) => entry.profile.id !== profile?.id)
                    .map((entry) => comoChamar(entry.profile))
                    .join(', ')}
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- transferencias */}
      <TransfersInbox />

      {/* -------------------------------------------------- aniversariantes */}
      {birthdays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="text-primary size-[18px]" aria-hidden />
              Aniversariantes por perto
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {birthdays.map((person) => (
              <Badge key={person.id} variant="neutral">
                {person.full_name} · {formatDate(person.birth_date)}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------- visao geral por papel */}
      {isLeader && <GroupProgressCard weekId={week.data?.id} />}
      {isSupervisor && <SupervisorOverview weekId={week.data?.id} />}

      {care.dialogs}
    </div>
  )
}
