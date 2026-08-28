import { Link } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'
import { useWeeks } from '@/features/care/use-care'
import { formatDate, formatWeekRange } from '@/lib/date'
import { PageHeader } from '@/components/common/page-header'
import { WeekStatusBadge } from '@/components/common/badges'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function WeeksPage() {
  const weeks = useWeeks()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Semanas de cuidado"
        description="Histórico das distribuições geradas, publicadas e encerradas."
        actions={
          <Button asChild variant="outline">
            <Link to="/distribuicao">Ir para a distribuição</Link>
          </Button>
        }
      />

      {weeks.isLoading && <CardListSkeleton rows={4} />}
      {weeks.isError && <ErrorState error={weeks.error} onRetry={() => weeks.refetch()} />}

      {weeks.isSuccess && (weeks.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarRange}
              title="Nenhuma semana registrada"
              description="Assim que a primeira distribuição for gerada, o histórico aparece aqui."
            />
          </CardContent>
        </Card>
      )}

      {(weeks.data?.length ?? 0) > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semana</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Gerada em</TableHead>
                <TableHead>Publicada em</TableHead>
                <TableHead>Avisos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(weeks.data ?? []).map((week) => (
                <TableRow key={week.id}>
                  <TableCell className="font-medium">
                    {formatWeekRange(week.starts_on, week.ends_on)}
                  </TableCell>
                  <TableCell>
                    <WeekStatusBadge status={week.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(week.generated_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(week.published_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {week.generation_report?.warnings.length
                      ? `${week.generation_report.warnings.length} aviso(s)`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
