import * as React from 'react'
import { Check, Copy, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import type { Profile } from '@/types/database'
import { useCreateInvite } from './use-members'
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

/**
 * O convite gera um link com um codigo de uso unico. O codigo em claro aparece
 * apenas aqui; o banco guarda somente o hash.
 */
export function InviteDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* O corpo so monta com o dialogo aberto: o estado sempre nasce limpo. */}
        {open && member && <InviteBody member={member} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function InviteBody({ member, onClose }: { member: Profile; onClose: () => void }) {
  const createInvite = useCreateInvite()
  const [email, setEmail] = React.useState(member.email ?? '')
  const [link, setLink] = React.useState<string | null>(null)
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleCreate = async () => {
    setError(null)
    try {
      const invite = await createInvite.mutateAsync({ profileId: member.id, email })
      const url = new URL('/convite', window.location.origin)
      url.searchParams.set('token', invite.token)
      url.searchParams.set('email', email.trim().toLowerCase())
      setLink(url.toString())
      setExpiresAt(invite.expires_at)
    } catch (cause) {
      setError(friendlyError(cause))
    }
  }

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    toast.success('Link copiado.')
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Convidar {member.full_name}</DialogTitle>
          <DialogDescription>
            Envie o link por WhatsApp ou e-mail. Só quem tem o link consegue criar acesso.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="danger">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!link ? (
          <div className="space-y-4">
            <Field label="E-mail que a pessoa vai usar" htmlFor="invite-email" required>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="pessoa@exemplo.com"
              />
            </Field>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} loading={createInvite.isPending} disabled={!email}>
                <Mail aria-hidden />
                Gerar convite
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert variant="success">
              <AlertDescription>
                Convite criado. Copie o link agora — ele não será mostrado novamente.
                {expiresAt && ` Vale até ${formatDate(expiresAt)}.`}
              </AlertDescription>
            </Alert>

            <div className="bg-secondary rounded-lg p-3">
              <p className="text-muted-foreground font-mono text-xs break-all">{link}</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
              <Button onClick={copy}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? 'Copiado' : 'Copiar link'}
              </Button>
            </DialogFooter>
          </div>
        )}
    </>
  )
}
