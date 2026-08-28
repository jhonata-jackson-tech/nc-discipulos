import * as React from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { AuthLayout } from './auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'

const schema = z.object({ email: z.email('Informe um e-mail válido.') })

export function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/definir-senha`,
    })
    if (error) {
      setServerError(friendlyError(error))
      return
    }
    setSent(true)
  })

  if (sent) {
    return (
      <AuthLayout
        title="Confira seu e-mail"
        description="Se este e-mail estiver cadastrado, enviamos um link para você criar uma nova senha."
      >
        <Alert variant="success">
          <MailCheck aria-hidden />
          <AlertDescription>
            O link vale por uma hora. Se não chegar, verifique a caixa de spam.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link to="/entrar">Voltar para o login</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      description="Enviaremos um link para você criar uma nova senha."
      footer={
        <Link to="/entrar" className="text-primary hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && (
          <Alert variant="danger">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>

        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Enviar link
        </Button>
      </form>
    </AuthLayout>
  )
}
