import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Ban, Bell, History, Plus, Trash2 } from 'lucide-react'
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
import { PushCard } from '@/features/notifications/push-card'
import { MeusDados } from './meus-dados'
import { PageHeader } from '@/components/common/page-header'
import { Versao } from '@/components/common/versao'
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

/**
 * Configurações: tudo o que se altera.
 *
 * A tela junta duas coisas que antes moravam longe uma da outra — os dados da
 * própria pessoa (que ficavam num "Meus dados" solto) e os avisos (que só
 * apareciam quem entrasse no sininho, junto com a lista de notificações, como
 * se ligar o aviso fosse ler o aviso). O que é do GC continua aqui, e continua
 * só para a liderança.
 */
export function SettingsPage() {
  const { group, isLeader, refresh } = useSession()
  const [params, setParams] = useSearchParams()

  // A aba vive na URL: assim o "Editar meus dados" do perfil chega direto no
  // lugar certo, e voltar pelo navegador não perde a aba aberta.
  const aba = params.get('aba') ?? 'dados'
  const trocarAba = (valor: string) => {
    const proximo = new URLSearchParams(params)
    proximo.set('aba', valor)
    setParams(proximo, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configurações"
        description={
          isLeader ? 'Seus dados, seus avisos e o que rege o GC.' : 'Seus dados e seus avisos.'
        }
      />

      <Tabs value={aba} onValueChange={trocarAba}>
        {/* `min-w-0` deixa a lista encolher e rolar sozinha no celular, em vez
            de esticar a página inteira. */}
        <TabsList className="w-full min-w-0 scrollbar-thin justify-start overflow-x-auto">
          <TabsTrigger value="dados">Meus dados</TabsTrigger>
          <TabsTrigger value="avisos">Avisos</TabsTrigger>
          {isLeader && <TabsTrigger value="gc">O GC</TabsTrigger>}
          {isLeader && <TabsTrigger value="rodizio">Rodízio</TabsTrigger>}
          {isLeader && <TabsTrigger value="historico">Histórico</TabsTrigger>}
        </TabsList>

        <TabsContent value="dados">
          <MeusDados />
        </TabsContent>

        <TabsContent value="avisos">
          <AvisosCard />
        </TabsContent>

        {isLeader && (
          <TabsContent value="gc">
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
        )}

        {isLeader && (
          <TabsContent value="rodizio">
            <RestrictionsCard />
          </TabsContent>
        )}

        {isLeader && (
          <TabsContent value="historico">
            <AuditCard />
          </TabsContent>
        )}
      </Tabs>

      {/* No pé da tela, onde não atrapalha - mas sempre no mesmo lugar, que é
          o que importa quando alguém precisa conferir se está vendo a versão
          nova ou o cache de ontem. */}
      <Card>
        <CardContent className="p-4">
          <Versao />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Avisos.
 *
 * O interruptor saiu do sininho. Lá ele dividia espaço com a lista de
 * notificações, e "ligar o aviso" ficava parecendo mais um aviso — quem só
 * queria ler o que chegou tropeçava numa configuração, e quem queria a
 * configuração não pensava em procurá-la dentro da caixa de entrada.
 */
function AvisosCard() {
  return (
    <div className="max-w-xl space-y-4">
      <PushCard />

      <Card>
        <CardHeader>
          <CardTitle>O que o app avisa</CardTitle>
          <CardDescription>
            Semana publicada, alguém indicado para uma atividade, transferência de cuidado e
            resposta da supervisão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm text-pretty">
            O aviso fora do app nunca mostra nomes — o conteúdo fica dentro, atrás da sua senha.
            Quem lê a tela de bloqueio de outra pessoa não descobre de quem o GC está cuidando.
          </p>
          <Button asChild variant="outline">
            <Link to="/notificacoes">
              <Bell aria-hidden />
              Ver os avisos que chegaram
            </Link>
          </Button>
        </CardContent>
      </Card>
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
