import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useActiveMembers } from '@/features/members/use-members'
import { activityStatusLabel, activityTypeLabel } from '@/lib/labels'
import type { ActivityStatus, ActivityType } from '@/types/database'
import { useSaveActivity, type ActivityWithAssignees } from './use-activities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TYPES: ActivityType[] = ['talk', 'snack', 'dynamic', 'birthdays', 'other']
const STATUSES: ActivityStatus[] = ['todo', 'in_progress', 'done', 'cancelled']

const schema = z.object({
  type: z.enum(['talk', 'snack', 'dynamic', 'birthdays', 'other']),
  title: z.string().trim().min(2, 'Dê um título à atividade.'),
  description: z.string().optional(),
  dueAt: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
  notes: z.string().optional(),
  isRecurring: z.boolean(),
  assigneeIds: z.array(z.string()),
})

type FormValues = z.infer<typeof schema>

export function ActivityDialog({
  activity,
  groupId,
  weekId,
  open,
  onOpenChange,
}: {
  activity: ActivityWithAssignees | null
  groupId: string
  weekId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: members } = useActiveMembers()
  const save = useSaveActivity()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'talk',
      title: '',
      description: '',
      dueAt: '',
      status: 'todo',
      notes: '',
      isRecurring: false,
      assigneeIds: [],
    },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      type: activity?.type ?? 'talk',
      title: activity?.title ?? '',
      description: activity?.description ?? '',
      dueAt: activity?.due_at ? activity.due_at.slice(0, 16) : '',
      status: activity?.status ?? 'todo',
      notes: activity?.notes ?? '',
      isRecurring: activity?.is_recurring ?? false,
      assigneeIds: activity?.assignees.map((entry) => entry.profile.id) ?? [],
    })
  }, [open, activity, form])

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: activity?.id ?? null,
      groupId,
      weekId,
      type: values.type,
      title: values.title,
      description: values.description || null,
      dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null,
      status: values.status,
      notes: values.notes || null,
      isRecurring: values.isRecurring,
      assigneeIds: values.assigneeIds,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activity ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
          <DialogDescription>
            O Talk e as demais atividades podem ter mais de um responsável.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" required>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Tipo de atividade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {activityTypeLabel[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="Situação" required>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Situação da atividade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {activityStatusLabel[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Field label="Título" htmlFor="title" required error={form.formState.errors.title?.message}>
            <Input id="title" placeholder="Ex.: Talk sobre gratidão" {...form.register('title')} />
          </Field>

          <Field label="Descrição" htmlFor="description">
            <Textarea id="description" rows={3} {...form.register('description')} />
          </Field>

          <Field label="Prazo" htmlFor="dueAt" hint="Opcional. Horário no fuso de São Paulo.">
            <Input id="dueAt" type="datetime-local" {...form.register('dueAt')} />
          </Field>

          <Field label="Responsáveis">
            <Controller
              control={form.control}
              name="assigneeIds"
              render={({ field }) => (
                // No celular a lista flui dentro do proprio dialogo: uma area
                // rolavel dentro de outra e dificil de operar com o dedo.
                <div className="scrollbar-thin space-y-1 rounded-lg border p-2 sm:max-h-56 sm:overflow-y-auto">
                  {(members ?? []).map((member) => {
                    const checked = field.value.includes(member.id)
                    return (
                      <label
                        key={member.id}
                        className="hover:bg-secondary flex cursor-pointer items-center gap-3 rounded-md p-2"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            field.onChange(
                              value
                                ? [...field.value, member.id]
                                : field.value.filter((id) => id !== member.id),
                            )
                          }
                        />
                        <span className="text-sm">{member.full_name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            />
          </Field>

          <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label htmlFor="isRecurring" className="cursor-pointer">
                Repetir toda semana
              </Label>
              <p className="text-muted-foreground text-xs">
                Só as atividades recorrentes são copiadas para a semana seguinte.
              </p>
            </div>
            <Controller
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <Switch id="isRecurring" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <Field label="Observações" htmlFor="notes">
            <Textarea id="notes" rows={2} {...form.register('notes')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              {activity ? 'Salvar alterações' : 'Criar atividade'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
