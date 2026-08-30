import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  HeartHandshake,
  Minus,
  TrendingUp,
  VolumeX,
} from 'lucide-react'
import { db } from '@/lib/db'
import { formatWeekRange, parseISODate } from '@/lib/date'
import { channelLabel, gcIntentLabel, wellBeingLabel } from '@/lib/labels'
import type { ActivityResponse, ContactChannel, GcIntent, WellBeing } from '@/types/database'
import { PageHeader } from '@/components/common/page-header'
import { StatTile } from '@/components/common/stat-tile'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { porcento } from '@/components/charts/medidas'
import { ColunasEmpilhadas, LinhaTendencia } from '@/components/charts/time-charts'
import { BarrasDivergentes, ListaBarras, Rosca } from '@/components/charts/part-charts'
import { MapaConstancia } from '@/components/charts/heatmap'
import { PresencaSection } from './presenca-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface SemanaResumo {
  inicio: string
  fim: string
  situacao: string
  combinados: number
  feitos: number
  semContato: number
  precisamDaLideranca: number
}

interface PorSemana {
  inicio: string
  fim: string
  contagens: Record<string, number>
}

interface Relatorio {
  semanas: SemanaResumo[]
  resumo: {
    combinados: number
    feitos: number
    semContato: number
    precisamDaLideranca: number
    combinadosAnterior: number
    feitosAnterior: number
    semanas: number
  }
  comoEstao: Partial<Record<WellBeing | 'sem_registro', number>>
  comoEstaoPorSemana: PorSemana[]
  presenca: Partial<Record<GcIntent | 'sem_resposta', number>>
  presencaPorSemana: PorSemana[]
  canais: Partial<Record<ContactChannel, number>>
  atividades: Partial<Record<ActivityResponse, number>>
  cuidadores: {
    id: string
    nome: string
    papel: string
    semanasSeguidas: number
    registrosNoPeriodo: number
  }[]
  constancia: {
    id: string
    nome: string
    semanas: { inicio: string; total: number; feitos: number }[]
  }[]
  semContatoHaMais: { id: string; nome: string; ultimoContato: string | null }[]
  geradoEm: string
}

const PERIODOS = [4, 8, 12, 26] as const

/** "18/08" - o suficiente para ancorar a coluna sem competir com ela. */
function diaMes(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(parseISODate(iso))
}

/**
 * A escala do feedback, desenhada como ela é: um eixo.
 *
 * "Precisa de ajuda" e "muito bem" são lados opostos, e "seguindo" é o meio —
 * por isso a barra é divergente e não empilhada da esquerda para a direita.
 * O silêncio fica fora do eixo: não responder não é um nível de bem-estar.
 */
const NEGATIVOS = [
  { chave: 'precisa_ajuda', rotulo: wellBeingLabel.precisa_ajuda, cor: 'var(--chart-neg-2)' },
  { chave: 'pra_baixo', rotulo: wellBeingLabel.pra_baixo, cor: 'var(--chart-neg-1)' },
]
const NEUTRO = { chave: 'seguindo', rotulo: wellBeingLabel.seguindo, cor: 'var(--chart-mid)' }
const POSITIVOS = [
  { chave: 'bem', rotulo: wellBeingLabel.bem, cor: 'var(--chart-pos-1)' },
  { chave: 'muito_bem', rotulo: wellBeingLabel.muito_bem, cor: 'var(--chart-pos-2)' },
]
const SILENCIO = [
  { chave: 'sem_resposta', rotulo: wellBeingLabel.sem_resposta, cor: 'var(--chart-ausente)' },
  { chave: 'sem_registro', rotulo: 'Sem registro', cor: 'var(--chart-grid)' },
]

/**
 * O relatório do GC, para liderança e supervisão.
 *
 * Ele não inventa dado: junta o que o registro de contato já produz. E não traz
 * ranking de pessoas — a medida de quem cuida é constância, não volume. Um
 * pódio aqui transformaria cuidado pastoral em competição, e quem ficasse em
 * último seria justamente quem mais precisa de apoio. É também por isso que o
 * mapa de constância mostra a semana de cada pessoa, e não um acumulado.
 */
export function ReportsPage() {
  const [semanas, setSemanas] = React.useState<number>(8)

  const relatorio = useQuery({
    queryKey: ['relatorio', semanas],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('relatorio_gc', { p_semanas: semanas })
      if (error) throw error
      return data as unknown as Relatorio
    },
  })

  const dados = relatorio.data

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relatórios"
        description="Como o GC está indo, pelas semanas que já passaram."
      />

      <Tabs value={String(semanas)} onValueChange={(v) => setSemanas(Number(v))}>
        <TabsList className="w-full min-w-0 scrollbar-thin justify-start overflow-x-auto sm:w-auto">
          {PERIODOS.map((p) => (
            <TabsTrigger key={p} value={String(p)}>
              {p} semanas
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {relatorio.isLoading && <CardListSkeleton rows={3} />}
      {relatorio.isError && (
        <ErrorState error={relatorio.error} onRetry={() => relatorio.refetch()} />
      )}

      {dados && dados.semanas.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={TrendingUp}
              title="Nenhuma semana publicada ainda"
              description="O relatório se enche sozinho a partir da primeira semana publicada — não há nada a preencher aqui."
            />
          </CardContent>
        </Card>
      )}

      {dados && dados.semanas.length > 0 && <Conteudo dados={dados} />}

      {/* A presença vive fora do bloco acima de propósito: a chamada do GC não
          depende de nenhuma semana de cuidado publicada, e um GC que ainda não
          distribuiu cuidado nenhum já tem gente aparecendo na sala. O recorte
          vira encontros — uma semana sem GC não é uma semana com zero
          presentes. */}
      <PresencaSection encontros={semanas} />
    </div>
  )
}

function Conteudo({ dados }: { dados: Relatorio }) {
  const { resumo } = dados

  const proporcao = porcento(resumo.feitos, resumo.combinados)
  const proporcaoAnterior = porcento(resumo.feitosAnterior, resumo.combinadosAnterior)
  const variacao = resumo.combinadosAnterior > 0 ? proporcao - proporcaoAnterior : null

  const silencio = SILENCIO.reduce(
    (soma, nivel) => soma + (dados.comoEstao[nivel.chave as WellBeing] ?? 0),
    0,
  )

  const semanasEmpilhadas = dados.semanas.map((semana) => ({
    rotulo: formatWeekRange(semana.inicio, semana.fim),
    rotuloCurto: diaMes(semana.inicio),
    segmentos: {
      feitos: semana.feitos,
      andamento: Math.max(0, semana.combinados - semana.feitos - semana.semContato),
      semContato: semana.semContato,
    },
  }))

  const tendencia = dados.semanas.map((semana) => ({
    rotulo: formatWeekRange(semana.inicio, semana.fim),
    rotuloCurto: diaMes(semana.inicio),
    valor: porcento(semana.feitos, semana.combinados),
  }))

  const bemEstar = dados.comoEstaoPorSemana.map((semana) => ({
    rotulo: formatWeekRange(semana.inicio, semana.fim),
    rotuloCurto: diaMes(semana.inicio),
    contagens: semana.contagens,
  }))

  // A rosca responde "como está esta semana"; a linha responde "e vem
  // melhorando?". São duas perguntas, e por isso são dois desenhos - nunca
  // dois eixos no mesmo.
  const presencaTendencia = dados.presencaPorSemana.map((semana) => {
    const total = Object.values(semana.contagens).reduce((soma, n) => soma + n, 0)
    return {
      rotulo: formatWeekRange(semana.inicio, semana.fim),
      rotuloCurto: diaMes(semana.inicio),
      valor: porcento(semana.contagens.vem ?? 0, total),
    }
  })

  const presenca = [
    {
      chave: 'vem',
      rotulo: gcIntentLabel.vem,
      cor: 'var(--chart-pos-2)',
      valor: dados.presenca.vem ?? 0,
    },
    {
      chave: 'nao_sabe',
      rotulo: gcIntentLabel.nao_sabe,
      cor: 'var(--chart-mid)',
      valor: dados.presenca.nao_sabe ?? 0,
    },
    {
      chave: 'nao_vem',
      rotulo: gcIntentLabel.nao_vem,
      cor: 'var(--chart-neg-2)',
      valor: dados.presenca.nao_vem ?? 0,
    },
    {
      chave: 'sem_resposta',
      rotulo: 'Não perguntado',
      cor: 'var(--chart-ausente)',
      valor: dados.presenca.sem_resposta ?? 0,
    },
  ]

  // Aceite é estado, não identidade: usa as cores reservadas de confirmação e
  // recusa, nunca as da escala de quantidade.
  const combinado = [
    {
      chave: 'aceita',
      rotulo: 'Aceitaram',
      cor: 'var(--success)',
      valor: dados.atividades.aceita ?? 0,
    },
    {
      chave: 'pendente',
      rotulo: 'Sem resposta',
      cor: 'var(--chart-ausente)',
      valor: dados.atividades.pendente ?? 0,
    },
    {
      chave: 'recusada',
      rotulo: 'Não vão conseguir',
      cor: 'var(--destructive)',
      valor: dados.atividades.recusada ?? 0,
    },
  ]

  const canais = (Object.entries(dados.canais) as [ContactChannel, number][])
    .map(([canal, quantos]) => ({ rotulo: channelLabel[canal], valor: quantos }))
    .sort((a, b) => b.valor - a.valor)

  const streaks = new Map(dados.cuidadores.map((pessoa) => [pessoa.id, pessoa.semanasSeguidas]))

  return (
    <>
      {/* ------------------------------------------------------- os números de capa */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Cuidado feito"
          value={`${proporcao}%`}
          icon={HeartHandshake}
          tone="success"
          hint={
            variacao === null ? (
              `${resumo.feitos} de ${resumo.combinados} combinados`
            ) : (
              <>
                {resumo.feitos} de {resumo.combinados} · {sinal(variacao)} que no período anterior
              </>
            )
          }
        />
        <StatTile
          label="Ninguém contatou"
          value={resumo.semContato}
          icon={AlertTriangle}
          tone={resumo.semContato > 0 ? 'warning' : 'default'}
          hint="cuidados combinados que não aconteceram"
        />
        <StatTile
          label="Silêncio"
          value={silencio}
          icon={VolumeX}
          tone={silencio > 0 ? 'warning' : 'default'}
          hint="contatos sem retorno ou sem registro"
        />
        <StatTile
          label="Pediram a liderança"
          value={resumo.precisamDaLideranca}
          icon={Flame}
          tone={resumo.precisamDaLideranca > 0 ? 'danger' : 'default'}
          hint="alguém marcou que a liderança precisa agir"
        />
      </div>

      {/* -------------------------------------------------------- semana a semana */}
      <Card>
        <CardHeader>
          <CardTitle>Semana a semana</CardTitle>
          <CardDescription>
            A altura da coluna é o que foi combinado; a cor, o que aconteceu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ColunasEmpilhadas
            descricao="Cuidados combinados por semana, divididos entre feitos, em andamento e sem contato."
            pontos={semanasEmpilhadas}
            series={[
              { chave: 'feitos', rotulo: 'Contato feito', cor: 'var(--chart-5)' },
              { chave: 'andamento', rotulo: 'Em andamento', cor: 'var(--chart-2)' },
              { chave: 'semContato', rotulo: 'Sem contato', cor: 'var(--chart-grid)' },
            ]}
          />

          <div className="border-t pt-5">
            <p className="mb-3 text-sm font-medium">Proporção do combinado que aconteceu</p>
            <LinhaTendencia
              descricao="Percentual do cuidado combinado que aconteceu, semana a semana."
              pontos={tendencia}
              cor="var(--chart-4)"
              sufixo="%"
            />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ bem-estar */}
      <Card>
        <CardHeader>
          <CardTitle>Como o GC esteve</CardTitle>
          <CardDescription>
            Cada barra é uma semana, centrada em “seguindo”. Escorregou para a esquerda, a semana
            foi mais pesada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bemEstar.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ainda sem registros no período.</p>
          ) : (
            <BarrasDivergentes
              descricao="Escala de bem-estar por semana, do 'precisa de ajuda' ao 'muito bem', centrada em 'seguindo'."
              linhas={bemEstar}
              negativos={NEGATIVOS}
              neutro={NEUTRO}
              positivos={POSITIVOS}
              ausentes={SILENCIO}
            />
          )}
        </CardContent>
      </Card>

      {/* `items-start` para os dois cartões terem a altura do que carregam:
          esticar o menor deixaria um vazio no lugar de um desenho. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* ---------------------------------------------------------- presença */}
        <Card>
          <CardHeader>
            <CardTitle>Presença desta semana</CardTitle>
            <CardDescription>O que as pessoas disseram sobre vir ao GC.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Rosca
              descricao="Proporção de pessoas que disseram que vêm ao GC nesta semana."
              fatias={presenca}
              destaque="vem"
            />
            {presencaTendencia.length > 1 && (
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">Quem disse que vem, semana a semana</p>
                <LinhaTendencia
                  descricao="Percentual de pessoas que disseram que vêm ao GC, semana a semana."
                  pontos={presencaTendencia}
                  cor="var(--chart-pos-2)"
                  sufixo="%"
                  altura={120}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ combinado das atividades */}
        <Card>
          <CardHeader>
            <CardTitle>O combinado das atividades</CardTitle>
            <CardDescription>Talk, lanche e dinâmica: quem foi indicado respondeu?</CardDescription>
          </CardHeader>
          <CardContent>
            <Rosca
              descricao="Proporção de indicações de atividade que foram aceitas."
              fatias={combinado}
              destaque="aceita"
            />
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------------- canais */}
      <Card>
        <CardHeader>
          <CardTitle>Por onde o cuidado acontece</CardTitle>
          <CardDescription>
            Serve para uma pergunta prática: se quase tudo é mensagem escrita, talvez falte ligar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canais.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ainda sem contatos registrados.</p>
          ) : (
            <ListaBarras descricao="Contatos registrados por canal no período." itens={canais} />
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- constância */}
      <Card>
        <CardHeader>
          <CardTitle>Constância de quem cuida</CardTitle>
          <CardDescription>
            Um quadradinho por semana. Semana sem combinado fica vazia — “não teve” não é a mesma
            coisa que “teve e não fez”.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dados.constancia.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ninguém teve cuidados no período.</p>
          ) : (
            <MapaConstancia
              descricao="Mapa de constância: uma linha por cuidador, uma célula por semana, preenchida conforme o cuidado combinado aconteceu."
              linhas={dados.constancia.map((pessoa) => ({
                id: pessoa.id,
                nome: pessoa.nome,
                selo:
                  (streaks.get(pessoa.id) ?? 0) > 1 ? (
                    <Badge variant="success" className="gap-1">
                      <Flame className="size-3" aria-hidden />
                      {streaks.get(pessoa.id)}
                    </Badge>
                  ) : undefined,
                celulas: pessoa.semanas.map((semana) => ({
                  rotulo: `semana de ${diaMes(semana.inicio)}`,
                  total: semana.total,
                  feitos: semana.feitos,
                })),
              }))}
            />
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ sem contato há mais */}
      <Card>
        <CardHeader>
          <CardTitle>Há mais tempo sem contato</CardTitle>
          <CardDescription>
            Duas semanas ou mais. É a lista que existe para ninguém ficar de fora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dados.semContatoHaMais.length === 0 ? (
            <p className="flex items-center gap-2 text-sm">
              <TrendingUp className="text-success size-4" aria-hidden />
              Ninguém está há mais de duas semanas sem contato.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {dados.semContatoHaMais.map((pessoa) => (
                <li key={pessoa.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm">{pessoa.nome}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {pessoa.ultimoContato ? `desde ${diaMes(pessoa.ultimoContato)}` : 'nunca'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/** "+6 pontos" / "-2 pontos" / "igual" — a variação escrita, não só colorida. */
function sinal(variacao: number): React.ReactNode {
  if (variacao === 0) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <Minus className="size-3" aria-hidden />
        igual
      </span>
    )
  }
  const Icone = variacao > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={variacao > 0 ? 'text-success' : 'text-destructive'}>
      <Icone className="inline size-3" aria-hidden />
      {Math.abs(variacao)} ponto{Math.abs(variacao) === 1 ? '' : 's'}
    </span>
  )
}
