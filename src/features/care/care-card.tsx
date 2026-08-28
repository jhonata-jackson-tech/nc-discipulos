import { ArrowLeftRight, History, MessageCirclePlus, MoreVertical } from 'lucide-react'
import { formatDate } from '@/lib/date'
import { assignmentOriginLabel } from '@/lib/labels'
import { AssignmentStatusBadge, AttentionBadge } from '@/components/common/badges'
import { Person } from '@/components/common/person'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AssignmentWithPeople } from './use-care'

interface CareCardProps {
  assignment: AssignmentWithPeople
  onContact: () => void
  onTransfer?: () => void
  onHistory: () => void
  showCaregiver?: boolean
}

export function CareCard({
  assignment,
  onContact,
  onTransfer,
  onHistory,
  showCaregiver,
}: CareCardProps) {
  const person = assignment.cared_for

  return (
    <Card role="group" aria-label={`Cuidado de ${person.full_name}`} className="p-4">
      <div className="flex items-start gap-3">
        <Person
          name={person.full_name}
          detail={
            showCaregiver
              ? `Com ${assignment.caregiver.full_name}`
              : assignmentOriginLabel[assignment.origin]
          }
          className="min-w-0 flex-1"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${person.full_name}`}>
              <MoreVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onContact}>
              <MessageCirclePlus aria-hidden />
              Marcar contato
            </DropdownMenuItem>
            {onTransfer && (
              <DropdownMenuItem onSelect={onTransfer}>
                <ArrowLeftRight aria-hidden />
                Transferir cuidado
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onHistory}>
              <History aria-hidden />
              Ver histórico
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AssignmentStatusBadge status={assignment.status} />
        <AttentionBadge level={assignment.attention_level} />
        {assignment.last_contact_at && (
          <span className="text-muted-foreground text-xs">
            Último contato em {formatDate(assignment.last_contact_at)}
          </span>
        )}
      </div>

      <Button
        variant={assignment.status === 'pending' ? 'default' : 'outline'}
        size="sm"
        className="mt-3 w-full sm:w-auto"
        onClick={onContact}
      >
        <MessageCirclePlus aria-hidden />
        {assignment.status === 'pending' ? 'Marcar contato' : 'Registrar novo contato'}
      </Button>
    </Card>
  )
}
