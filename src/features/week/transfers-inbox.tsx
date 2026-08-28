import * as React from 'react'
import { ArrowLeftRight, Check, X } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useCancelTransfer, useRespondTransfer, useTransferRequests } from '@/features/care/use-care'
import { formatDate } from '@/lib/date'
import { transferStatusLabel } from '@/lib/labels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Ate o aceite, a responsabilidade continua com quem pediu - a interface diz
 * isso com todas as letras.
 */
export function TransfersInbox() {
  const { profile } = useSession()
  const { data: transfers } = useTransferRequests(profile?.id)
  const respond = useRespondTransfer()
  const cancel = useCancelTransfer()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const pending = (transfers ?? []).filter((transfer) => transfer.status === 'pending')
  const recent = (transfers ?? [])
    .filter((transfer) => transfer.status !== 'pending')
    .slice(0, 3)

  // Depois de entregue o cuidado, quem pediu deixa de enxergar a atribuicao.
  const nomeDaPessoa = (transfer: (typeof pending)[number]) =>
    transfer.assignment?.cared_for.full_name ?? 'a pessoa cuidada'

  if (pending.length === 0 && recent.length === 0) return null

  const handleRespond = async (requestId: string, accept: boolean) => {
    setBusyId(requestId)
    try {
      await respond.mutateAsync({ requestId, accept })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section aria-labelledby="transferencias" className="space-y-3">
      <h2 id="transferencias" className="font-display text-lg font-semibold">
        Transferências
      </h2>

      {pending.map((transfer) => {
        const incoming = transfer.recipient_id === profile?.id
        return (
          <Card key={transfer.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className="bg-primary-soft text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <ArrowLeftRight className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm">
                    {incoming ? (
                      <>
                        <strong>{transfer.requester.full_name}</strong> pediu que você assuma o cuidado
                        de <strong>{nomeDaPessoa(transfer)}</strong>.
                      </>
                    ) : (
                      <>
                        Você pediu que <strong>{transfer.recipient.full_name}</strong> assuma o cuidado
                        de <strong>{nomeDaPessoa(transfer)}</strong>.
                      </>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">“{transfer.reason}”</p>
                  <p className="text-muted-foreground text-xs">
                    Pedido em {formatDate(transfer.created_at)} ·{' '}
                    {incoming
                      ? 'O cuidado só passa para você após o aceite.'
                      : 'O cuidado continua com você até o aceite.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {incoming ? (
                  <>
                    <Button
                      size="sm"
                      loading={busyId === transfer.id && respond.isPending}
                      onClick={() => handleRespond(transfer.id, true)}
                    >
                      <Check aria-hidden />
                      Aceitar cuidado
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === transfer.id}
                      onClick={() => handleRespond(transfer.id, false)}
                    >
                      <X aria-hidden />
                      Recusar
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={cancel.isPending}
                    onClick={() => cancel.mutate(transfer.id)}
                  >
                    Cancelar pedido
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {recent.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-muted-foreground text-xs font-semibold uppercase">Respondidas</p>
            {recent.map((transfer) => (
              <div key={transfer.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={transfer.status === 'accepted' ? 'success' : 'neutral'}>
                  {transferStatusLabel[transfer.status]}
                </Badge>
                <span className="text-muted-foreground">
                  {nomeDaPessoa(transfer)} · {formatDate(transfer.responded_at ?? transfer.created_at)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
