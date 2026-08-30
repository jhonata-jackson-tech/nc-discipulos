import * as React from 'react'
import {
  CalendarPlus,
  DoorOpen,
  MessageCirclePlus,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  UserMinus,
} from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useDeleteVisitor, useReopenVisitor, useVisitors, type Visitante } from './use-visitors'
import { VisitorDialog } from './visitor-dialog'
import { VisitorContactDialog } from './visitor-contact-dialog'
import { VisitorOutcomeDialog, type Desfecho } from './visitor-outcome-dialog'
import { daysUntil, formatDate } from '@/lib/date'
import { gcIntentLabel, visitorOriginLabel, visitorStatusLabel } from '@/lib/labels'
import type { VisitorStatus } from '@/types/database'
import { PageHeader } from '@/components/common/page-header'
import { Person } from '@/components/common/person'
import { StatTile } from '@/components/common/stat-tile'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Silêncio a partir daqui já merece um toque. */
const DIAS_DE_SILENCIO = 7

/**
 * Os visitantes do GC.
 *
 * A tela responde uma pergunta e organiza tudo em volta dela: com quem a gente
 * ainda não falou? Por isso os dias em silêncio ficam ao lado do nome, e a
 * lista abre em "Acompanhando" — quem já entrou no GC ou já foi encerrado não
 * espera nada de ninguém, e ocupar a primeira tela com eles empurraria para
 * baixo justamente quem está esperando.
 */
export function VisitorsPage() {
  const { isLeader } = useSession()
  const visitantes = useVisitors()

  const [busca, setBusca] = React.useState('')
  const [aba, setAba] = React.useState<VisitorStatus>('acompanhando')
  const [editando, setEditando] = React.useState<Visitante | null>(null)
  const [editarAberto, setEditarAberto] = React.useState(false)
  const [conversando, setConversando] = React.useState<Visitante | null>(null)
  const [conversaAberta, setConversaAberta] = React.useState(false)
  const [desfecho, setDesfecho] = React.useState<Desfecho>('promover')
  const [decidindo, setDecidindo] = React.useState<Visitante | null>(null)
  const [desfechoAberto, setDesfechoAberto] = React.useState(false)

  const reabrir = useReopenVisitor()
  const apagar = useDeleteVisitor()

  // `?? []` cria um array novo a cada render; sem estabilizá-lo, as duas
  // memoizações abaixo recalculariam sempre.
  const dados = visitantes.data
  const todos = React.useMemo(() => dados ?? [], [dados])

  const contagem = React.useMemo(
    () => ({
      acompanhando: todos.filter((v) => v.situacao === 'acompanhando').length,
      integrado: todos.filter((v) => v.situacao === 'integrado').length,
      encerrado: todos.filter((v) => v.situacao === 'encerrado').length,
      semContato: todos.filter((v) => v.situacao === 'acompanhando' && v.contatos === 0).length,
    }),
    [todos],
  )

  const lista = React.useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return todos
      .filter((v) => v.situacao === aba)
      .filter((v) => !termo || v.nome.toLowerCase().includes(termo))
      .sort((a, b) => {
        // Quem está em silêncio há mais tempo vem primeiro: é a ordem da
        // pergunta que a tela responde, não a ordem do cadastro.
        if (aba !== 'acompanhando') return b.primeiraVisita.localeCompare(a.primeiraVisita)
        const ultimoA = a.ultimoContato ?? a.primeiraVisita
        const ultimoB = b.ultimoContato ?? b.primeiraVisita
        return ultimoA.localeCompare(ultimoB)
      })
  }, [todos, busca, aba])

  const abrirEdicao = (visitante: Visitante | null) => {
    setEditando(visitante)
    setEditarAberto(true)
  }

  const abrirConversa = (visitante: Visitante) => {
    setConversando(visitante)
    setConversaAberta(true)
  }

  const abrirDesfecho = (visitante: Visitante, qual: Desfecho) => {
    setDecidindo(visitante)
    setDesfecho(qual)
    setDesfechoAberto(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Visitantes"
        description="Quem visitou o GC e ainda não faz parte dele. Quem acompanha é a liderança."
        actions={
          isLeader ? (
            <Button onClick={() => abrirEdicao(null)}>
              <Plus aria-hidden />
              Novo visitante
            </Button>
          ) : undefined
        }
      />

      {visitantes.isSuccess && todos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Acompanhando"
            value={contagem.acompanhando}
            icon={DoorOpen}
            hint="Esperando um contato da liderança"
          />
          <StatTile
            label="Ainda sem contato"
            value={contagem.semContato}
            icon={MessageCirclePlus}
            tone={contagem.semContato > 0 ? 'warning' : 'default'}
            hint="Visitaram e ninguém falou com eles"
          />
          <StatTile
            label="Entraram no GC"
            value={contagem.integrado}
            icon={UserCheck}
            tone="success"
          />
          <StatTile label="Encerrados" value={contagem.encerrado} icon={UserMinus} />
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={aba} onValueChange={(valor) => setAba(valor as VisitorStatus)}>
            <TabsList>
              <TabsTrigger value="acompanhando">Acompanhando</TabsTrigger>
              <TabsTrigger value="integrado">Entraram</TabsTrigger>
              <TabsTrigger value="encerrado">Encerrados</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative sm:w-64">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar por nome"
              aria-label="Buscar visitante"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {visitantes.isLoading && <CardListSkeleton rows={3} />}
      {visitantes.isError && (
        <ErrorState error={visitantes.error} onRetry={() => visitantes.refetch()} />
      )}

      {visitantes.isSuccess && lista.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={DoorOpen}
              title={
                aba === 'acompanhando'
                  ? 'Nenhum visitante em acompanhamento'
                  : `Ninguém em "${visitorStatusLabel[aba]}"`
              }
              description={
                aba === 'acompanhando'
                  ? 'Quando alguém visitar o GC — sozinho ou pelo GC Center — cadastre aqui para não perder o contato.'
                  : 'Esta lista guarda o histórico. Ela se preenche sozinha conforme os acompanhamentos terminam.'
              }
              action={
                isLeader && aba === 'acompanhando' ? (
                  <Button onClick={() => abrirEdicao(null)}>
                    <Plus aria-hidden />
                    Novo visitante
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {lista.map((visitante) => (
          <CartaoVisitante
            key={visitante.id}
            visitante={visitante}
            podeAgir={isLeader}
            onEditar={() => abrirEdicao(visitante)}
            onConversar={() => abrirConversa(visitante)}
            onPromover={() => abrirDesfecho(visitante, 'promover')}
            onEncerrar={() => abrirDesfecho(visitante, 'encerrar')}
            onReabrir={() => reabrir.mutate(visitante.id)}
            onApagar={() => apagar.mutate(visitante.id)}
          />
        ))}
      </div>

      <VisitorDialog visitante={editando} open={editarAberto} onOpenChange={setEditarAberto} />
      <VisitorContactDialog
        visitante={conversando}
        open={conversaAberta}
        onOpenChange={setConversaAberta}
      />
      <VisitorOutcomeDialog
        visitante={decidindo}
        desfecho={desfecho}
        open={desfechoAberto}
        onOpenChange={setDesfechoAberto}
      />
    </div>
  )
}

function CartaoVisitante({
  visitante,
  podeAgir,
  onEditar,
  onConversar,
  onPromover,
  onEncerrar,
  onReabrir,
  onApagar,
}: {
  visitante: Visitante
  podeAgir: boolean
  onEditar: () => void
  onConversar: () => void
  onPromover: () => void
  onEncerrar: () => void
  onReabrir: () => void
  onApagar: () => void
}) {
  const aberto = visitante.situacao === 'acompanhando'
  // Silêncio se conta desde a última conversa; sem nenhuma, desde a visita.
  const silencio = -daysUntil(visitante.ultimoContato ?? visitante.primeiraVisita)
  const emSilencio = aberto && silencio >= DIAS_DE_SILENCIO

  return (
    <Card className="min-w-0 p-4">
      <div className="flex items-start gap-3">
        <Person
          name={visitante.nome}
          detail={visitante.telefone ?? 'Sem telefone cadastrado'}
          className="min-w-0 flex-1"
        />

        {podeAgir && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${visitante.nome}`}>
                <MoreVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEditar}>
                <Pencil aria-hidden />
                Editar dados
              </DropdownMenuItem>
              {aberto && (
                <DropdownMenuItem onSelect={onConversar}>
                  <MessageCirclePlus aria-hidden />
                  Registrar contato
                </DropdownMenuItem>
              )}
              {aberto && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onPromover}>
                    <UserCheck aria-hidden />
                    Colocar no GC
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={onEncerrar}>
                    <UserMinus aria-hidden />
                    Encerrar acompanhamento
                  </DropdownMenuItem>
                </>
              )}
              {visitante.situacao === 'encerrado' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onReabrir}>
                    <RotateCcw aria-hidden />
                    Voltar a acompanhar
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={onApagar}>
                    <Trash2 aria-hidden />
                    Apagar cadastro
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">{visitorOriginLabel[visitante.origem]}</Badge>
        {visitante.convidadoPor && <Badge variant="neutral">Por {visitante.convidadoPor}</Badge>}
        {visitante.ultimaIntencao && (
          <Badge variant={visitante.ultimaIntencao === 'vem' ? 'success' : 'neutral'}>
            {gcIntentLabel[visitante.ultimaIntencao]}
          </Badge>
        )}
        {visitante.situacao === 'integrado' && <Badge variant="success">Entrou no GC</Badge>}
        {visitante.situacao === 'encerrado' && <Badge variant="neutral">Encerrado</Badge>}
        {emSilencio && (
          <Badge variant="warning">
            {visitante.contatos === 0
              ? `${silencio} dias sem contato`
              : `Silêncio há ${silencio} dias`}
          </Badge>
        )}
      </div>

      <dl className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <CalendarPlus className="size-3.5 shrink-0" aria-hidden />
          <dt className="sr-only">Primeira visita</dt>
          <dd>Visitou em {formatDate(visitante.primeiraVisita)}</dd>
        </div>
        <div>
          <dt className="sr-only">Conversas</dt>
          <dd>
            {visitante.contatos === 0
              ? 'Nenhuma conversa ainda'
              : `${visitante.contatos} conversa(s) · última em ${formatDate(visitante.ultimoContato)}`}
          </dd>
        </div>
      </dl>

      {visitante.anotacao && <p className="mt-3 text-sm text-pretty">{visitante.anotacao}</p>}

      {visitante.motivo && (
        <p className="text-muted-foreground bg-secondary mt-3 rounded-lg p-3 text-sm text-pretty">
          Encerrado em {formatDate(visitante.encerradoEm)}: {visitante.motivo}
        </p>
      )}

      {podeAgir && aberto && (
        <Button variant="secondary" className="mt-4 w-full" onClick={onConversar}>
          <MessageCirclePlus aria-hidden />
          Registrar contato
        </Button>
      )}
    </Card>
  )
}
