import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { HeartHandshake, History, MessageCirclePlus, Search, SlidersHorizontal } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useAssignments, useWeeks } from './use-care'
import { useCareActions } from './use-care-actions'
import { CareCard } from './care-card'
import { formatWeekRange, startOfWeek } from '@/lib/date'
import {
  assignmentOriginLabel,
  assignmentStatusLabel,
  attentionLabel,
  careGenderShort,
  weekStatusLabel,
} from '@/lib/labels'
import type { AssignmentStatus, AttentionLevel } from '@/types/database'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { AssignmentStatusBadge, AttentionBadge } from '@/components/common/badges'
import { Person } from '@/components/common/person'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STATUS_OPTIONS: (AssignmentStatus | 'all')[] = [
  'all',
  'pending',
  'contacted',
  'awaiting_reply',
  'follow_up',
  'needs_attention',
]
const ATTENTION_OPTIONS: (AttentionLevel | 'all')[] = ['all', 'normal', 'watch', 'leader_action']

/**
 * Cartoes no celular, tabela confortavel no desktop. Lideres veem o GC inteiro;
 * discipulos veem as pessoas sob sua responsabilidade - a RLS garante isso, os
 * filtros abaixo apenas organizam a leitura.
 */
export function CarePage() {
  const { profile, isLeadership } = useSession()
  const [params, setParams] = useSearchParams()
  const weeks = useWeeks()

  const [selectedWeekId, setSelectedWeekId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<AssignmentStatus | 'all'>('all')
  const [attention, setAttention] = React.useState<AttentionLevel | 'all'>(
    params.get('atencao') ? 'leader_action' : 'all',
  )
  const [scope, setScope] = React.useState<'mine' | 'group'>(isLeadership ? 'mine' : 'mine')

  const visibleWeeks = React.useMemo(
    () => (weeks.data ?? []).filter((week) => isLeadership || week.status !== 'draft'),
    [weeks.data, isLeadership],
  )

  // Sem escolha explicita, abrimos na semana corrente - nao na semana futura
  // que porventura ja tenha sido publicada.
  const thisWeek = startOfWeek()
  const defaultWeek =
    visibleWeeks.find((week) => week.status !== 'draft' && week.starts_on <= thisWeek) ??
    visibleWeeks[0]
  const weekId = selectedWeekId ?? defaultWeek?.id ?? ''

  const assignments = useAssignments(
    weekId || undefined,
    scope === 'mine' ? profile?.id : undefined,
  )

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return (assignments.data ?? []).filter((assignment) => {
      if (status !== 'all' && assignment.status !== status) return false
      if (attention !== 'all' && assignment.attention_level !== attention) return false
      if (!term) return true
      return (
        assignment.cared_for.full_name.toLowerCase().includes(term) ||
        assignment.caregiver.full_name.toLowerCase().includes(term)
      )
    })
  }, [assignments.data, search, status, attention])

  const care = useCareActions()

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setAttention('all')
    setParams({})
  }

  const hasFilters = Boolean(search) || status !== 'all' || attention !== 'all'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cuidados"
        description={
          scope === 'mine'
            ? 'As pessoas sob sua responsabilidade nesta semana.'
            : 'Todos os cuidados do GC nesta semana.'
        }
        actions={
          isLeadership ? (
            <Tabs value={scope} onValueChange={(value) => setScope(value as 'mine' | 'group')}>
              <TabsList>
                <TabsTrigger value="mine">Meus cuidados</TabsTrigger>
                <TabsTrigger value="group">Todo o GC</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : undefined
        }
      />

      {/* ------------------------------------------------------------ filtros */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pessoa"
              aria-label="Buscar pessoa"
              className="pl-9"
            />
          </div>

          <Select value={weekId} onValueChange={setSelectedWeekId}>
            <SelectTrigger aria-label="Semana">
              <SelectValue placeholder="Semana" />
            </SelectTrigger>
            <SelectContent>
              {visibleWeeks.map((week) => (
                <SelectItem key={week.id} value={week.id}>
                  {formatWeekRange(week.starts_on, week.ends_on)}
                  {week.status !== 'published' ? ` · ${weekStatusLabel[week.status]}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(value) => setStatus(value as AssignmentStatus | 'all')}>
            <SelectTrigger aria-label="Situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'all' ? 'Todas as situações' : assignmentStatusLabel[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={attention}
            onValueChange={(value) => setAttention(value as AttentionLevel | 'all')}
          >
            <SelectTrigger aria-label="Nível de atenção">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTENTION_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'all' ? 'Qualquer atenção' : attentionLabel[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {hasFilters && (
        <div className="flex items-center gap-2 text-sm">
          <SlidersHorizontal className="text-muted-foreground size-4" aria-hidden />
          <span className="text-muted-foreground">
            {filtered.length} resultado(s) com os filtros atuais
          </span>
          <Button variant="link" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>
      )}

      {assignments.isLoading && <CardListSkeleton rows={4} />}
      {assignments.isError && (
        <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
      )}

      {assignments.isSuccess && filtered.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={HeartHandshake}
              title={hasFilters ? 'Nada encontrado com esses filtros' : 'Nenhum cuidado nesta semana'}
              description={
                hasFilters
                  ? 'Tente ajustar a busca ou limpar os filtros.'
                  : 'Quando a semana for publicada, os cuidados aparecem aqui.'
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------- cartoes (celular) */}
      {filtered.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:hidden">
          {filtered.map((assignment) => (
            <CareCard
              key={assignment.id}
              assignment={assignment}
              showCaregiver={scope === 'group'}
              onContact={() => care.onContact(assignment)}
              onTransfer={
                assignment.caregiver_id === profile?.id ? () => care.onTransfer(assignment) : undefined
              }
              onHistory={() => care.onHistory(assignment)}
            />
          ))}
        </div>
      )}

      {/* -------------------------------------------------- tabela (desktop) */}
      {filtered.length > 0 && (
        <Card className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa cuidada</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Atenção</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <Person
                      name={assignment.cared_for.full_name}
                      size="sm"
                      detail={
                        assignment.cared_for.care_gender
                          ? careGenderShort[assignment.cared_for.care_gender]
                          : undefined
                      }
                    />
                  </TableCell>
                  <TableCell className="text-sm">{assignment.caregiver.full_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{assignmentOriginLabel[assignment.origin]}</Badge>
                  </TableCell>
                  <TableCell>
                    <AssignmentStatusBadge status={assignment.status} />
                  </TableCell>
                  <TableCell>
                    {assignment.attention_level === 'normal' ? (
                      <span className="text-muted-foreground text-sm">—</span>
                    ) : (
                      <AttentionBadge level={assignment.attention_level} />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Marcar contato com ${assignment.cared_for.full_name}`}
                        onClick={() => care.onContact(assignment)}
                      >
                        <MessageCirclePlus aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Histórico de ${assignment.cared_for.full_name}`}
                        onClick={() => care.onHistory(assignment)}
                      >
                        <History aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {care.dialogs}
    </div>
  )
}
