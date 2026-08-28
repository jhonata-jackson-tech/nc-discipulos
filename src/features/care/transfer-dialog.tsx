import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldAlert } from 'lucide-react'
import { careGenderShort } from '@/lib/labels'
import { useActiveMembers } from '@/features/members/use-members'
import { useRequestTransfer, type AssignmentWithPeople } from './use-care'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const schema = z.object({
  recipientId: z.uuid('Escolha para quem transferir.'),
  reason: z.string().trim().min(5, 'Explique brevemente o motivo.'),
})

export function TransferDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: AssignmentWithPeople | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: members } = useActiveMembers()
  const requestTransfer = useRequestTransfer()

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { recipientId: '', reason: '' },
  })

  React.useEffect(() => {
    if (open) form.reset({ recipientId: '', reason: '' })
  }, [open, form])

  /**
   * A lista ja vem filtrada pelo genero de cuidado da pessoa cuidada - e o
   * servidor valida de novo no envio e no aceite.
   */
  const eligible = React.useMemo(() => {
    if (!assignment || !members) return []
    return members.filter(
      (person) =>
        ['leader', 'disciple'].includes(person.role) &&
        person.care_gender === assignment.cared_for.care_gender &&
        person.id !== assignment.caregiver_id &&
        person.id !== assignment.cared_for_id,
    )
  }, [assignment, members])

  const onSubmit = form.handleSubmit(async (values) => {
    if (!assignment) return
    await requestTransfer.mutateAsync({
      assignmentId: assignment.id,
      recipientId: values.recipientId,
      reason: values.reason,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir cuidado</DialogTitle>
          <DialogDescription>
            {assignment
              ? `O cuidado de ${assignment.cared_for.full_name} continua com você até a outra pessoa aceitar.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {assignment && (
            <Alert variant="info">
              <ShieldAlert aria-hidden />
              <AlertDescription>
                Só aparecem pessoas do mesmo grupo de cuidado (
                {careGenderShort[assignment.cared_for.care_gender ?? 'male'].toLowerCase()}).
              </AlertDescription>
            </Alert>
          )}

          <Field label="Transferir para" required error={form.formState.errors.recipientId?.message}>
            <Controller
              control={form.control}
              name="recipientId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Escolha quem vai receber">
                    <SelectValue placeholder="Escolha um líder ou discípulo" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {eligible.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Não há outro cuidador disponível para este grupo de cuidado no momento.
            </p>
          )}

          <Field label="Motivo" htmlFor="reason" required error={form.formState.errors.reason?.message}>
            <Textarea
              id="reason"
              rows={3}
              placeholder="Ex.: estarei viajando nesta semana."
              {...form.register('reason')}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={requestTransfer.isPending} disabled={eligible.length === 0}>
              Enviar pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
