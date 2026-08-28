import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { careGenderLabel, roleLabel } from '@/lib/labels'
import type { AppRole, CareGender, Profile } from '@/types/database'
import { useCreateMember, useUpdateMember } from './use-members'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

const ROLES: AppRole[] = ['leader', 'disciple', 'member', 'supervisor']

const schema = z.object({
  full_name: z.string().trim().min(2, 'Informe o nome.'),
  email: z.union([z.email('E-mail inválido.'), z.literal('')]),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
  role: z.enum(['leader', 'disciple', 'member', 'supervisor']),
  care_gender: z.union([z.enum(['male', 'female']), z.literal('')]),
})

type FormValues = z.infer<typeof schema>

export function MemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateMember()
  const update = useUpdateMember()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      birth_date: '',
      role: 'member',
      care_gender: '',
    },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      full_name: member?.full_name ?? '',
      email: member?.email ?? '',
      phone: member?.phone ?? '',
      birth_date: member?.birth_date ?? '',
      role: member?.role ?? 'member',
      care_gender: member?.care_gender ?? '',
    })
  }, [open, member, form])

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      full_name: values.full_name,
      email: values.email || null,
      phone: values.phone || null,
      birth_date: values.birth_date || null,
      role: values.role,
      care_gender: (values.care_gender || null) as CareGender | null,
    }

    if (member) {
      await update.mutateAsync({
        id: member.id,
        ...payload,
        salutation: payload.care_gender
          ? payload.care_gender === 'male'
            ? 'irmao'
            : 'irma'
          : null,
      })
    } else {
      await create.mutateAsync(payload)
    }
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member ? 'Editar integrante' : 'Novo integrante'}</DialogTitle>
          <DialogDescription>
            O gênero de cuidado precisa ser confirmado pela liderança antes da distribuição.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            label="Nome completo"
            htmlFor="full_name"
            required
            error={form.formState.errors.full_name?.message}
          >
            <Input id="full_name" {...form.register('full_name')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message}>
              <Input id="email" type="email" {...form.register('email')} />
            </Field>

            <Field label="Telefone" htmlFor="phone">
              <Input id="phone" type="tel" inputMode="tel" {...form.register('phone')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Aniversário" htmlFor="birth_date">
              <Input id="birth_date" type="date" {...form.register('birth_date')} />
            </Field>

            <Field label="Papel" required>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Papel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabel[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Field
            label="Gênero de cuidado"
            hint="Homem cuida de homem e mulher cuida de mulher. Confirme com a pessoa antes de marcar."
          >
            <Controller
              control={form.control}
              name="care_gender"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {(['male', 'female'] as CareGender[]).map((gender) => (
                    <label
                      key={gender}
                      className="border-input hover:bg-secondary flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                    >
                      <RadioGroupItem value={gender} id={`gender-${gender}`} />
                      <Label htmlFor={`gender-${gender}`} className="cursor-pointer">
                        {careGenderLabel[gender]}
                      </Label>
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {member ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
