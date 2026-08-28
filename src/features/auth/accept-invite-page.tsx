import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { signUp } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { AuthLayout } from './auth-layout'
import { PasswordChecklist } from './password-fields'
import { isStrongEnough } from './password-rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ShieldCheck } from 'lucide-react'

const schema = z
  .object({
    email: z.email('Informe o e-mail que recebeu o convite.'),
    password: z.string().refine(isStrongEnough, 'A senha não atende aos requisitos.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'As senhas não conferem.',
    path: ['confirm'],
  })

/**
 * Primeiro acesso. O integrante ja existe no GC; o convite apenas liga a conta
 * ao cadastro. Sem token valido, o banco recusa a criacao do usuario.
 */
export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: params.get('email') ?? '', password: '', confirm: '' },
  })

  const password = useWatch({ control: form.control, name: 'password' })

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await signUp({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        inviteToken: token,
      })
    } catch (error) {
      setServerError(friendlyError(error))
      return
    }

    toast.success('Bem-vindo! Seu acesso está pronto.')
    navigate('/', { replace: true })
  })

  if (!token) {
    return (
      <AuthLayout
        title="Convite não encontrado"
        description="Abra o link completo que a liderança enviou."
      >
        <Alert variant="warning">
          <AlertTitle>Falta o código do convite</AlertTitle>
          <AlertDescription>
            O endereço precisa incluir o código enviado pela liderança. Peça o link novamente.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link to="/entrar">Ir para o login</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar seu acesso"
      description="Você foi convidado pela liderança do GC. Defina sua senha para começar."
      footer={
        <Link to="/entrar" className="text-primary hover:underline">
          Já tenho acesso
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert variant="info">
          <ShieldCheck aria-hidden />
          <AlertDescription>
            Use exatamente o e-mail que recebeu o convite. O cadastro é restrito aos integrantes do
            GC.
          </AlertDescription>
        </Alert>

        {serverError && (
          <Alert variant="danger">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Field
          label="E-mail do convite"
          htmlFor="email"
          error={form.formState.errors.email?.message}
          required
        >
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>

        <Field
          label="Crie uma senha"
          htmlFor="password"
          error={form.formState.errors.password?.message}
          required
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
        </Field>

        <PasswordChecklist value={password} />

        <Field
          label="Repita a senha"
          htmlFor="confirm"
          error={form.formState.errors.confirm?.message}
          required
        >
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            {...form.register('confirm')}
          />
        </Field>

        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Criar acesso
        </Button>
      </form>
    </AuthLayout>
  )
}
