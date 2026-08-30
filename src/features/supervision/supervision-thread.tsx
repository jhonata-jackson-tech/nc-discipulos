import * as React from 'react'
import { Lock, NotebookPen } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import {
  useAddSupervisionNote,
  useSupervisionNotes,
  useUpdateSupervisionRequest,
  type SupervisionRequestWithPeople,
} from './use-supervision'
import { formatDate, formatDateTime } from '@/lib/date'
import { supervisionStatusLabel, urgencyLabel } from '@/lib/labels'
import type { SupervisionStatus } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STATUSES: SupervisionStatus[] = ['requested', 'seen', 'scheduled', 'done', 'cancelled']

/** Area de trabalho do supervisor sobre uma solicitacao. */
export function SupervisionThread({
  request,
  open,
  onOpenChange,
}: {
  request: SupervisionRequestWithPeople | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Monta apenas com o dialogo aberto, para o rascunho comecar vazio. */}
        {open && request && <ThreadBody request={request} />}
      </DialogContent>
    </Dialog>
  )
}

function ThreadBody({ request }: { request: SupervisionRequestWithPeople }) {
  const { profile, isSupervisor } = useSession()
  const update = useUpdateSupervisionRequest()
  const notes = useSupervisionNotes(isSupervisor ? request.id : undefined)
  const addNote = useAddSupervisionNote()
  const [note, setNote] = React.useState('')
  const [scheduledFor, setScheduledFor] = React.useState(
    request.scheduled_for ? request.scheduled_for.slice(0, 16) : '',
  )

  const isRequester = request.requester_id === profile?.id

  return (
    <>
      <DialogHeader>
        <DialogTitle>{request.subject}</DialogTitle>
        <DialogDescription>
          {request.requester.full_name} · {formatDate(request.created_at)}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">{supervisionStatusLabel[request.status]}</Badge>
          <Badge variant={request.urgency === 'high' ? 'danger' : 'outline'}>
            {urgencyLabel[request.urgency]}
          </Badge>
          {request.confidential_to_supervisors && (
            <Badge variant="default">
              <Lock aria-hidden />
              Reservada
            </Badge>
          )}
        </div>

        <p className="text-sm text-pretty">{request.message}</p>

        {request.suggested_times && (
          <p className="text-muted-foreground text-sm">
            Horários sugeridos: {request.suggested_times}
          </p>
        )}

        {request.scheduled_for && (
          <p className="text-sm font-medium">
            Agendada para {formatDateTime(request.scheduled_for)}
          </p>
        )}

        {isSupervisor && (
          <>
            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Situação">
                <Select
                  value={request.status}
                  onValueChange={(value) =>
                    update.mutate({
                      id: request.id,
                      status: value as SupervisionStatus,
                      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
                    })
                  }
                >
                  <SelectTrigger aria-label="Situação da solicitação">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {supervisionStatusLabel[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Agendar para" htmlFor="scheduledFor">
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </Field>
            </div>

            <Alert variant="info">
              <NotebookPen aria-hidden />
              <AlertDescription>
                As anotações abaixo são visíveis apenas aos supervisores. Nem líderes nem o
                solicitante têm acesso.
              </AlertDescription>
            </Alert>

            <Field label="Nova anotação" htmlFor="note">
              <Textarea
                id="note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>

            <Button
              size="sm"
              disabled={note.trim().length < 3}
              loading={addNote.isPending}
              onClick={async () => {
                if (!profile) return
                await addNote.mutateAsync({
                  requestId: request.id,
                  supervisorId: profile.id,
                  note: note.trim(),
                })
                setNote('')
              }}
            >
              Salvar anotação
            </Button>

            <ol className="space-y-2">
              {(notes.data ?? []).map((entry) => (
                <li key={entry.id} className="bg-secondary rounded-lg p-3">
                  <p className="text-sm text-pretty">{entry.note}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatDateTime(entry.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}

        {isRequester && request.status !== 'cancelled' && request.status !== 'done' && (
          <>
            <Separator />
            <Button
              variant="outline"
              onClick={() => update.mutate({ id: request.id, status: 'cancelled' })}
            >
              Cancelar meu pedido
            </Button>
          </>
        )}
      </DialogBody>
    </>
  )
}
