import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldCheck } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useUpdateMember } from '@/features/members/use-members'
import { careGenderLabel, roleLabelFor } from '@/lib/labels'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

const schema = z.object({
  full_name: z.string().trim().min(2, 'Informe seu nome.'),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
})

export function ProfilePage() {
  const { profile, role } = useSession()
  const update = useUpdateMember()

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', phone: '', birth_date: '' },
  })

  React.useEffect(() => {
    if (profile) {
      form.reset({
        full_name: profile.full_name,
        phone: profile.phone ?? '',
        birth_date: profile.birth_date ?? '',
      })
    }
  }, [profile, form])

  const onSubmit = form.handleSubmit(async (values) => {
    if (!profile) return
    await update.mutateAsync({
      id: profile.id,
      full_name: values.full_name,
      phone: values.phone || null,
      birth_date: values.birth_date || null,
    })
  })

  return (
    <div className="space-y-5">
      <PageHeader title="Meus dados" description="Mantenha seu contato e aniversário atualizados." />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Dados pessoais</CardTitle>
          <CardDescription>
            {profile?.email} ·{' '}
            {role ? roleLabelFor(role, profile?.care_gender ?? null) : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field
              label="Nome completo"
              htmlFor="full_name"
              required
              error={form.formState.errors.full_name?.message}
            >
              <Input id="full_name" {...form.register('full_name')} />
            </Field>

            <Field label="Telefone" htmlFor="phone">
              <Input id="phone" type="tel" inputMode="tel" {...form.register('phone')} />
            </Field>

            <Field label="Aniversário" htmlFor="birth_date">
              <Input id="birth_date" type="date" {...form.register('birth_date')} />
            </Field>

            <Alert variant="info">
              <ShieldCheck aria-hidden />
              <AlertDescription>
                Papel, situação e gênero de cuidado só podem ser alterados pela liderança.
                {profile?.care_gender && (
                  <>
                    {' '}
                    O seu está confirmado como{' '}
                    <Badge variant="neutral">{careGenderLabel[profile.care_gender]}</Badge>.
                  </>
                )}
              </AlertDescription>
            </Alert>

            <Button type="submit" loading={update.isPending}>
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
