import * as React from 'react'
import { CalendarCheck, ClipboardList, DoorOpen, Trash2, Users } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import {
  useDeleteMeeting,
  useMeetingRoster,
  useMeetings,
  useSaveAttendance,
  type Encontro,
  type MarcaEnviada,
} from './use-attendance'
import {
  addDays,
  formatDate,
  formatDateTime,
  lastWeekdayOn,
  todayISO,
  weekdayName,
  weekdayShort,
} from '@/lib/date'
import { attendanceHint, attendanceLabel } from '@/lib/labels'
import type { AttendanceMark } from '@/types/database'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/common/page-header'
import { Person } from '@/components/common/person'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const MARCAS: AttendanceMark[] = ['presente', 'justificado', 'ausente']

/** Cada linha da lista, identificada de um jeito que não colide entre listas. */
type Chave = `${'integrante' | 'visitante'}:${string}`
interface Marcacao {
  marca: AttendanceMark
  justificativa: string
}

const chaveDe = (tipo: 'integrante' | 'visitante', id: string): Chave => `${tipo}:${id}`

/** "1 avisou" e "4 avisaram" - a conta do dia é lida em voz alta. */
const plural = (quantos: number, um: string, varios: string) =>
  `${quantos} ${quantos === 1 ? um : varios}`

/**
 * A presença do fim do GC.
 *
 * A tela nasce no último dia de encontro que já passou — quinta, quase sempre;
 * sexta quando o GC foi movido. Todo mundo começa em "faltou" e a liderança
 * marca quem apareceu: é o caminho mais curto quando 21 de 33 vieram, e é o
 * único que não confunde "não veio" com "não terminei de preencher".
 *
 * Salvar de novo no mesmo dia corrige o registro. Quem chegou atrasado e foi
 * lembrado depois não deveria obrigar ninguém a apagar nada.
 */
export function AttendancePage() {
  const { group, isLeader } = useSession()
  const diaFixo = group?.meeting_weekday ?? 4

  const [quando, setQuando] = React.useState(() => lastWeekdayOn(diaFixo))

  const encontro = useMeetingRoster(quando)
  const encontros = useMeetings(12)
  const apagar = useDeleteMeeting()

  const diaDoGc = lastWeekdayOn(diaFixo)
  const diaSeguinte = addDays(diaDoGc, 1)
  const dados = encontro.data

  return (
    <div className="space-y-4">
      <PageHeader
        title="Presença"
        description={`O GC é toda ${weekdayName(diaDoGc)}. Quando ele muda de dia, marque no dia em que aconteceu.`}
      />

      {/* ------------------------------------------------------- o dia do encontro */}
      <Card>
        <CardContent className="space-y-3 p-3">
          {/* Os dois dias em que o GC de fato acontece, lado a lado e a um
              toque. O campo de data continua ali para o resto — mas o resto é
              exceção, e por isso vem depois e menor. */}
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            <BotaoDeDia dia={diaDoGc} escolhido={quando === diaDoGc} onEscolher={setQuando} />
            <BotaoDeDia
              dia={diaSeguinte}
              escolhido={quando === diaSeguinte}
              indisponivel={diaSeguinte > todayISO()}
              onEscolher={setQuando}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Label htmlFor="dia-do-encontro" className="text-muted-foreground shrink-0 text-xs">
              Outro dia de encontro
            </Label>
            <DateInput
              id="dia-do-encontro"
              max={todayISO()}
              value={quando}
              className="w-auto min-w-40"
              onChange={(evento) => setQuando(evento.target.value)}
            />
          </div>

          <p className="text-muted-foreground text-xs">
            {dados?.id
              ? `Registrada em ${formatDateTime(dados.registradoEm)}${
                  dados.registradoPor ? ` por ${dados.registradoPor}` : ''
                }.`
              : 'Ainda não há presença registrada neste dia.'}
          </p>
        </CardContent>
      </Card>

      {encontro.isLoading && <CardListSkeleton rows={4} />}
      {encontro.isError && <ErrorState error={encontro.error} onRetry={() => encontro.refetch()} />}

      {/* A presença de cada dia é uma folha em branco própria: trocar de data
          remonta o componente, para nenhuma marca do dia anterior sobreviver. */}
      {dados && <PresencaDoDia key={quando} quando={quando} encontro={dados} editavel={isLeader} />}

      {/* --------------------------------------------------- os encontros anteriores */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" aria-hidden />
            Encontros anteriores
          </CardTitle>
          <CardDescription>Toque em um deles para abrir ou corrigir a presença.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {encontros.isSuccess && encontros.data.length === 0 && (
            <EmptyState
              icon={CalendarCheck}
              title="Nenhuma presença registrada ainda"
              description="A primeira que você salvar aparece aqui, com os números do dia."
            />
          )}

          <ul className="divide-border divide-y">
            {encontros.data?.map((registro) => (
              <li
                key={registro.id}
                className={cn(
                  'flex items-center gap-2 py-2',
                  registro.quando === quando && 'text-foreground',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setQuando(registro.quando)}
                >
                  <span
                    className={cn(
                      'block text-sm font-medium capitalize',
                      registro.quando === quando && 'text-primary',
                    )}
                  >
                    {weekdayShort(registro.quando)}, {formatDate(registro.quando)}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {plural(registro.presentes, 'veio', 'vieram')}
                    {registro.justificados > 0 &&
                      ` · ${plural(registro.justificados, 'avisou', 'avisaram')}`}
                    {registro.ausentes > 0 &&
                      ` · ${plural(registro.ausentes, 'faltou', 'faltaram')}`}
                    {registro.visitantes > 0 &&
                      ` · ${plural(registro.visitantes, 'visitante', 'visitantes')}`}
                    {registro.anotacao && ` · ${registro.anotacao}`}
                  </span>
                </button>

                {isLeader && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={`Apagar a presença de ${formatDate(registro.quando)}`}
                    onClick={() => apagar.mutate(registro.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

/** O dia do GC como um cartão de toque: nome do dia em cima, data embaixo. */
function BotaoDeDia({
  dia,
  escolhido,
  indisponivel,
  onEscolher,
}: {
  dia: string
  escolhido: boolean
  indisponivel?: boolean
  onEscolher: (dia: string) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={escolhido}
      disabled={indisponivel}
      onClick={() => onEscolher(dia)}
      className={cn(
        'rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40',
        escolhido
          ? 'border-primary bg-primary-soft text-accent-foreground'
          : 'border-input hover:bg-secondary',
      )}
    >
      <span className="block text-sm font-medium capitalize">{weekdayShort(dia)}</span>
      <span className={cn('block text-xs', escolhido ? 'opacity-80' : 'text-muted-foreground')}>
        {formatDate(dia)}
      </span>
    </button>
  )
}

function marcasIniciais(encontro: Encontro): Record<string, Marcacao> {
  const inicial: Record<string, Marcacao> = {}
  for (const pessoa of encontro.integrantes) {
    inicial[chaveDe('integrante', pessoa.id)] = {
      marca: pessoa.marca,
      justificativa: pessoa.justificativa ?? '',
    }
  }
  for (const visitante of encontro.visitantes) {
    inicial[chaveDe('visitante', visitante.id)] = { marca: visitante.marca, justificativa: '' }
  }
  return inicial
}

function PresencaDoDia({
  quando,
  encontro,
  editavel,
}: {
  quando: string
  encontro: Encontro
  editavel: boolean
}) {
  const salvar = useSaveAttendance()
  const [marcas, setMarcas] = React.useState(() => marcasIniciais(encontro))
  const [anotacao, setAnotacao] = React.useState(encontro.anotacao ?? '')

  const marcar = (chave: Chave, marca: AttendanceMark) =>
    setMarcas((atual) => ({
      ...atual,
      [chave]: { marca, justificativa: atual[chave]?.justificativa ?? '' },
    }))

  const justificar = (chave: Chave, texto: string) =>
    setMarcas((atual) => ({
      ...atual,
      [chave]: { marca: atual[chave]?.marca ?? 'justificado', justificativa: texto },
    }))

  const todosComo = (marca: AttendanceMark) =>
    setMarcas((atual) =>
      Object.fromEntries(
        Object.entries(atual).map(([chave, valor]) => [chave, { ...valor, marca }]),
      ),
    )

  const contagem = React.useMemo(() => {
    const entradas = Object.entries(marcas)
    const integrantes = entradas.filter(([chave]) => chave.startsWith('integrante:'))
    return {
      presentes: integrantes.filter(([, v]) => v.marca === 'presente').length,
      justificados: integrantes.filter(([, v]) => v.marca === 'justificado').length,
      ausentes: integrantes.filter(([, v]) => v.marca === 'ausente').length,
      visitantes: entradas.filter(
        ([chave, v]) => chave.startsWith('visitante:') && v.marca === 'presente',
      ).length,
      elenco: integrantes.length,
    }
  }, [marcas])

  /** Antes do primeiro toque, "33 faltaram" seria uma acusação sem encontro. */
  const intocada = !encontro.id && contagem.presentes === 0 && contagem.justificados === 0

  /** Só o que aconteceu: "0 faltaram" ocupa a linha sem dizer nada. */
  const resumo = [
    contagem.justificados > 0 && plural(contagem.justificados, 'avisou', 'avisaram'),
    contagem.ausentes > 0 && plural(contagem.ausentes, 'faltou', 'faltaram'),
    contagem.visitantes > 0 && plural(contagem.visitantes, 'visitante', 'visitantes'),
  ]
    .filter(Boolean)
    .join(' · ')

  const enviar = () => {
    const payload: MarcaEnviada[] = Object.entries(marcas).map(([chave, valor]) => {
      const [tipo, id] = chave.split(':') as ['integrante' | 'visitante', string]
      return {
        tipo,
        id,
        marca: valor.marca,
        justificativa: valor.marca === 'justificado' ? valor.justificativa || null : null,
      }
    })
    salvar.mutate({ quando, marcas: payload, anotacao: anotacao.trim() || null })
  }

  return (
    <>
      {/* ------------------------------------------------------- a conta do dia
          Gruda no topo enquanto a lista rola: com 33 nomes, o número é a única
          forma de saber que está quase acabando sem voltar lá em cima. */}
      <div className="bg-background/95 sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 border-b px-4 py-2.5 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="font-display tabular text-xl leading-none font-bold">
            {contagem.presentes}
            <span className="text-muted-foreground text-sm font-medium"> de {contagem.elenco}</span>
          </p>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            {intocada ? 'Toque em quem veio' : resumo || 'Todo mundo veio'}
          </p>
        </div>

        {editavel && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => todosComo('presente')}>
              Todos vieram
            </Button>
            <Button variant="ghost" size="sm" onClick={() => todosComo('ausente')}>
              Limpar
            </Button>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- o elenco */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" aria-hidden />O GC
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-border divide-y">
            {encontro.integrantes.map((pessoa) => {
              const chave = chaveDe('integrante', pessoa.id)
              const atual = marcas[chave]
              return (
                <LinhaDePresenca
                  key={pessoa.id}
                  nome={pessoa.nomeCompleto}
                  foto={pessoa.foto}
                  marca={atual?.marca ?? 'ausente'}
                  justificativa={atual?.justificativa ?? ''}
                  editavel={editavel}
                  onMarcar={(marca) => marcar(chave, marca)}
                  onJustificar={(texto) => justificar(chave, texto)}
                />
              )
            })}
          </ul>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- os visitantes */}
      {encontro.visitantes.length > 0 && (
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="size-4" aria-hidden />
              Visitantes
            </CardTitle>
            <CardDescription>
              Eles não entram no rodízio de cuidado — mas estiveram na sala, e isso conta.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {encontro.visitantes.map((visitante) => {
                const chave = chaveDe('visitante', visitante.id)
                return (
                  <LinhaDePresenca
                    key={visitante.id}
                    nome={visitante.nome}
                    detalhe={`Visitou em ${formatDate(visitante.primeiraVisita)}`}
                    marca={marcas[chave]?.marca ?? 'ausente'}
                    justificativa=""
                    editavel={editavel}
                    semJustificativa
                    onMarcar={(marca) => marcar(chave, marca)}
                    onJustificar={() => {}}
                  />
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {editavel && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <Field
              label="Anotação do encontro"
              htmlFor="anotacao-encontro"
              hint="O que foi a noite: o tema da talk, quem trouxe o lanche, o que valeu registrar."
            >
              <Textarea
                id="anotacao-encontro"
                rows={2}
                value={anotacao}
                onChange={(evento) => setAnotacao(evento.target.value)}
              />
            </Field>

            <Button className="w-full" loading={salvar.isPending} onClick={enviar}>
              <CalendarCheck aria-hidden />
              {encontro.id ? 'Salvar correções' : 'Registrar presença'}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}

/**
 * Uma pessoa por linha: nome à esquerda, as três marcas à direita.
 *
 * As marcas são um seletor só, com as divisórias por dentro — três botões
 * soltos viravam três caixas por pessoa, e trinta e três pessoas viravam uma
 * tela de rolar sem fim. Quando a largura não dá, o seletor cai para a linha
 * de baixo em vez de espremer o nome até "A…".
 */
function LinhaDePresenca({
  nome,
  detalhe,
  foto,
  marca,
  justificativa,
  editavel,
  semJustificativa,
  onMarcar,
  onJustificar,
}: {
  nome: string
  detalhe?: string
  foto?: string | null
  marca: AttendanceMark
  justificativa: string
  editavel: boolean
  semJustificativa?: boolean
  onMarcar: (marca: AttendanceMark) => void
  onJustificar: (texto: string) => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2">
      <Person
        name={nome}
        detail={detalhe}
        photo={foto}
        size="sm"
        className="min-w-[8rem] flex-1 gap-2"
      />

      <div
        className="border-input flex shrink-0 overflow-hidden rounded-lg border"
        role="radiogroup"
        aria-label={`Presença de ${nome}`}
      >
        {MARCAS.map((opcao, indice) => {
          const escolhido = marca === opcao
          return (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={escolhido}
              title={attendanceHint[opcao]}
              disabled={!editavel}
              onClick={() => onMarcar(opcao)}
              className={cn(
                'min-h-11 px-2 text-[11px] font-medium transition-colors disabled:opacity-60',
                indice > 0 && 'border-input border-l',
                escolhido && opcao === 'presente' && 'bg-success/18 text-success',
                escolhido && opcao === 'justificado' && 'bg-warning/20 text-foreground',
                escolhido && opcao === 'ausente' && 'bg-secondary text-foreground',
                !escolhido && 'text-muted-foreground hover:bg-secondary',
              )}
            >
              {attendanceLabel[opcao]}
            </button>
          )
        })}
      </div>

      {/* O motivo só é perguntado de quem avisou: é a informação que separa
          uma viagem de um afastamento, e ela se perde se não for escrita agora. */}
      {marca === 'justificado' && !semJustificativa && (
        <Input
          className="h-10 w-full text-sm"
          placeholder="Motivo (opcional): viagem, trabalho, doente…"
          value={justificativa}
          disabled={!editavel}
          aria-label={`Motivo da ausência de ${nome}`}
          onChange={(evento) => onJustificar(evento.target.value)}
        />
      )}
    </li>
  )
}
