import * as React from 'react'
import { GripVertical, Users } from 'lucide-react'
import { useActiveMembers } from '@/features/members/use-members'
import { careGenderShort, assignmentOriginLabel } from '@/lib/labels'
import { cn, initials } from '@/lib/utils'
import type { AssignmentWithPeople } from '@/features/care/use-care'
import type { CareGender, CareWeek } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { CardListSkeleton } from '@/components/common/states'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface DraftBoardProps {
  week: CareWeek
  assignments: AssignmentWithPeople[]
  loading: boolean
  onMove: (caredForId: string, caregiverId: string) => void
}

/**
 * Reorganizacao do rascunho: arrastar e soltar no desktop, e um seletor em cada
 * cartao como caminho equivalente por teclado e no celular.
 *
 * A lista de destinos e sempre restrita ao mesmo genero de cuidado - e o banco
 * recusa qualquer tentativa que passe por cima disso.
 */
export function DraftBoard({ week, assignments, loading, onMove }: DraftBoardProps) {
  const { data: members } = useActiveMembers()
  const [dragging, setDragging] = React.useState<AssignmentWithPeople | null>(null)
  const [hovered, setHovered] = React.useState<string | null>(null)

  const editable = week.status === 'draft'

  const caregivers = React.useMemo(() => {
    const ids = new Set(assignments.map((assignment) => assignment.caregiver_id))
    const fromAssignments = assignments.map((assignment) => assignment.caregiver)
    const extras = (members ?? []).filter(
      (member) => ['leader', 'disciple'].includes(member.role) && !ids.has(member.id),
    )
    const unique = new Map([...fromAssignments, ...extras].map((person) => [person.id, person]))
    return Array.from(unique.values()).sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
  }, [assignments, members])

  const byCaregiver = React.useMemo(() => {
    const map = new Map<string, AssignmentWithPeople[]>()
    for (const assignment of assignments) {
      const list = map.get(assignment.caregiver_id) ?? []
      list.push(assignment)
      map.set(assignment.caregiver_id, list)
    }
    return map
  }, [assignments])

  if (loading) return <CardListSkeleton rows={3} />

  if (assignments.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Users}
            title="Esta semana ainda não tem cuidados"
            description="Gere a distribuição para preencher o quadro."
          />
        </CardContent>
      </Card>
    )
  }

  const handleDrop = (caregiverId: string) => {
    if (!dragging || !editable) return
    setHovered(null)
    if (dragging.caregiver_id === caregiverId) return

    const target = caregivers.find((person) => person.id === caregiverId)
    if (target?.care_gender !== dragging.cared_for.care_gender) return

    onMove(dragging.cared_for_id, caregiverId)
    setDragging(null)
  }

  return (
    <section aria-labelledby="quadro-rascunho" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="quadro-rascunho" className="font-display text-lg font-semibold">
          Quadro da semana
        </h2>
        {editable && (
          <p className="text-muted-foreground text-sm">
            Arraste um cartão entre as colunas ou use o seletor dentro dele.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {caregivers.map((caregiver) => {
          const list = byCaregiver.get(caregiver.id) ?? []
          const canDrop =
            editable && dragging !== null && dragging.cared_for.care_gender === caregiver.care_gender

          return (
            <Card
              key={caregiver.id}
              onDragOver={(event) => {
                if (!canDrop) return
                event.preventDefault()
                setHovered(caregiver.id)
              }}
              onDragLeave={() => setHovered((current) => (current === caregiver.id ? null : current))}
              onDrop={() => handleDrop(caregiver.id)}
              className={cn(
                'transition-colors',
                hovered === caregiver.id && canDrop && 'border-primary bg-primary-soft/40',
                dragging && !canDrop && 'opacity-60',
              )}
            >
              <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                <Avatar className="size-9">
                  <AvatarFallback>{initials(caregiver.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-sm">{caregiver.full_name}</CardTitle>
                  <p className="text-muted-foreground text-xs">
                    {caregiver.care_gender ? careGenderShort[caregiver.care_gender as CareGender] : '--'}
                  </p>
                </div>
                <Badge variant={list.length === 0 ? 'outline' : 'neutral'}>{list.length}</Badge>
              </CardHeader>

              <CardContent className="space-y-2 pt-1">
                {list.length === 0 && (
                  <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
                    Sem pessoas nesta coluna
                  </p>
                )}

                {list.map((assignment) => (
                  <div
                    key={assignment.id}
                    draggable={editable}
                    onDragStart={() => setDragging(assignment)}
                    onDragEnd={() => {
                      setDragging(null)
                      setHovered(null)
                    }}
                    className={cn(
                      'border-border bg-card rounded-lg border p-2.5',
                      editable && 'cursor-grab active:cursor-grabbing',
                      dragging?.id === assignment.id && 'opacity-50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {editable && (
                        <GripVertical className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {assignment.cared_for.full_name}
                      </span>
                    </div>

                    <p className="text-muted-foreground mt-1 text-xs">
                      {assignmentOriginLabel[assignment.origin]}
                    </p>

                    {editable && (
                      <Select
                        value={assignment.caregiver_id}
                        onValueChange={(value) => onMove(assignment.cared_for_id, value)}
                      >
                        <SelectTrigger
                          className="mt-2 h-9 text-xs"
                          aria-label={`Responsável por ${assignment.cared_for.full_name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {caregivers
                            .filter(
                              (person) =>
                                person.care_gender === assignment.cared_for.care_gender &&
                                person.id !== assignment.cared_for_id,
                            )
                            .map((person) => (
                              <SelectItem key={person.id} value={person.id}>
                                {person.full_name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
