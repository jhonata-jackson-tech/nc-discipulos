import * as React from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldCheck } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useActiveMembers } from '@/features/members/use-members'
import { urgencyLabel } from '@/lib/labels'
import type { SupervisionUrgency } from '@/types/database'
import { useCreateSupervisionRequest } from './use-supervision'
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

const URGENCIES: SupervisionUrgency[] = ['low', 'normal', 'high']
const ANY_SUPERVISOR = 'any'

const schema = z.object({
  supervisorId: z.string(),
  subject: z.string().trim().min(3, 'Escreva um assunto.'),
  message: z.string().trim().min(10, 'Conte um pouco mais para o supervisor se preparar.'),
  urgency: z.enum(['low', 'normal', 'high']),
  suggestedTimes: z.string().optional(),
  confidential: z.boolean(),
})

export function SupervisionRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { profile, group } = useSession()
  const { data: members } = useActiveMembers()
  const create = useCreateSupervisionRequest()

  const supervisors = (members ?? []).filter((member) => member.role === 'supervisor')

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      supervisorId: ANY_SUPERVISOR,
      subject: '',
      message: '',
      urgency: 'normal',
      suggestedTimes: '',
      confidential: true,
    },
  })

  React.useEffect(() => {
    if (open) form.reset()
  }, [open, form])

  const confidential = useWatch({ control: form.control, name: 'confidential' })

  const onSubmit = form.handleSubmit(async (values) => {
    if (!profile || !group) return
    await create.mutateAsync({
      groupId: group.id,
      requesterId: profile.id,
      supervisorId: values.supervisorId === ANY_SUPERVISOR ? null : values.supervisorId,
      subject: values.subject,
      message: values.message,
      urgency: values.urgency,
      suggestedTimes: values.suggestedTimes,
      confidential: values.confidential,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedir conversa com a supervisão</DialogTitle>
          <DialogDescription>
            Conte o necessário para marcarem um horário. Você decide quem enxerga este pedido.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Com quem você quer falar" required>
            <Controller
              control={form.control}
              name="supervisorId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Supervisor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_SUPERVISOR}>Qualquer supervisor</SelectItem>
                    {supervisors.map((supervisor) => (
                      <SelectItem key={supervisor.id} value={supervisor.id}>
                        {supervisor.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Assunto" htmlFor="subject" required error={form.formState.errors.subject?.message}>
            <Input id="subject" {...form.register('subject')} />
          </Field>

          <Field label="Mensagem" htmlFor="message" required error={form.formState.errors.message?.message}>
            <Textarea id="message" rows={4} {...form.register('message')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Urgência" required>
              <Controller
                control={form.control}
                name="urgency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Urgência">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {URGENCIES.map((urgency) => (
                        <SelectItem key={urgency} value={urgency}>
                          {urgencyLabel[urgency]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="Horários que funcionam" htmlFor="suggestedTimes">
              <Input
                id="suggestedTimes"
                placeholder="Ex.: terça à noite, sábado de manhã"
                {...form.register('suggestedTimes')}
              />
            </Field>
          </div>

          <div className="border-border flex items-start justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label htmlFor="confidential" className="cursor-pointer">
                Reservado aos supervisores
              </Label>
              <p className="text-muted-foreground text-xs">
                Nem o conteúdo nem a existência deste pedido aparecem para os líderes do GC.
              </p>
            </div>
            <Controller
              control={form.control}
              name="confidential"
              render={({ field }) => (
                <Switch id="confidential" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          {confidential && (
            <Alert variant="info">
              <ShieldCheck aria-hidden />
              <AlertDescription>
                Apenas você e os supervisores verão este pedido.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Enviar pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
