import * as React from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellRing, CheckCheck, Settings, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  useDeleteNotifications,
  useMarkNotificationsRead,
  useNotifications,
} from './use-notifications'
import { formatDateTime } from '@/lib/date'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function NotificationsPage() {
  const notifications = useNotifications()
  const markRead = useMarkNotificationsRead()
  const apagar = useDeleteNotifications()
  const [confirmarLimpeza, setConfirmarLimpeza] = React.useState(false)

  const todos = notifications.data ?? []

  const unread = (notifications.data ?? []).filter((item) => !item.read_at)

  // Ao abrir a central, o que ja foi lido deixa de aparecer como novidade.
  React.useEffect(() => {
    if (unread.length > 0) {
      const timer = setTimeout(() => markRead.mutate(unread.map((item) => item.id)), 1200)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.data])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notificações"
        description="Avisos sobre a sua semana, atividades e transferências."
        actions={
          <div className="flex flex-wrap gap-2">
            {todos.length > 0 && (
              <>
                {/* O interruptor dos avisos saiu daqui: esta tela é para ler o
                    que chegou. Com a caixa vazia o atalho já aparece no meio
                    dela - dois botões para a mesma coisa seriam ruído. */}
                <Button asChild variant="outline">
                  <Link to="/configuracoes?aba=avisos">
                    <Settings aria-hidden />
                    Avisos
                  </Link>
                </Button>
                {unread.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => markRead.mutate(unread.map((item) => item.id))}
                    loading={markRead.isPending}
                  >
                    <CheckCheck aria-hidden />
                    Marcar todas como lidas
                  </Button>
                )}
                <Button variant="outline" onClick={() => setConfirmarLimpeza(true)}>
                  <Trash2 aria-hidden />
                  Limpar tudo
                </Button>
              </>
            )}
          </div>
        }
      />

      {notifications.isLoading && <CardListSkeleton rows={4} />}
      {notifications.isError && (
        <ErrorState error={notifications.error} onRetry={() => notifications.refetch()} />
      )}

      {notifications.isSuccess && (notifications.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Bell}
              title="Nenhuma notificação por aqui"
              description="Você será avisado quando a semana for publicada ou alguém precisar de você."
              action={
                <Button asChild variant="outline">
                  <Link to="/configuracoes?aba=avisos">
                    <BellRing aria-hidden />
                    Configurar avisos
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      <ul className="space-y-2">
        {(notifications.data ?? []).map((notification) => {
          const body = (
            <Card
              className={cn(
                'p-4 transition-colors',
                !notification.read_at && 'border-primary/30 bg-primary-soft/30',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    notification.read_at ? 'bg-border' : 'bg-primary',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-pretty">{notification.title}</p>
                  {notification.body && (
                    <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
                      {notification.body}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    {formatDateTime(notification.created_at)}
                  </p>
                </div>

                {/* Apagar um aviso é um gesto pequeno e sem volta: fica fora
                    do link, para não disparar junto com a navegação. */}
                <button
                  type="button"
                  aria-label={`Apagar aviso "${notification.title}"`}
                  onClick={(evento) => {
                    evento.preventDefault()
                    evento.stopPropagation()
                    apagar.mutate([notification.id])
                  }}
                  className="text-muted-foreground hover:bg-secondary hover:text-foreground -m-1 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </Card>
          )

          return (
            <li key={notification.id}>
              {notification.link ? (
                <Link to={notification.link} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          )
        })}
      </ul>

      <AlertDialog open={confirmarLimpeza} onOpenChange={setConfirmarLimpeza}>
        <AlertDialogContent>
          <AlertDialogTitle>Limpar todos os avisos?</AlertDialogTitle>
          <AlertDialogDescription>
            Os {todos.length} avisos desta lista serão apagados. Isso não desfaz nada do que
            aconteceu — os cuidados, as atividades e as transferências continuam onde estão.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                apagar.mutate(
                  todos.map((item) => item.id),
                  { onSuccess: () => toast.success('Avisos apagados.') },
                )
              }}
            >
              Apagar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
