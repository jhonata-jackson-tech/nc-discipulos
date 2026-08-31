import * as React from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { changePassword } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { PasswordChecklist } from '@/features/auth/password-fields'
import { isStrongEnough } from '@/features/auth/password-rules'
import { useSession } from '@/features/auth/session-context'
import { useUpdateMember } from '@/features/members/use-members'
import { careGenderLabel, roleLabelFor } from '@/lib/labels'
import { FotoPerfil } from './foto-perfil'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Field } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

const schema = z.object({
  full_name: z.string().trim().min(2, 'Informe seu nome.'),
  display_name: z.string().trim().max(40, 'Nome muito longo.').optional(),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
})

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Informe a senha atual.'),
    password: z.string().refine(isStrongEnough, 'A senha não atende aos requisitos.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'As senhas não conferem.',
    path: ['confirm'],
  })

/**
 * Onde a pessoa altera os próprios dados.
 *
 * Mora em Configurações, e não no Perfil: o perfil é para conferir de relance
 * — o telefone que está cadastrado, quando é o aniversário — e quem entra para
 * olhar não deveria cair dentro de um formulário editável por acidente.
 */
export function MeusDados() {
  const { profile, role } = useSession()
  const update = useUpdateMember()

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', display_name: '', phone: '', birth_date: '' },
  })

  React.useEffect(() => {
    if (profile) {
      form.reset({
        full_name: profile.full_name,
        display_name: profile.display_name ?? '',
        phone: profile.phone ?? '',
        birth_date: profile.birth_date ?? '',
      })
    }
  }, [profile, form])

  const nascimento = useWatch({ control: form.control, name: 'birth_date' })

  const onSubmit = form.handleSubmit(async (values) => {
    if (!profile) return
    await update.mutateAsync({
      id: profile.id,
      full_name: values.full_name,
      display_name: values.display_name || null,
      phone: values.phone || null,
      birth_date: values.birth_date || null,
    })
  })

  return (
    <div className="space-y-4">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Dados pessoais</CardTitle>
          <CardDescription>
            {profile?.email} · {role ? roleLabelFor(role, profile?.care_gender ?? null) : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {profile && <FotoPerfil profile={profile} />}

            <Field
              label="Nome completo"
              htmlFor="full_name"
              required
              error={form.formState.errors.full_name?.message}
            >
              <Input id="full_name" {...form.register('full_name')} />
            </Field>

            <Field
              label="Como você quer ser chamado"
              htmlFor="display_name"
              hint="É esse nome que aparece nas telas e nos avisos. Vazio, usamos o primeiro nome."
              error={form.formState.errors.display_name?.message}
            >
              <Input
                id="display_name"
                placeholder={profile?.full_name.split(' ')[0]}
                {...form.register('display_name')}
              />
            </Field>

            <Field label="Telefone" htmlFor="phone">
              <Input id="phone" type="tel" inputMode="tel" {...form.register('phone')} />
            </Field>

            <Field label="Aniversário" htmlFor="birth_date">
              <DateInput id="birth_date" value={nascimento} {...form.register('birth_date')} />
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

      <PasswordCard />
    </div>
  )
}

/**
 * Trocar a propria senha e o unico caminho automatico que existe: nao ha
 * recuperacao por e-mail. Quem perdeu a senha fala com a lideranca, que
 * cadastra uma nova - e a pessoa troca aqui depois de entrar.
 */
function PasswordCard() {
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  })
  const [serverError, setServerError] = React.useState<string | null>(null)
  const nova = useWatch({ control: form.control, name: 'password' })

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await changePassword(values.current, values.password)
    } catch (error) {
      setServerError(friendlyError(error))
      return
    }
    form.reset({ current: '', password: '', confirm: '' })
    toast.success('Senha atualizada.')
  })

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Trocar senha</CardTitle>
        <CardDescription>
          Ao salvar, as sessões abertas em outros aparelhos são encerradas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {serverError && (
            <Alert variant="danger">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <Field
            label="Senha atual"
            htmlFor="current"
            required
            error={form.formState.errors.current?.message}
          >
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              {...form.register('current')}
            />
          </Field>

          <Field
            label="Nova senha"
            htmlFor="new-password"
            required
            error={form.formState.errors.password?.message}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
            />
          </Field>

          <PasswordChecklist value={nova} />

          <Field
            label="Repita a nova senha"
            htmlFor="confirm"
            required
            error={form.formState.errors.confirm?.message}
          >
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              {...form.register('confirm')}
            />
          </Field>

          <Button type="submit" loading={form.formState.isSubmitting}>
            <KeyRound aria-hidden />
            Salvar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
