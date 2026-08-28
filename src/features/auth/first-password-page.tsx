import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { KeyRound } from 'lucide-react'
import { definirPrimeiraSenha } from '@/lib/auth'
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
    password: z.string().refine(isStrongEnough, 'A senha não atende aos requisitos.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'As senhas não conferem.',
    path: ['confirm'],
  })

/**
 * Primeiro acesso de quem recebeu a senha da liderança.
 *
 * Até aqui a pessoa não tem sessão: o login devolveu apenas o direito de
 * definir a senha. Nada do GC é acessível antes desta tela - é o que mantém a
 * senha entregue de mão em mão sendo uma porta de entrada, e não uma chave.
 */
export function FirstPasswordPage({
  changeToken,
  email,
}: {
  changeToken: string
  email: string
}) {
  const navigate = useNavigate()
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  const password = useWatch({ control: form.control, name: 'password' })

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await definirPrimeiraSenha(changeToken, values.password)
    } catch (error) {
      setServerError(friendlyError(error))
      return
    }
    toast.success('Senha criada. Bem-vindo!')
    navigate('/', { replace: true })
  })

  return (
    <AuthLayout
      title="Crie sua senha"
      description={`Este é o seu primeiro acesso com ${email}. Escolha uma senha que só você saiba.`}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert variant="info">
          <KeyRound aria-hidden />
          <AlertDescription>
            A senha que a liderança te passou vale só para esta vez. A partir de agora, vale a que
            você criar aqui.
          </AlertDescription>
        </Alert>

        {serverError && (
          <Alert variant="danger">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Field
          label="Sua senha"
          htmlFor="password"
          required
          error={form.formState.errors.password?.message}
        >
          <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>

        <PasswordChecklist value={password} />

        <Field
          label="Repita a senha"
          htmlFor="confirm"
          required
          error={form.formState.errors.confirm?.message}
        >
          <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
        </Field>

        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Criar senha e entrar
        </Button>
      </form>
    </AuthLayout>
  )
}
