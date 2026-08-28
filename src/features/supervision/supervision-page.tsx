import * as React from 'react'
import { Lock, MessagesSquare, Plus, ShieldCheck } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useSupervisionRequests } from './use-supervision'
import { SupervisionRequestDialog } from './supervision-request-dialog'
import { SupervisionThread } from './supervision-thread'
import { formatDate, formatDateTime } from '@/lib/date'
import { supervisionStatusLabel, urgencyLabel } from '@/lib/labels'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { SupervisionRequestWithPeople } from './use-supervision'

export function SupervisionPage() {
  const { role, isSupervisor } = useSession()
  const requests = useSupervisionRequests()
  const [creating, setCreating] = React.useState(false)
  const [selected, setSelected] = React.useState<SupervisionRequestWithPeople | null>(null)

  const canRequest = role === 'disciple' || role === 'leader'

  const open = (requests.data ?? []).filter((request) =>
    ['requested', 'seen', 'scheduled'].includes(request.status),
  )
  const closed = (requests.data ?? []).filter((request) =>
    ['done', 'cancelled'].includes(request.status),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Supervisão"
        description={
          isSupervisor
            ? 'Conversas pedidas por líderes e discípulos do GC.'
            : 'Um canal reservado para falar com Rolian, Larissa ou qualquer supervisor.'
        }
        actions={
          canRequest ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Pedir conversa
            </Button>
          ) : undefined
        }
      />

      <Alert variant="info">
        <Lock aria-hidden />
        <AlertDescription>
          {isSupervisor
            ? 'Solicitações reservadas e suas anotações não aparecem para os líderes do GC — nem em contadores.'
            : 'Ao marcar como reservada, nem o conteúdo nem a existência da solicitação chegam à liderança do GC.'}
        </AlertDescription>
      </Alert>

      {requests.isLoading && <CardListSkeleton rows={3} />}
      {requests.isError && <ErrorState error={requests.error} onRetry={() => requests.refetch()} />}

      {requests.isSuccess && (requests.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={MessagesSquare}
              title={isSupervisor ? 'Nenhuma conversa por aqui' : 'Você ainda não pediu conversa'}
              description={
                isSupervisor
                  ? 'Quando alguém pedir uma conversa, ela aparece nesta lista.'
                  : 'Se precisar conversar com um supervisor, é só pedir. Você escolhe se a liderança do GC fica sabendo.'
              }
              action={
                canRequest ? (
                  <Button onClick={() => setCreating(true)}>Pedir conversa</Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Em aberto</h2>
          {open.map((request) => (
            <RequestCard key={request.id} request={request} onOpen={() => setSelected(request)} />
          ))}
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Encerradas</h2>
          {closed.map((request) => (
            <RequestCard key={request.id} request={request} onOpen={() => setSelected(request)} />
          ))}
        </section>
      )}

      <SupervisionRequestDialog open={creating} onOpenChange={setCreating} />
      <SupervisionThread
        request={selected}
        open={Boolean(selected)}
        onOpenChange={(value) => !value && setSelected(null)}
      />
    </div>
  )
}

function RequestCard({
  request,
  onOpen,
}: {
  request: SupervisionRequestWithPeople
  onOpen: () => void
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-pretty">{request.subject}</p>
            <p className="text-muted-foreground text-xs">
              {request.requester.full_name} · {formatDate(request.created_at)}
              {request.supervisor ? ` · com ${request.supervisor.full_name}` : ' · qualquer supervisor'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {request.confidential_to_supervisors && (
              <Badge variant="default">
                <ShieldCheck aria-hidden />
                Reservada
              </Badge>
            )}
            {request.urgency !== 'normal' && (
              <Badge variant={request.urgency === 'high' ? 'danger' : 'neutral'}>
                {urgencyLabel[request.urgency]}
              </Badge>
            )}
            <Badge variant="neutral">{supervisionStatusLabel[request.status]}</Badge>
          </div>
        </div>

        <p className="text-muted-foreground line-clamp-2 text-sm text-pretty">{request.message}</p>

        {request.scheduled_for && (
          <p className="text-sm">Agendada para {formatDateTime(request.scheduled_for)}</p>
        )}

        <Button variant="outline" size="sm" onClick={onOpen}>
          Abrir conversa
        </Button>
      </CardContent>
    </Card>
  )
}
