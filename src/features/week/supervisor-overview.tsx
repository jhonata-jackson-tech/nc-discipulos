import { Link } from 'react-router-dom'
import { MessagesSquare } from 'lucide-react'
import { useWeekSummary } from '@/features/care/use-care'
import { useSupervisionRequests } from '@/features/supervision/use-supervision'
import { formatDate } from '@/lib/date'
import { supervisionStatusLabel, urgencyLabel } from '@/lib/labels'
import { StatTile } from '@/components/common/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/** Visao do supervisor: indicadores do GC e as conversas que aguardam resposta. */
export function SupervisorOverview({ weekId }: { weekId: string | undefined }) {
  const summary = useWeekSummary(weekId)
  const requests = useSupervisionRequests()

  const open = (requests.data ?? []).filter((request) =>
    ['requested', 'seen', 'scheduled'].includes(request.status),
  )

  return (
    <section aria-labelledby="visao-supervisao" className="space-y-3">
      <h2 id="visao-supervisao" className="font-display text-lg font-semibold">
        Acompanhamento do GC
      </h2>

      {summary.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Cuidados da semana" value={summary.data.total} />
          <StatTile label="Contatos realizados" value={summary.data.total - summary.data.pending} tone="success" />
          <StatTile label="Para observar" value={summary.data.watch} tone="warning" />
          <StatTile label="Liderança precisa agir" value={summary.data.leaderAction} tone="danger" />
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <MessagesSquare className="text-primary size-[18px]" aria-hidden />
            Conversas em aberto
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/supervisao">Ver todas</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {open.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="Nenhuma conversa aguardando"
              description="Você será avisado quando um líder ou discípulo pedir uma conversa."
            />
          ) : (
            <ul className="divide-border divide-y">
              {open.slice(0, 5).map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{request.subject}</span>
                    <span className="text-muted-foreground block text-xs">
                      {request.requester.full_name} · {formatDate(request.created_at)}
                    </span>
                  </span>
                  {request.urgency === 'high' && <Badge variant="danger">{urgencyLabel.high}</Badge>}
                  <Badge variant="neutral">{supervisionStatusLabel[request.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
