import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  Clock,
  Copy,
  FileChartColumn,
  HeartHandshake,
  MessageCircleQuestionMark,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { formatDate, formatDateTime, formatWeekRange } from '@/lib/date'
import { channelLabel, gcIntentLabel, roleLabel, wellBeingLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { WeekStatusBadge } from '@/components/common/badges'
import { PageHeader } from '@/components/common/page-header'
import { StatTile } from '@/components/common/stat-tile'
import { CardListSkeleton, ErrorState, StatsSkeleton } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import type {
  AvaliacaoDoCuidador,
  RelatorioSemana,
  RelatorioSemanaCuidador,
  RelatorioSemanaPessoaDoCuidador,
  SituacaoDoCuidado,
  SituacaoDoCuidador,
} from '@/types/database'
import {
  avaliacaoLabel,
  recortar,
  resumoParaWhatsapp,
  situacaoDoCuidadorLabel,
  tempoSemCuidado,
  type Recorte,
} from './relatorio-semana'

function useRelatorioSemana(weekId: string | undefined) {
  return useQuery({
    queryKey: ['relatorio-semana', weekId],
    enabled: Boolean(weekId),
    queryFn: async () => {
      const { data, error } = await db.rpc('relatorio_semana', { p_week_id: weekId })
      if (error) throw error
      return data as unknown as RelatorioSemana
    },
  })
}

const AVALIACAO_TOM: Record<AvaliacaoDoCuidador, 'success' | 'warning' | 'danger' | 'neutral'> = {
  constante: 'success',
  oscilando: 'warning',
  ausente: 'danger',
  pouco_historico: 'neutral',
}

const SITUACAO_TOM: Record<SituacaoDoCuidador, string> = {
  nenhum: 'text-destructive',
  parte: 'text-warning-foreground',
  todos: 'text-success',
}

/**
 * O relatório do fim da semana.
 *
 * A ordem da tela é a ordem das perguntas que a liderança faz: fechou? quem
 * cuidou? quem ficou sem ninguém? quem está sumindo há semanas? Por isso quem
 * não registrou cuidado vem antes de quem cuidou de todos — o que precisa de
 * gesto aparece primeiro, e o que foi bem não some, só fica embaixo.
 */
export function WeekReportPage() {
  const { id } = useParams<{ id: string }>()
  const relatorio = useRelatorioSemana(id)
  const [recorte, setRecorte] = React.useState<Recorte>('todos')

  if (relatorio.isLoading) {
    return (
      <div className="space-y-5">
        <StatsSkeleton tiles={4} />
        <CardListSkeleton rows={4} />
      </div>
    )
  }

  if (relatorio.isError) {
    return <ErrorState error={relatorio.error} onRetry={() => relatorio.refetch()} />
  }

  if (!relatorio.data) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={FileChartColumn}
            title="Relatório indisponível"
            description="A semana não existe ou ainda é um rascunho."
          />
        </CardContent>
      </Card>
    )
  }

  const dados = recortar(relatorio.data, recorte)
  const { numeros, semana } = dados
  const temDoisGrupos =
    relatorio.data.pessoas.some((p) => p.genero === 'male') &&
    relatorio.data.pessoas.some((p) => p.genero === 'female')

  const anterior = recorte === 'todos' ? relatorio.data.resumo.anterior : null
  const percentualAnterior =
    anterior && anterior.combinados > 0
      ? Math.round((anterior.cuidados / anterior.combinados) * 100)
      : null

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resumoParaWhatsapp(dados, recorte))
      toast.success('Resumo copiado. É só colar no grupo.')
    } catch {
      toast.error('Não foi possível copiar neste aparelho.')
    }
  }

  const semCuidado = dados.pessoas.filter((p) => p.situacao !== 'cuidada')
  const cuidadas = dados.pessoas.filter((p) => p.situacao === 'cuidada')
  const lideranca = dados.pessoas.filter((p) => p.atencao === 'leader_action')

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/agenda">
          <ArrowLeft aria-hidden />
          Semanas
        </Link>
      </Button>

      <PageHeader
        title="Relatório da semana"
        description={formatWeekRange(semana.inicio, semana.fim)}
        className="mb-0"
        actions={
          <Button variant="outline" onClick={copiar}>
            <Copy aria-hidden />
            Copiar resumo
          </Button>
        }
      />

      <div className="-mt-3 flex flex-wrap items-center gap-2">
        <WeekStatusBadge status={semana.situacao} />
        {semana.encerradaEm && (
          <span className="text-muted-foreground text-xs">
            encerrada em {formatDateTime(semana.encerradaEm)}
          </span>
        )}
      </div>

      {semana.situacao === 'published' && (
        <div className="border-info/30 bg-info/10 rounded-lg border px-4 py-3 text-sm text-pretty">
          A semana ainda está valendo: este é o retrato de agora, e muda conforme os cuidados forem
          registrados.
        </div>
      )}

      {temDoisGrupos && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Recorte do relatório">
          {(
            [
              ['todos', 'GC inteiro'],
              ['male', 'Homens'],
              ['female', 'Mulheres'],
            ] as const
          ).map(([valor, rotulo]) => (
            <Button
              key={valor}
              size="sm"
              variant={recorte === valor ? 'default' : 'outline'}
              aria-pressed={recorte === valor}
              onClick={() => setRecorte(valor)}
            >
              {rotulo}
            </Button>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------- capa */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Pessoas cuidadas"
          value={`${numeros.cuidados} de ${numeros.combinados}`}
          icon={CheckCircle2}
          tone="success"
          hint={
            numeros.percentual === null
              ? undefined
              : `${numeros.percentual}%${percentualAnterior === null ? '' : ` · semana anterior ${percentualAnterior}%`}`
          }
        />
        <StatTile
          label="Sem nenhum contato"
          value={numeros.semContato}
          icon={UserX}
          tone={numeros.semContato > 0 ? 'danger' : 'default'}
        />
        <StatTile
          label="Não responderam"
          value={numeros.semResposta}
          icon={MessageCircleQuestionMark}
          tone={numeros.semResposta > 0 ? 'warning' : 'default'}
          hint="Houve tentativa, sem retorno"
        />
        <StatTile
          label="Precisam da liderança"
          value={numeros.precisamDaLideranca}
          icon={AlertTriangle}
          tone={numeros.precisamDaLideranca > 0 ? 'warning' : 'default'}
        />
      </section>

      {/* ---------------------------------------------------- quem cuidou */}
      <section aria-labelledby="quem-cuidou" className="space-y-3">
        <div>
          <h2 id="quem-cuidou" className="font-display text-lg font-semibold">
            Quem cuidou
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            O relatório enxerga o que foi registrado no app. A avaliação olha as últimas{' '}
            {Math.max(...dados.cuidadores.map((c) => c.historico.length), 1)} semanas, não só esta —
            e conta mensagem sem resposta como esforço de quem cuida.
          </p>
        </div>

        {dados.cuidadores.length === 0 && (
          <Card>
            <CardContent className="text-muted-foreground p-5 text-sm">
              Ninguém tinha cuidados nesta semana.
            </CardContent>
          </Card>
        )}

        {(['nenhum', 'parte', 'todos'] as const).map((situacao) => {
          const grupo = dados.cuidadores.filter((c) => c.situacao === situacao)
          if (grupo.length === 0) return null
          return (
            <div key={situacao} className="space-y-2">
              <h3 className={cn('text-sm font-semibold', SITUACAO_TOM[situacao])}>
                {situacaoDoCuidadorLabel[situacao]} · {grupo.length}
              </h3>
              <ul className="space-y-2">
                {grupo.map((c) => (
                  <li key={c.id}>
                    <CuidadorLinha cuidador={c} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      {/* ---------------------------------------------- quem ficou sem cuidado */}
      <section aria-labelledby="sem-cuidado">
        <Card>
          <CardHeader>
            <CardTitle id="sem-cuidado" className="flex items-center gap-2">
              <UserX className="text-destructive size-[18px]" aria-hidden />
              Quem ficou sem cuidado · {semCuidado.length}
            </CardTitle>
            <CardDescription>
              Com quem estava, e há quantas semanas seguidas isso acontece.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {semCuidado.length === 0 ? (
              <p className="text-success flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4" aria-hidden />
                Todo mundo da lista foi cuidado nesta semana.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {semCuidado.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                    <SituacaoIcone situacao={p.situacao} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.nomeCompleto}</p>
                      <p className="text-muted-foreground text-xs">
                        com {p.cuidador} ·{' '}
                        {p.situacao === 'sem_resposta'
                          ? `tentou${p.canal ? ` por ${channelLabel[p.canal].toLowerCase()}` : ''}, sem resposta`
                          : 'nenhum contato registrado'}
                        {' · '}
                        último cuidado{' '}
                        {p.ultimoCuidado ? `em ${formatDate(p.ultimoCuidado)}` : 'nunca registrado'}
                      </p>
                    </div>
                    {p.semanasSemCuidado > 1 && (
                      <Badge variant="danger">{p.semanasSemCuidado}ª semana seguida</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* -------------------------------------------- precisam da lideranca */}
      {lideranca.length > 0 && (
        <section aria-labelledby="precisam-lideranca">
          <Card>
            <CardHeader>
              <CardTitle id="precisam-lideranca" className="flex items-center gap-2">
                <AlertTriangle className="text-warning-foreground size-[18px]" aria-hidden />
                Precisam da liderança · {lideranca.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-border divide-y">
                {lideranca.map((p) => (
                  <li key={p.id} className="space-y-1 py-2.5">
                    <p className="font-medium">{p.nomeCompleto}</p>
                    <p className="text-muted-foreground text-xs">
                      com {p.cuidador}
                      {p.comoEsta && ` · ${wellBeingLabel[p.comoEsta]}`}
                      {p.contatoEm && ` · em ${formatDate(p.contatoEm)}`}
                    </p>
                    {p.observacao && (
                      <p className="bg-secondary/60 rounded-md px-3 py-2 text-sm text-pretty">
                        {p.observacao}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ------------------------------------------ ha mais tempo sem cuidado */}
      <HaMaisTempo dados={dados} />

      {/* ------------------------------------------------- quem foi cuidado */}
      <section aria-labelledby="cuidadas">
        <Card>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 sm:p-6">
              <span id="cuidadas" className="font-display flex items-center gap-2 font-semibold">
                <HeartHandshake className="text-success size-[18px]" aria-hidden />
                Quem foi cuidado · {cuidadas.length}
              </span>
              <ChevronDown
                className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <CardContent className="pt-0">
              <ul className="divide-border divide-y">
                {cuidadas.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 py-2.5">
                    <SituacaoIcone situacao={p.situacao} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.nomeCompleto}</p>
                      <p className="text-muted-foreground text-xs">
                        {[
                          `por ${p.cuidador}`,
                          p.contatoEm && formatDate(p.contatoEm),
                          p.canal && channelLabel[p.canal],
                          p.comoEsta && wellBeingLabel[p.comoEsta],
                          p.vemAoGc && gcIntentLabel[p.vemAoGc],
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </details>
        </Card>
      </section>

      {/* ------------------------------------------------- transferencias */}
      {dados.transferencias.length > 0 && (
        <section aria-labelledby="transferencias">
          <Card>
            <CardHeader>
              <CardTitle id="transferencias" className="flex items-center gap-2">
                <ArrowLeftRight className="text-primary size-[18px]" aria-hidden />
                Mudaram de mãos · {dados.transferencias.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-border divide-y text-sm">
                {dados.transferencias.map((t, indice) => (
                  <li key={indice} className="py-2">
                    <span className="font-medium">{t.pessoa}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · de {t.de ?? '—'} para {t.para}
                      {t.origem === 'manual'
                        ? ' (remanejado pela liderança)'
                        : ' (transferência aceita)'}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      <p className="text-muted-foreground text-center text-xs">
        Gerado em {formatDateTime(relatorio.data.geradoEm)}
      </p>
    </div>
  )
}

/**
 * Uma pessoa que cuida: o número desta semana, o jeito das últimas e, ao
 * tocar, de quem ela cuidou e como cada um estava.
 */
function CuidadorLinha({ cuidador: c }: { cuidador: RelatorioSemanaCuidador }) {
  const { constancia } = c

  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={c.nomeCompleto}>
              {c.nomeCompleto}
            </p>
            <p className="text-muted-foreground text-xs">
              {roleLabel[c.papel]} · {c.feitos} de {c.total} cuidados
              {c.tentativas > 0 && ` · ${c.tentativas} sem resposta`}
            </p>
          </div>

          <Historico cuidador={c} />

          <Badge
            variant={AVALIACAO_TOM[c.avaliacao]}
            title={
              c.avaliacao === 'pouco_historico'
                ? 'Menos de duas semanas com cuidados: cedo para avaliar.'
                : `Nas últimas ${constancia.semanas} semanas: ${constancia.feitos + constancia.tentativas} de ${constancia.combinados} com contato registrado.`
            }
          >
            {avaliacaoLabel[c.avaliacao]}
          </Badge>

          <ChevronDown
            className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>

        <div className="border-border space-y-2 border-t px-4 py-3">
          {c.avaliacao !== 'pouco_historico' && (
            <p className="text-muted-foreground text-xs">
              Nas últimas {constancia.semanas} semanas: {constancia.feitos} cuidados feitos e{' '}
              {constancia.tentativas} tentativas, de {constancia.combinados} combinados (
              {Math.round(constancia.taxa * 100)}%).
            </p>
          )}
          <ul className="space-y-1.5">
            {c.pessoas.map((p) => (
              <PessoaDoCuidador key={p.id} pessoa={p} />
            ))}
          </ul>
        </div>
      </details>
    </Card>
  )
}

/** Uma barrinha por semana: cheia quando cuidou de todos, vazia quando de ninguém. */
function Historico({ cuidador }: { cuidador: RelatorioSemanaCuidador }) {
  return (
    <span
      className="flex items-end gap-0.5"
      aria-label={`Últimas semanas: ${cuidador.historico
        .map((s) => (s.total === 0 ? 'sem cuidados' : `${s.feitos + s.tentativas} de ${s.total}`))
        .join(', ')}`}
    >
      {cuidador.historico.map((s) => {
        const razao = s.total === 0 ? null : (s.feitos + s.tentativas) / s.total
        return (
          <span
            key={s.inicio}
            className="bg-secondary relative block h-5 w-2 overflow-hidden rounded-sm"
            title={`${formatDate(s.inicio)}: ${s.total === 0 ? 'sem cuidados' : `${s.feitos + s.tentativas} de ${s.total}`}`}
          >
            {razao !== null && (
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 block',
                  razao >= 0.8 ? 'bg-success' : razao >= 0.5 ? 'bg-warning' : 'bg-destructive',
                )}
                style={{ height: `${Math.max(razao * 100, 12)}%` }}
              />
            )}
          </span>
        )
      })}
    </span>
  )
}

function PessoaDoCuidador({ pessoa: p }: { pessoa: RelatorioSemanaPessoaDoCuidador }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <SituacaoIcone situacao={p.situacao} />
      <span className="min-w-0">
        <span className="font-medium">{p.nomeCompleto}</span>
        <span className="text-muted-foreground block text-xs">
          {p.situacao === 'sem_contato'
            ? 'Nenhum contato registrado'
            : [
                p.contatoEm && formatDate(p.contatoEm),
                p.canal && channelLabel[p.canal],
                p.comoEsta && wellBeingLabel[p.comoEsta],
                p.vemAoGc && gcIntentLabel[p.vemAoGc],
              ]
                .filter(Boolean)
                .join(' · ')}
        </span>
      </span>
    </li>
  )
}

function SituacaoIcone({ situacao }: { situacao: SituacaoDoCuidado }) {
  if (situacao === 'cuidada') {
    return <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-label="Cuidada" />
  }
  if (situacao === 'sem_resposta') {
    return (
      <CircleDashed
        className="text-warning-foreground mt-0.5 size-4 shrink-0"
        aria-label="Sem resposta"
      />
    )
  }
  return <Circle className="text-destructive mt-0.5 size-4 shrink-0" aria-label="Sem contato" />
}

/**
 * O GC inteiro, do que está há mais tempo sem cuidado para o mais recente.
 *
 * Não só a lista desta semana: quem ficou fora da distribuição também some, e
 * é exatamente essa pessoa que esta seção existe para achar.
 */
function HaMaisTempo({ dados }: { dados: RelatorioSemana }) {
  const [todos, setTodos] = React.useState(false)
  const lista = dados.semCuidadoHaMais
  const visiveis = todos ? lista : lista.slice(0, 8)

  return (
    <section aria-labelledby="ha-mais-tempo">
      <Card>
        <CardHeader>
          <CardTitle id="ha-mais-tempo" className="flex items-center gap-2">
            <Clock className="text-primary size-[18px]" aria-hidden />
            Há mais tempo sem cuidado
          </CardTitle>
          <CardDescription>
            O GC inteiro, contando só cuidado com resposta — mensagem sem retorno não conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="divide-border divide-y">
            {visiveis.map((p, indice) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="tabular text-muted-foreground w-5 text-right text-xs">
                  {indice + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.nomeCompleto}</p>
                  <p className="text-muted-foreground text-xs">
                    {tempoSemCuidado(p.dias)}
                    {p.ultimoCuidado && ` · último em ${formatDate(p.ultimoCuidado)}`}
                    {' · '}
                    {p.cuidadorNaSemana
                      ? `nesta semana com ${p.cuidadorNaSemana}`
                      : 'fora da distribuição desta semana'}
                  </p>
                </div>
                {p.semanasSemCuidado > 1 && (
                  <Badge variant={p.semanasSemCuidado >= 3 ? 'danger' : 'warning'}>
                    {p.semanasSemCuidado} semanas seguidas
                  </Badge>
                )}
              </li>
            ))}
          </ol>
          {lista.length > 8 && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTodos((v) => !v)}>
              {todos ? 'Mostrar menos' : `Ver todos (${lista.length})`}
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
