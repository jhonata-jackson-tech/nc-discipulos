import { History, MessageSquare } from 'lucide-react'
import { formatDate } from '@/lib/date'
import { assignmentOriginLabel, attentionLabel, channelLabel } from '@/lib/labels'
import { useContactLogs, type AssignmentWithPeople } from './use-care'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function CareHistoryDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: AssignmentWithPeople | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: logs, isLoading } = useContactLogs(open ? assignment?.id : undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Histórico do cuidado</DialogTitle>
          <DialogDescription>
            {assignment
              ? `${assignment.cared_for.full_name} · ${assignmentOriginLabel[assignment.origin]}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {assignment?.previous_caregiver_id && (
            <p className="text-muted-foreground bg-secondary rounded-lg p-3 text-sm">
              <History className="mr-1.5 inline size-4 align-text-bottom" aria-hidden />
              Este cuidado mudou de responsável em {formatDate(assignment.transferred_at)}.
            </p>
          )}

          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          )}

          {!isLoading && logs?.length === 0 && (
            <EmptyState
              icon={MessageSquare}
              title="Nenhum contato registrado ainda"
              description="Assim que você marcar um contato, ele aparece aqui."
            />
          )}

          <ol className="space-y-3">
            {logs?.map((log) => (
              <li key={log.id} className="border-border rounded-lg border p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{formatDate(log.contacted_on)}</span>
                  <Badge variant="neutral">{channelLabel[log.channel]}</Badge>
                  {log.got_reply ? (
                    <Badge variant="success">Respondeu</Badge>
                  ) : (
                    <Badge variant="outline">Sem retorno</Badge>
                  )}
                  {log.attention_level !== 'normal' && (
                    <Badge variant={log.attention_level === 'leader_action' ? 'danger' : 'warning'}>
                      {attentionLabel[log.attention_level]}
                    </Badge>
                  )}
                </div>
                {log.feedback ? (
                  <p className="text-sm text-pretty">{log.feedback}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">Sem observações.</p>
                )}
                <p className="text-muted-foreground mt-2 text-xs">
                  Registrado por {log.author.full_name}
                </p>
              </li>
            ))}
          </ol>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
