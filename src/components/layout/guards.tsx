import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Lock, MailQuestion } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useMembers } from '@/features/members/use-members'
import { needsSetup } from '@/features/setup/needs-setup'
import { Marca } from '@/components/common/marca'
import type { AppRole } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Carregando">
      <span className="bg-primary text-primary-foreground flex size-12 animate-pulse items-center justify-center rounded-xl">
        <Marca className="size-6" />
      </span>
    </div>
  )
}

/** Exige sessao valida e integrante vinculado. */
export function RequireAuth() {
  const { session, profile, loading, orphanAccount, signOut } = useSession()
  const location = useLocation()

  if (loading) return <FullPageLoader />

  if (!session) {
    return <Navigate to="/entrar" state={{ from: location.pathname }} replace />
  }

  if (orphanAccount) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-5">
        <Card className="max-w-md">
          <CardContent className="p-0">
            <EmptyState
              icon={MailQuestion}
              title="Sua conta ainda não está vinculada"
              description="Sua conta existe, mas não encontramos seu cadastro no GC. Peça a um líder para conferir o convite."
              action={
                <Button variant="outline" onClick={signOut}>
                  Sair
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!profile) return <FullPageLoader />

  return <Outlet />
}

/** Restringe uma rota a determinados papeis. A RLS repete a checagem no banco. */
export function RequireRole({ roles }: { roles: AppRole[] }) {
  const { role } = useSession()

  if (!role) return <FullPageLoader />

  if (!roles.includes(role)) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Lock}
            title="Esta área não é para o seu perfil"
            description="Se você acredita que deveria ter acesso, fale com a liderança do GC."
            action={
              <Button asChild variant="outline">
                <a href="/">Voltar para minha semana</a>
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  return <Outlet />
}

/**
 * A primeira distribuicao so acontece depois que a lideranca confirma o genero
 * de cuidado de todos - por isso o assistente aparece antes de tudo.
 */
export function RequireSetup() {
  const { group, isLeader } = useSession()
  const members = useMembers()
  const location = useLocation()

  if (!isLeader || members.isLoading) return <Outlet />

  if (needsSetup(group, members.data) && location.pathname !== '/primeiros-passos') {
    return <Navigate to="/primeiros-passos" replace />
  }

  return <Outlet />
}
