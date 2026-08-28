import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { AuthLayout } from './auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const schema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null)
    try {
      await signIn(values.email.trim().toLowerCase(), values.password)
    } catch (error) {
      setServerError(friendlyError(error))
      return
    }
    navigate('/', { replace: true })
  })

  return (
    <AuthLayout
      title="Entrar"
      description="Use o e-mail cadastrado pela liderança do GC."
      footer={
        <p className="text-muted-foreground">
          Ainda não tem acesso? Peça um convite a um líder do seu GC.
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && (
          <Alert variant="danger">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@exemplo.com"
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register('email')}
          />
        </Field>

        <Field
          label="Senha"
          htmlFor="password"
          error={form.formState.errors.password?.message}
          required
        >
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-11"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Entrar
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="text-primary text-sm hover:underline"
          >
            Esqueci minha senha
          </button>
        </div>
      </form>

      <ForgotPasswordDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </AuthLayout>
  )
}

/**
 * Nao existe recuperacao automatica de senha: o sistema nao envia e-mail. A
 * troca passa pela lideranca, que ja conhece cada integrante pessoalmente -
 * e essa conversa vale mais do que um link automatico.
 */
function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recuperar senha</DialogTitle>
          <DialogDescription>A redefinição é feita pela liderança do GC.</DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground text-sm leading-relaxed">
          Fale com o administrador do sistema. Ele cadastra uma senha nova para você e a entrega
          pessoalmente; depois de entrar, você mesmo troca em <strong>Perfil</strong>.
        </p>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
