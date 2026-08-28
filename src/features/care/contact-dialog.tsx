import * as React from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Info } from 'lucide-react'
import { todayISO } from '@/lib/date'
import { FEEDBACK_PRIVACY_HINT, assignmentStatusLabel, attentionLabel, channelLabel } from '@/lib/labels'
import type { AssignmentStatus, AttentionLevel, ContactChannel } from '@/types/database'
import { useLogContact, type AssignmentWithPeople } from './use-care'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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

const CHANNELS: ContactChannel[] = ['whatsapp', 'call', 'in_person', 'message', 'video', 'other']
const STATUSES: AssignmentStatus[] = [
  'contacted',
  'awaiting_reply',
  'follow_up',
  'needs_attention',
  'pending',
]
const ATTENTION: AttentionLevel[] = ['normal', 'watch', 'leader_action']

const schema = z.object({
  channel: z.enum(['whatsapp', 'call', 'in_person', 'message', 'video', 'other']),
  contactedOn: z.string().min(1, 'Informe a data do contato.'),
  gotReply: z.boolean(),
  feedback: z.string().max(1500, 'Texto muito longo.').optional(),
  attentionLevel: z.enum(['normal', 'watch', 'leader_action']),
  status: z.enum(['pending', 'contacted', 'awaiting_reply', 'follow_up', 'needs_attention']),
})

type FormValues = z.infer<typeof schema>

/**
 * O mesmo fluxo para lider e discipulo: quem cuida registra o contato.
 * O feedback nunca aparece para a pessoa cuidada.
 */
export function ContactDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: AssignmentWithPeople | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const logContact = useLogContact()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      channel: 'whatsapp',
      contactedOn: todayISO(),
      gotReply: true,
      feedback: '',
      attentionLevel: 'normal',
      status: 'contacted',
    },
  })

  React.useEffect(() => {
    if (open && assignment) {
      form.reset({
        channel: 'whatsapp',
        contactedOn: todayISO(),
        gotReply: true,
        feedback: '',
        attentionLevel: assignment.attention_level,
        status: 'contacted',
      })
    }
  }, [open, assignment, form])

  const attention = useWatch({ control: form.control, name: 'attentionLevel' })

  const onSubmit = form.handleSubmit(async (values) => {
    if (!assignment) return
    await logContact.mutateAsync({
      assignmentId: assignment.id,
      channel: values.channel,
      contactedOn: values.contactedOn,
      gotReply: values.gotReply,
      feedback: values.feedback,
      attentionLevel: values.attentionLevel,
      status: values.status,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar contato</DialogTitle>
          <DialogDescription>
            {assignment ? `Como foi o cuidado com ${assignment.cared_for.full_name}?` : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Canal" required>
              <Controller
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Canal do contato">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((channel) => (
                        <SelectItem key={channel} value={channel}>
                          {channelLabel[channel]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field
              label="Data do contato"
              htmlFor="contactedOn"
              required
              error={form.formState.errors.contactedOn?.message}
            >
              <Input
                id="contactedOn"
                type="date"
                max={todayISO()}
                {...form.register('contactedOn')}
              />
            </Field>
          </div>

          <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="gotReply" className="cursor-pointer">
              A pessoa respondeu?
            </Label>
            <Controller
              control={form.control}
              name="gotReply"
              render={({ field }) => (
                <Switch id="gotReply" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <Field label="Como está a situação?" required>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Situação do cuidado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {assignmentStatusLabel[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Nível de atenção" required>
            <Controller
              control={form.control}
              name="attentionLevel"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Nível de atenção">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTENTION.map((level) => (
                      <SelectItem key={level} value={level}>
                        {attentionLabel[level]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {attention === 'leader_action' && (
            <Alert variant="warning">
              <Info aria-hidden />
              <AlertDescription>
                A liderança será avisada de que este cuidado precisa de atenção. O que você escrever
                abaixo não é enviado na notificação.
              </AlertDescription>
            </Alert>
          )}

          <Field
            label="Feedback (opcional)"
            htmlFor="feedback"
            hint={FEEDBACK_PRIVACY_HINT}
            error={form.formState.errors.feedback?.message}
          >
            <Textarea
              id="feedback"
              rows={4}
              placeholder="Ex.: conversamos sobre a semana, combinamos de nos ver no culto."
              {...form.register('feedback')}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={logContact.isPending}>
              Salvar contato
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
