import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { AuthLayout } from './auth-layout'
import { PasswordChecklist } from './password-fields'
import { isStrongEnough } from './password-rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'

const schema = z
  .object({
    password: z
      .string()
      .refine(isStrongEnough, 'A senha não atende aos requisitos.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'As senhas não conferem.',
    path: ['confirm'],
  })

/** Chegada pelo link de recuperacao: o Supabase ja criou a sessao na URL. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setServerError('Este link expirou ou já foi usado. Peça um novo link de recuperação.')
      }
      setReady(true)
    })
  }, [])

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  const password = useWatch({ control: form.control, name: 'password' })

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      setServerError(friendlyError(error))
      return
    }
    toast.success('Senha atualizada.')
    navigate('/', { replace: true })
  })

  return (
    <AuthLayout title="Criar nova senha" description="Escolha uma senha que você lembre com facilidade.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && (
          <Alert variant="danger">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Field label="Nova senha" htmlFor="password" error={form.formState.errors.password?.message} required>
          <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>

        <PasswordChecklist value={password} />

        <Field label="Repita a senha" htmlFor="confirm" error={form.formState.errors.confirm?.message} required>
          <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
        </Field>

        <Button type="submit" className="w-full" loading={form.formState.isSubmitting} disabled={!ready}>
          Salvar senha
        </Button>
      </form>
    </AuthLayout>
  )
}
