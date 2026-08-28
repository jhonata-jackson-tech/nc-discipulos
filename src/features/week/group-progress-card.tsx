import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Users } from 'lucide-react'
import { useAssignments, useWeekSummary } from '@/features/care/use-care'
import { careGenderShort } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Person } from '@/components/common/person'

/**
 * Resumo do GC para o lider. Vem depois dos cuidados pessoais dele: primeiro o
 * que ele mesmo precisa fazer, depois o acompanhamento do grupo.
 */
export function GroupProgressCard({ weekId }: { weekId: string | undefined }) {
  const summary = useWeekSummary(weekId)
  const assignments = useAssignments(weekId)

  if (!weekId) return null

  if (summary.isLoading) {
    return <Skeleton className="h-64 rounded-xl" />
  }

  const data = summary.data
  if (!data || data.total === 0) return null

  const contacted = data.total - data.pending
  const progress = Math.round((contacted / data.total) * 100)
  const attention = (assignments.data ?? []).filter((a) => a.attention_level !== 'normal')

  return (
    <section aria-labelledby="resumo-gc" className="space-y-3">
      <h2 id="resumo-gc" className="font-display text-lg font-semibold">
        Como está o GC nesta semana
      </h2>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Users className="text-primary size-[18px]" aria-hidden />
            Contatos realizados
          </CardTitle>
          <span className="tabular text-muted-foreground text-sm">
            {contacted} de {data.total}
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} aria-label={`Progresso do GC: ${progress}%`} />

          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">
              <Clock aria-hidden />
              {data.pending} pendente(s)
            </Badge>
            {data.watch > 0 && <Badge variant="warning">{data.watch} para observar</Badge>}
            {data.leaderAction > 0 && (
              <Badge variant="danger">
                <AlertTriangle aria-hidden />
                {data.leaderAction} precisa(m) da liderança
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold uppercase">Carga por cuidador</p>
            <ul className="divide-border divide-y">
              {data.byCaregiver.map((entry) => (
                <li key={entry.caregiverId} className="flex items-center gap-3 py-2">
                  <Person name={entry.name} size="sm" className="min-w-0 flex-1" />
                  <Badge variant="outline">{careGenderShort[entry.careGender]}</Badge>
                  <span className="tabular text-muted-foreground w-14 text-right text-sm">
                    {entry.done}/{entry.total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {attention.length > 0 && (
        <Card className="border-warning/35">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="text-warning-foreground size-[18px]" aria-hidden />
              Precisa da sua atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.map((assignment) => (
              <div key={assignment.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{assignment.cared_for.full_name}</span>
                <span className="text-muted-foreground">
                  com {assignment.caregiver.full_name}
                </span>
                <Badge variant={assignment.attention_level === 'leader_action' ? 'danger' : 'warning'}>
                  {assignment.attention_level === 'leader_action' ? 'Agir' : 'Observar'}
                </Badge>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/cuidados?atencao=1">Abrir cuidados</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
