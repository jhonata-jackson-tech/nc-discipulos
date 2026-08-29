import * as React from 'react'
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Info,
  Repeat,
  Send,
  Shuffle,
  Sparkles,
} from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import {
  useAssignments,
  useReassignCare,
  useWeeks,
  type AssignmentWithPeople,
} from '@/features/care/use-care'
import { useActiveMembers } from '@/features/members/use-members'
import {
  useCloseWeek,
  useGenerateWeek,
  usePublishWeek,
  useSetDraftAssignment,
} from './use-distribution'
import { addDays, formatWeekRange, startOfWeek, todayISO } from '@/lib/date'
import { careGenderShort, weekStatusLabel } from '@/lib/labels'
import { PageHeader } from '@/components/common/page-header'
import { WeekStatusBadge } from '@/components/common/badges'
import { CardListSkeleton } from '@/components/common/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
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
import { DraftBoard } from './draft-board'
import type { PoolReportRow } from '@/types/database'

export function DistributionPage() {
  const { group } = useSession()
  const weeks = useWeeks()
  const generate = useGenerateWeek()
  const publish = usePublishWeek()
  const close = useCloseWeek()
  const setDraftAssignment = useSetDraftAssignment()
  const members = useActiveMembers()

  const nextMonday = startOfWeek(addDays(todayISO(), 7))
  const [chosenWeekId, setChosenWeekId] = React.useState<string | null>(null)

  // O rascunho em aberto e o ponto de partida natural desta tela.
  const reassign = useReassignCare()
  const [remanejando, setRemanejando] = React.useState<{
    assignment: AssignmentWithPeople
    caregiverId: string
  } | null>(null)
  const defaultWeek = weeks.data?.find((item) => item.status === 'draft') ?? weeks.data?.[0]
  const selectedWeekId = chosenWeekId ?? defaultWeek?.id ?? ''
  const week = weeks.data?.find((item) => item.id === selectedWeekId) ?? null
  const assignments = useAssignments(week?.id)

  const report = week?.generation_report
  const alreadyHasNextWeek = weeks.data?.some((item) => item.starts_on === nextMonday)

  const handleGenerate = async (startsOn: string) => {
    if (!group) return
    const result = await generate.mutateAsync({ groupId: group.id, startsOn })
    setChosenWeekId(result.weekId)
  }

  const pendingGender = (members.data ?? []).filter(
    (member) => member.care_gender === null && ['leader', 'disciple', 'member'].includes(member.role),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Distribuição semanal"
        description="Gere o rascunho, confira a carga de cada cuidador e publique quando estiver certo."
        actions={
          <Button
            onClick={() => handleGenerate(nextMonday)}
            loading={generate.isPending}
            disabled={pendingGender.length > 0}
          >
            <CalendarPlus aria-hidden />
            {alreadyHasNextWeek ? 'Regerar próxima semana' : 'Gerar próxima semana'}
          </Button>
        }
      />

      {pendingGender.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle aria-hidden />
          <div className="min-w-0 flex-1">
            <AlertTitle>Confirme o gênero de cuidado antes de gerar</AlertTitle>
            <AlertDescription>
              {pendingGender.length} integrante(s) ativo(s) ainda estão sem essa confirmação:{' '}
              {pendingGender
                .slice(0, 6)
                .map((member) => member.full_name)
                .join(', ')}
              {pendingGender.length > 6 ? '…' : ''}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {weeks.isLoading && <CardListSkeleton rows={2} />}

      {weeks.isSuccess && (weeks.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Shuffle}
              title="Nenhuma semana gerada ainda"
              description="Gere a primeira distribuição para começar o ciclo de cuidado."
              action={
                <Button onClick={() => handleGenerate(startOfWeek())} loading={generate.isPending}>
                  Gerar a semana atual
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {weeks.data && weeks.data.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Select value={selectedWeekId} onValueChange={setChosenWeekId}>
              <SelectTrigger className="sm:max-w-xs" aria-label="Semana">
                <SelectValue placeholder="Escolha a semana" />
              </SelectTrigger>
              <SelectContent>
                {weeks.data.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {formatWeekRange(item.starts_on, item.ends_on)} · {weekStatusLabel[item.status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {week && <WeekStatusBadge status={week.status} />}

            <div className="ms-auto flex flex-wrap gap-2">
              {week?.status === 'draft' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button loading={publish.isPending}>
                      <Send aria-hidden />
                      Publicar semana
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>Publicar esta semana?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Todos os cuidadores serão avisados e passarão a ver suas pessoas. Depois de
                      publicada, mudanças só acontecem com justificativa.
                    </AlertDialogDescription>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => publish.mutate(week.id)}>
                        Publicar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {week?.status === 'published' && (
                <Button variant="outline" onClick={() => close.mutate(week.id)} loading={close.isPending}>
                  Encerrar semana
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------- relatorio */}
      {report && (
        <div className="grid gap-4 lg:grid-cols-2">
          {report.pools
            .filter((pool) => pool.caredForCount > 0)
            .map((pool) => (
              <PoolCard key={pool.gender} pool={pool} />
            ))}
        </div>
      )}

      {report && report.warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle aria-hidden />
          <div className="min-w-0 flex-1">
            <AlertTitle>Pontos a conferir nesta geração</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {report.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </div>
        </Alert>
      )}

      {report && report.warnings.length === 0 && week?.status === 'draft' && (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertDescription>
            Carga equilibrada nos dois grupos e nenhuma dupla repetida. Pode publicar com tranquilidade.
          </AlertDescription>
        </Alert>
      )}

      {/* -------------------------------------------------- quadro do rascunho */}
      {week && (
        <DraftBoard
          week={week}
          assignments={assignments.data ?? []}
          loading={assignments.isLoading}
          onMove={(caredForId, caregiverId) =>
            setDraftAssignment.mutate({ weekId: week.id, caredForId, caregiverId })
          }
          onReassign={(assignment, caregiverId) =>
            setRemanejando({ assignment, caregiverId })
          }
        />
      )}

      <RemanejarDialog
        pedido={remanejando}
        onClose={() => setRemanejando(null)}
        onConfirmar={(motivo) => {
          if (!remanejando) return
          reassign.mutate(
            {
              assignmentId: remanejando.assignment.id,
              newCaregiverId: remanejando.caregiverId,
              reason: motivo,
            },
            { onSuccess: () => setRemanejando(null) },
          )
        }}
        enviando={reassign.isPending}
      />
    </div>
  )
}

function PoolCard({ pool }: { pool: PoolReportRow }) {
  const label = careGenderShort[pool.gender]
  const totals = pool.loads.map((load) => load.total)
  const spread = totals.length > 0 ? Math.max(...totals) - Math.min(...totals) : 0

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-primary size-[18px]" aria-hidden />
          {label}
        </CardTitle>
        <Badge variant={spread <= 1 ? 'success' : 'warning'}>
          {spread <= 1 ? 'Carga equilibrada' : `Diferença de ${spread}`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {pool.caredForCount} pessoa(s) para {pool.caregiverCount} cuidador(es) · carga base{' '}
          <strong className="text-foreground">{pool.baseLoad}</strong>
          {pool.extraSlotCount > 0 && ` · ${pool.extraSlotCount} com uma pessoa a mais`}
        </p>

        <ul className="divide-border divide-y">
          {pool.loads.map((load) => (
            <li key={load.caregiverId} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{load.fullName}</span>
              {load.fixed > 0 && (
                <Badge variant="outline">{load.fixed} do discipulado</Badge>
              )}
              <span className="tabular font-medium">{load.total}</span>
            </li>
          ))}
        </ul>

        {pool.repeatedPairs.length > 0 && (
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <Repeat className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {pool.repeatedPairs.length} dupla(s) repetida(s) por falta de combinação inédita.
          </p>
        )}

        {pool.unassigned.length > 0 && (
          <p className="text-destructive flex items-start gap-1.5 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Sem cuidador: {pool.unassigned.join(', ')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}


/**
 * Remanejar um cuidado de semana já publicada.
 *
 * A semana publicada já está no celular de todo mundo: alguém já viu que ia
 * cuidar de alguém. Trocar sem dizer por quê seria puxar o tapete — por isso
 * o motivo é exigido e fica no histórico, e as duas pessoas envolvidas são
 * avisadas. Em rascunho nada disso é necessário: ali ainda é planejamento.
 */
function RemanejarDialog({
  pedido,
  onClose,
  onConfirmar,
  enviando,
}: {
  pedido: { assignment: AssignmentWithPeople; caregiverId: string } | null
  onClose: () => void
  onConfirmar: (motivo: string) => void
  enviando: boolean
}) {
  const [motivo, setMotivo] = React.useState('')

  return (
    <Dialog open={Boolean(pedido)} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent key={pedido?.assignment.id}>
        <DialogHeader>
          <DialogTitle>Remanejar cuidado</DialogTitle>
          <DialogDescription>
            O cuidado de {pedido?.assignment.cared_for.full_name} passa para outra pessoa. Esta
            semana já foi publicada — as duas pessoas serão avisadas.
          </DialogDescription>
        </DialogHeader>

        <Field label="Motivo" required>
          <Textarea
            rows={3}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            placeholder="Ex.: o responsável está viajando esta semana."
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={motivo.trim().length < 3}
            loading={enviando}
            onClick={() => onConfirmar(motivo.trim())}
          >
            Remanejar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
