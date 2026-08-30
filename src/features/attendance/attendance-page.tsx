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
} from '@/lib/date'
import { attendanceHint, attendanceLabel } from '@/lib/labels'
import type { AttendanceMark } from '@/types/database'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/common/page-header'
import { Person } from '@/components/common/person'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const MARCAS: AttendanceMark[] = ['presente', 'justificado', 'ausente']

/** Cada linha da chamada, identificada de um jeito que não colide entre listas. */
type Chave = `${'integrante' | 'visitante'}:${string}`
interface Marcacao {
  marca: AttendanceMark
  justificativa: string
}

const chaveDe = (tipo: 'integrante' | 'visitante', id: string): Chave => `${tipo}:${id}`

/**
 * A chamada do fim do GC.
 *
 * A tela nasce no último dia de encontro que já passou — quinta, quase sempre;
 * sexta quando o GC foi movido. Todo mundo começa em "faltou" e a liderança
 * marca quem apareceu: é o caminho mais curto quando 21 de 33 vieram, e é o
 * único que não confunde "não veio" com "não terminei de preencher".
 *
 * Salvar de novo no mesmo dia corrige a chamada. Quem chegou atrasado e foi
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
    <div className="space-y-5">
      <PageHeader
        title="Presença"
        description={`O GC é toda ${weekdayName(diaDoGc)}. Quando ele muda de dia, a chamada acompanha.`}
      />

      {/* ------------------------------------------------------ o dia da chamada */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field
            label="Dia do encontro"
            htmlFor="dia-do-encontro"
            hint={
              dados?.id
                ? `Registrado em ${formatDateTime(dados.registradoEm)}${
                    dados.registradoPor ? ` por ${dados.registradoPor}` : ''
                  }.`
                : 'Ainda não há chamada para este dia.'
            }
          >
            <Input
              id="dia-do-encontro"
              type="date"
              max={todayISO()}
              value={quando}
              onChange={(evento) => setQuando(evento.target.value)}
            />
          </Field>

          {/* Os dois dias em que o GC de fato acontece, a um toque. O campo de
              data continua ali para o resto — mas o resto é exceção. */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={quando === diaDoGc ? 'default' : 'outline'}
              onClick={() => setQuando(diaDoGc)}
            >
              {weekdayName(diaDoGc)}, {formatDate(diaDoGc)}
            </Button>
            <Button
              variant={quando === diaSeguinte ? 'default' : 'outline'}
              disabled={diaSeguinte > todayISO()}
              onClick={() => setQuando(diaSeguinte)}
            >
              {weekdayName(diaSeguinte)}, {formatDate(diaSeguinte)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {encontro.isLoading && <CardListSkeleton rows={4} />}
      {encontro.isError && <ErrorState error={encontro.error} onRetry={() => encontro.refetch()} />}

      {/* A chamada de cada dia é uma folha em branco própria: trocar de data
          remonta o componente, para nenhuma marca do dia anterior sobreviver. */}
      {dados && <ChamadaDoDia key={quando} quando={quando} encontro={dados} editavel={isLeader} />}

      {/* --------------------------------------------------- os encontros anteriores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" aria-hidden />
            Encontros anteriores
          </CardTitle>
          <CardDescription>Toque em um deles para abrir ou corrigir a chamada.</CardDescription>
        </CardHeader>
        <CardContent>
          {encontros.isSuccess && encontros.data.length === 0 && (
            <EmptyState
              icon={CalendarCheck}
              title="Nenhuma chamada registrada ainda"
              description="A primeira que você salvar aparece aqui, com os números do dia."
            />
          )}

          <ul className="space-y-2">
            {encontros.data?.map((registro) => (
              <li
                key={registro.id}
                className={cn(
                  'border-border flex flex-wrap items-center gap-3 rounded-lg border p-3',
                  registro.quando === quando && 'border-primary',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setQuando(registro.quando)}
                >
                  <span className="block text-sm font-medium">
                    {weekdayName(registro.quando)}, {formatDate(registro.quando)}
                  </span>
                  {registro.anotacao && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {registro.anotacao}
                    </span>
                  )}
                </button>

                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="success">{registro.presentes} vieram</Badge>
                  {registro.justificados > 0 && (
                    <Badge variant="neutral">{registro.justificados} avisaram</Badge>
                  )}
                  {registro.ausentes > 0 && (
                    <Badge variant="outline">{registro.ausentes} faltaram</Badge>
                  )}
                  {registro.visitantes > 0 && (
                    <Badge variant="info">{registro.visitantes} visitante(s)</Badge>
                  )}
                </span>

                {isLeader && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Apagar a chamada de ${formatDate(registro.quando)}`}
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

function ChamadaDoDia({
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
      {/* ------------------------------------------------------- a conta do dia */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="font-display tabular text-3xl font-bold">
              {contagem.presentes}
              <span className="text-muted-foreground text-lg font-medium">
                {' '}
                de {contagem.elenco}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              {contagem.justificados} avisaram · {contagem.ausentes} faltaram
              {contagem.visitantes > 0 && ` · ${contagem.visitantes} visitante(s)`}
            </p>
          </div>

          {editavel && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => todosComo('presente')}>
                Todos vieram
              </Button>
              <Button variant="outline" size="sm" onClick={() => todosComo('ausente')}>
                Limpar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- o elenco */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" aria-hidden />O GC
          </CardTitle>
          <CardDescription>Toque em quem esteve no encontro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {encontro.integrantes.map((pessoa) => {
            const chave = chaveDe('integrante', pessoa.id)
            const atual = marcas[chave]
            return (
              <LinhaDaChamada
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
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- os visitantes */}
      {encontro.visitantes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="size-4" aria-hidden />
              Visitantes
            </CardTitle>
            <CardDescription>
              Eles não entram no rodízio de cuidado — mas estiveram na sala, e isso conta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {encontro.visitantes.map((visitante) => {
              const chave = chaveDe('visitante', visitante.id)
              return (
                <LinhaDaChamada
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
          </CardContent>
        </Card>
      )}

      {editavel && (
        <Card>
          <CardContent className="space-y-4 p-4">
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
              {encontro.id ? 'Salvar correções' : 'Registrar chamada'}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function LinhaDaChamada({
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
    <div className="border-border rounded-lg border p-3">
      {/* No celular o nome fica em cima e os três botões embaixo: lado a lado,
          eles espremiam o nome até "A…" - e uma chamada em que não dá para ler
          de quem é a linha não é uma chamada. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Person name={nome} detail={detalhe} photo={foto} size="sm" className="min-w-0 sm:flex-1" />

        <div
          className="grid grid-cols-3 gap-1 sm:flex sm:shrink-0"
          role="radiogroup"
          aria-label={`Presença de ${nome}`}
        >
          {MARCAS.map((opcao) => {
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
                  'min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60',
                  escolhido && opcao === 'presente' && 'border-success bg-success/15 text-success',
                  escolhido && opcao === 'justificado' && 'border-warning bg-warning/18',
                  escolhido && opcao === 'ausente' && 'border-input bg-secondary',
                  !escolhido && 'text-muted-foreground hover:bg-secondary',
                )}
              >
                {attendanceLabel[opcao]}
              </button>
            )
          })}
        </div>
      </div>

      {/* O motivo só é perguntado de quem avisou: é a informação que separa
          uma viagem de um afastamento, e ela se perde se não for escrita agora. */}
      {marca === 'justificado' && !semJustificativa && (
        <Input
          className="mt-2"
          placeholder="Motivo (opcional): viagem, trabalho, doente…"
          value={justificativa}
          disabled={!editavel}
          aria-label={`Motivo da ausência de ${nome}`}
          onChange={(evento) => onJustificar(evento.target.value)}
        />
      )}
    </div>
  )
}
