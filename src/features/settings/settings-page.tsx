import * as React from 'react'
import { Ban, History, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from '@/features/auth/session-context'
import {
  useActiveMembers,
  usePairingRestrictions,
  useRemovePairingRestriction,
  useSavePairingRestriction,
} from '@/features/members/use-members'
import { useAuditLogs } from '@/features/distribution/use-distribution'
import { db } from '@/lib/db'
import { formatDateTime } from '@/lib/date'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function SettingsPage() {
  const { group, refresh } = useSession()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configurações do GC"
        description="Dados do grupo, restrições de rodízio e histórico de alterações."
      />

      <Tabs defaultValue="grupo">
        <TabsList>
          <TabsTrigger value="grupo">Grupo</TabsTrigger>
          <TabsTrigger value="restricoes">Restrições</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="grupo">
          {/* A chave garante que o formulario nasca ja com os dados do GC. */}
          {group && (
            <GroupForm
              key={group.id}
              groupId={group.id}
              name={group.name}
              description={group.description ?? ''}
              onSaved={refresh}
            />
          )}
        </TabsContent>

        <TabsContent value="restricoes">
          <RestrictionsCard />
        </TabsContent>

        <TabsContent value="auditoria">
          <AuditCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function GroupForm({
  groupId,
  name,
  description,
  onSaved,
}: {
  groupId: string
  name: string
  description: string
  onSaved: () => void
}) {
  const [values, setValues] = React.useState({ name, description })
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    const { error } = await db
      .from('groups')
      .update({ name: values.name, description: values.description })
      .eq('id', groupId)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Dados do GC atualizados.')
    onSaved()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do grupo</CardTitle>
        <CardDescription>Aparecem nos avisos e no cabeçalho do sistema.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Nome do GC" htmlFor="group-name" required>
          <Input
            id="group-name"
            value={values.name}
            onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
          />
        </Field>

        <Field label="Descrição" htmlFor="group-description">
          <Input
            id="group-description"
            value={values.description}
            onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
          />
        </Field>

        <div className="text-muted-foreground text-sm">
          Fuso horário: <strong className="text-foreground">America/Sao_Paulo</strong> · A semana de
          cuidado começa na segunda-feira.
        </div>

        <Button onClick={save} loading={saving} disabled={!values.name.trim()}>
          Salvar
        </Button>
      </CardContent>
    </Card>
  )
}

function RestrictionsCard() {
  const { group } = useSession()
  const { data: members } = useActiveMembers()
  const restrictions = usePairingRestrictions()
  const save = useSavePairingRestriction()
  const remove = useRemovePairingRestriction()

  const [a, setA] = React.useState('')
  const [b, setB] = React.useState('')
  const [reason, setReason] = React.useState('')

  const nameOf = (id: string) => members?.find((member) => member.id === id)?.full_name ?? '—'

  const handleSave = async () => {
    if (!group || !a || !b || a === b) return
    await save.mutateAsync({ groupId: group.id, a, b, reason })
    setA('')
    setB('')
    setReason('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restrições de rodízio</CardTitle>
        <CardDescription>
          Duplas que a liderança prefere não combinar. O motivo fica visível apenas aos líderes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={a} onValueChange={setA}>
            <SelectTrigger aria-label="Primeira pessoa">
              <SelectValue placeholder="Pessoa" />
            </SelectTrigger>
            <SelectContent>
              {(members ?? []).map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={b} onValueChange={setB}>
            <SelectTrigger aria-label="Segunda pessoa">
              <SelectValue placeholder="Não combinar com" />
            </SelectTrigger>
            <SelectContent>
              {(members ?? [])
                .filter((member) => member.id !== a)
                .map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo (opcional)"
            aria-label="Motivo da restrição"
          />

          <Button onClick={handleSave} disabled={!a || !b || a === b} loading={save.isPending}>
            <Plus aria-hidden />
            Adicionar
          </Button>
        </div>

        {(restrictions.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Ban}
            title="Nenhuma restrição cadastrada"
            description="Use com parcimônia: cada restrição reduz as combinações possíveis do rodízio."
          />
        ) : (
          <ul className="divide-border divide-y">
            {(restrictions.data ?? []).map((restriction) => (
              <li key={restriction.id} className="flex flex-wrap items-center gap-2 py-3">
                <span className="min-w-0 flex-1 text-sm">
                  <strong>{nameOf(restriction.profile_a)}</strong> e{' '}
                  <strong>{nameOf(restriction.profile_b)}</strong>
                </span>
                {restriction.reason && <Badge variant="neutral">{restriction.reason}</Badge>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  aria-label="Remover restrição"
                  onClick={() => remove.mutate(restriction.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AuditCard() {
  const logs = useAuditLogs()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de alterações</CardTitle>
        <CardDescription>
          Mudanças de papel, geração e publicação de semanas, transferências e reorganizações.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-4">
        {(logs.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={History}
            title="Nada registrado ainda"
            description="As ações sensíveis passam a aparecer aqui assim que acontecerem."
          />
        ) : (
          <ul className="divide-border divide-y">
            {(logs.data ?? []).map((log) => (
              <li key={log.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{log.action}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {log.actor?.full_name ?? 'Sistema'} · {formatDateTime(log.created_at)}
                  </span>
                </div>
                {log.reason && <p className="mt-1 text-sm">“{log.reason}”</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
