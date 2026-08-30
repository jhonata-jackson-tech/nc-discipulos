import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, DoorOpen, PhoneOff, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { useSession } from '@/features/auth/session-context'
import { formatDate, parseISODate } from '@/lib/date'
import type { AttendanceMark } from '@/types/database'
import { StatTile } from '@/components/common/stat-tile'
import { porcento } from '@/components/charts/medidas'
import { ColunasEmpilhadas } from '@/components/charts/time-charts'
import { MapaConstancia } from '@/components/charts/heatmap'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

interface EncontroDoRelatorio {
  id: string
  quando: string
  presentes: number
  justificados: number
  ausentes: number
  visitantes: number
  elenco: number
  /** Quantos disseram, no registro de contato daquela semana, que viriam. */
  disseramQueVem: number
}

interface RelatorioPresenca {
  encontros: EncontroDoRelatorio[]
  resumo: {
    encontros: number
    presentes: number
    media: number
    maior: number
    menor: number
    elenco: number
    visitantes: number
  }
  mapa: {
    id: string
    nome: string
    faltasSeguidas: number
    encontros: { quando: string; marca: AttendanceMark }[]
  }[]
  faltosos: {
    id: string
    nome: string
    faltasSeguidas: number
    ultimaPresenca: string | null
  }[]
  visitantes: {
    acompanhando: number
    integrados: number
    encerrados: number
    semContato: number
  }
  geradoEm: string
}

/** A cor de cada marca no mapa. Categórica: presença não é proporção. */
const TOM: Record<AttendanceMark, string> = {
  presente: 'var(--chart-5)',
  justificado: 'var(--chart-2)',
  ausente: 'var(--chart-grid)',
}

const LEGENDA = [
  { cor: TOM.presente, rotulo: 'Veio' },
  { cor: TOM.justificado, rotulo: 'Avisou que não vinha' },
  { cor: TOM.ausente, rotulo: 'Faltou' },
]

/** "18/08" — o suficiente para ancorar a coluna sem competir com ela. */
function diaMes(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(parseISODate(iso))
}

/**
 * A presença no relatório do GC.
 *
 * Consulta própria porque o recorte é outro: cuidado se conta por semana,
 * presença se conta por encontro. Uma semana sem GC não é uma semana com zero
 * presentes — é uma semana sem encontro, e somar as duas afundaria a média sem
 * que nada tivesse acontecido.
 *
 * O gráfico coloca lado a lado a promessa e o fato: quantos disseram no
 * contato da semana que viriam, e quantos apareceram. A distância entre as
 * duas é uma informação pastoral por si só — e nenhuma das duas, sozinha, a
 * conta.
 */
export function PresencaSection({ encontros }: { encontros: number }) {
  const { group } = useSession()

  const relatorio = useQuery({
    queryKey: ['relatorio-presenca', group?.id, encontros],
    enabled: Boolean(group?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('relatorio_presenca', {
        p_group_id: group!.id,
        p_encontros: encontros,
      })
      if (error) throw error
      return data as unknown as RelatorioPresenca
    },
  })

  const dados = relatorio.data
  if (!dados) return null

  if (dados.encontros.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Presença no GC</CardTitle>
          <CardDescription>Quem esteve na sala, encontro a encontro.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <EmptyState
            icon={CalendarCheck}
            title="Nenhuma presença registrada ainda"
            description="Assim que a liderança registrar a primeira presença, esta parte do relatório se enche sozinha."
          />
        </CardContent>
      </Card>
    )
  }

  const { resumo } = dados

  const colunas = dados.encontros.map((encontro) => ({
    rotulo: formatDate(encontro.quando, 'long'),
    rotuloCurto: diaMes(encontro.quando),
    segmentos: {
      presentes: encontro.presentes,
      justificados: encontro.justificados,
      ausentes: encontro.ausentes,
    },
  }))

  // Quantos disseram que vinham, no total do recorte, contra quantos vieram.
  const prometido = dados.encontros.reduce((soma, e) => soma + e.disseramQueVem, 0)
  const cumprido = dados.encontros.reduce((soma, e) => soma + e.presentes, 0)

  return (
    <>
      {/* ---------------------------------------------------- os números da sala */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Média por encontro"
          value={resumo.media}
          icon={Users}
          tone="success"
          hint={`de ${resumo.elenco} no GC · ${porcento(Math.round(resumo.media), resumo.elenco)}%`}
        />
        <StatTile
          label="Encontros"
          value={resumo.encontros}
          icon={CalendarCheck}
          hint={`entre ${resumo.menor} e ${resumo.maior} pessoas`}
        />
        <StatTile
          label="Visitantes na sala"
          value={resumo.visitantes}
          icon={DoorOpen}
          hint={`${dados.visitantes.acompanhando} em acompanhamento · ${dados.visitantes.integrados} entraram`}
        />
        <StatTile
          label="Faltando seguido"
          value={dados.faltosos.length}
          icon={PhoneOff}
          tone={dados.faltosos.length > 0 ? 'warning' : 'default'}
          hint="duas faltas ou mais, sem aviso"
        />
      </div>

      {/* ----------------------------------------------------- encontro a encontro */}
      <Card>
        <CardHeader>
          <CardTitle>Encontro a encontro</CardTitle>
          <CardDescription>
            A altura da coluna é o GC inteiro; a cor, quem esteve na sala.
            {prometido > 0 && (
              <>
                {' '}
                No período, {prometido} disseram que viriam e {cumprido} apareceram.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ColunasEmpilhadas
            descricao="Presença por encontro, dividida entre quem veio, quem avisou que não viria e quem faltou."
            pontos={colunas}
            series={[
              { chave: 'presentes', rotulo: 'Vieram', cor: 'var(--chart-5)' },
              { chave: 'justificados', rotulo: 'Avisaram', cor: 'var(--chart-2)' },
              { chave: 'ausentes', rotulo: 'Faltaram', cor: 'var(--chart-grid)' },
            ]}
          />
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- o mapa de presença */}
      <Card>
        <CardHeader>
          <CardTitle>Quem vem, e quem parou de vir</CardTitle>
          <CardDescription>
            Um quadradinho por encontro. Não é um boletim: é a pergunta de quem alguém precisa
            procurar esta semana.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MapaConstancia
            descricao="Mapa de presença: uma linha por integrante, uma célula por encontro."
            legenda={LEGENDA}
            linhas={dados.mapa.map((pessoa) => ({
              id: pessoa.id,
              nome: pessoa.nome,
              selo:
                pessoa.faltasSeguidas >= 2 ? (
                  <Badge variant="warning">{pessoa.faltasSeguidas} faltas</Badge>
                ) : undefined,
              celulas: pessoa.encontros.map((encontro) => ({
                rotulo: `encontro de ${diaMes(encontro.quando)}`,
                total: 1,
                feitos: encontro.marca === 'presente' ? 1 : 0,
                tom: TOM[encontro.marca],
                detalhe:
                  encontro.marca === 'presente'
                    ? 'Veio'
                    : encontro.marca === 'justificado'
                      ? 'Avisou que não vinha'
                      : 'Faltou',
              })),
            }))}
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ os faltosos */}
      {dados.faltosos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Faltando seguido</CardTitle>
            <CardDescription>
              Duas faltas ou mais, sem aviso. Quem avisou não entra aqui — avisar é o contrário de
              sumir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y">
              {dados.faltosos.map((pessoa) => (
                <li key={pessoa.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm">{pessoa.nome}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {pessoa.ultimaPresenca
                        ? `veio pela última vez em ${diaMes(pessoa.ultimaPresenca)}`
                        : 'nunca apareceu no GC'}
                    </span>
                    <Badge variant="warning">{pessoa.faltasSeguidas}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
