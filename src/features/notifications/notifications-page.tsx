import * as React from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useMarkNotificationsRead, useNotifications } from './use-notifications'
import { formatDateTime } from '@/lib/date'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

export function NotificationsPage() {
  const notifications = useNotifications()
  const markRead = useMarkNotificationsRead()

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
          unread.length > 0 ? (
            <Button
              variant="outline"
              onClick={() => markRead.mutate(unread.map((item) => item.id))}
              loading={markRead.isPending}
            >
              <CheckCheck aria-hidden />
              Marcar todas como lidas
            </Button>
          ) : undefined
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
    </div>
  )
}
