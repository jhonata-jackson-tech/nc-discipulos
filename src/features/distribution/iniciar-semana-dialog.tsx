import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarPlus, Info, Lock, RotateCcw } from 'lucide-react'
import { db } from '@/lib/db'
import { addDays, formatWeekRange, startOfWeek, todayISO, weekdayShort } from '@/lib/date'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Field } from '@/components/ui/field'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CareWeek } from '@/types/database'
import { planejarSemana } from './nova-semana'

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Quantos cuidados já foram registrados numa semana publicada.
 *
 * É o que separa "refazer uma lista que ninguém usou" de "apagar o trabalho de
 * alguém". O banco recusa o segundo de qualquer jeito; perguntar antes é o que
 * permite a tela dizer isso no lugar de um erro depois do toque.
 */
function useCuidadosRegistrados(weekId: string | undefined) {
  return useQuery({
    queryKey: ['cuidados-registrados', weekId],
    enabled: Boolean(weekId),
    queryFn: async () => {
      const { count, error } = await db
        .from('care_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('week_id', weekId!)
        .not('last_contact_at', 'is', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

/**
 * Começar a semana no dia em que a liderança está.
 *
 * A semana deixou de ser "a atual" ou "a próxima segunda": é um dia escolhido,
 * com os dois atalhos que cobrem quase todo uso. O que importa nesta tela é o
 * que vem embaixo da data — o que vai acontecer com as outras semanas — dito
 * antes do toque, com as datas escritas.
 */
export function IniciarSemanaDialog({
  open,
  onOpenChange,
  semanas,
  diaInicial,
  gerando,
  bloqueadoPorGenero,
  onGerar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  semanas: CareWeek[]
  diaInicial?: string
  gerando: boolean
  bloqueadoPorGenero: boolean
  onGerar: (startsOn: string) => void
}) {
  const hoje = todayISO()
  const proximaSegunda = startOfWeek(addDays(hoje, 7))
  const [dia, setDia] = React.useState(diaInicial ?? hoje)

  const plano = planejarSemana(dia, semanas)
  const refazPublicada = plano.refaz?.status === 'published' ? plano.refaz : null
  const registrados = useCuidadosRegistrados(open ? refazPublicada?.id : undefined)
  const temTrabalho = (registrados.data ?? 0) > 0

  const atalhos = [
    { rotulo: `Hoje · ${weekdayShort(hoje)}, ${ddmm(hoje)}`, valor: hoje },
    ...(proximaSegunda !== hoje
      ? [{ rotulo: `Próxima segunda · ${ddmm(proximaSegunda)}`, valor: proximaSegunda }]
      : []),
  ]

  const impedido =
    !dia || Boolean(plano.bloqueio) || temTrabalho || registrados.isLoading || bloqueadoPorGenero

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Iniciar semana</DialogTitle>
          <DialogDescription>
            A semana dura sete dias a partir do dia escolhido. Primeiro sai um rascunho: ninguém é
            avisado até você publicar.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-wrap gap-2">
            {atalhos.map((atalho) => (
              <Button
                key={atalho.valor}
                type="button"
                size="sm"
                variant={dia === atalho.valor ? 'default' : 'outline'}
                onClick={() => setDia(atalho.valor)}
              >
                {atalho.rotulo}
              </Button>
            ))}
          </div>

          <Field label="Começa em" htmlFor="inicio-semana">
            <DateInput
              id="inicio-semana"
              value={dia}
              onChange={(evento) => setDia(evento.target.value)}
            />
          </Field>

          {dia && (
            <div className="bg-secondary/60 rounded-lg px-4 py-3">
              <p className="text-muted-foreground text-xs font-medium">A semana vai de</p>
              <p className="font-display text-lg font-semibold">
                {formatWeekRange(plano.inicio, plano.fim)}
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {plano.bloqueio && (
              <Aviso icone={Lock} tom="perigo">
                {plano.bloqueio}
              </Aviso>
            )}

            {refazPublicada && temTrabalho && (
              <Aviso icone={Lock} tom="perigo">
                A semana de {formatWeekRange(refazPublicada.starts_on, refazPublicada.ends_on)} já
                tem {registrados.data} cuidado(s) registrado(s) e não pode ser refeita. Para trocar
                quem cuida de quem, use o remanejamento.
              </Aviso>
            )}

            {refazPublicada && !temTrabalho && !registrados.isLoading && (
              <Aviso icone={RotateCcw} tom="atencao">
                A semana de {formatWeekRange(refazPublicada.starts_on, refazPublicada.ends_on)} já
                está publicada, mas ninguém registrou cuidado nela. Ela volta a ser rascunho e é
                refeita com o histórico de agora — até você publicar de novo, a home do GC fica sem
                lista.
              </Aviso>
            )}

            {plano.refaz?.status === 'draft' && (
              <Aviso icone={RotateCcw}>
                Já existe um rascunho para este dia. Ele é gerado de novo.
              </Aviso>
            )}

            {plano.limitadaPor && (
              <Aviso icone={Info}>
                Termina em {ddmm(plano.fim)}, na véspera da semana de{' '}
                {formatWeekRange(plano.limitadaPor.starts_on, plano.limitadaPor.ends_on)}, que já
                está publicada.
              </Aviso>
            )}

            {plano.encurta && (
              <Aviso icone={Info}>
                {plano.encurta.status === 'published' ? (
                  <>
                    Ao publicar, a semana de{' '}
                    {formatWeekRange(plano.encurta.starts_on, plano.encurta.ends_on)} passa a
                    terminar em {ddmm(addDays(dia, -1))}
                    {dia <= hoje
                      ? ' e é encerrada na hora — o relatório dela chega para a liderança.'
                      : '. O relatório dela chega quando ela terminar.'}
                  </>
                ) : (
                  <>
                    A semana encerrada de{' '}
                    {formatWeekRange(plano.encurta.starts_on, plano.encurta.ends_on)} passa a
                    terminar em {ddmm(addDays(dia, -1))}.
                  </>
                )}
              </Aviso>
            )}

            {bloqueadoPorGenero && (
              <Aviso icone={AlertTriangle} tom="atencao">
                Confirme o gênero de cuidado de todos os integrantes antes de gerar.
              </Aviso>
            )}
          </ul>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={impedido} loading={gerando} onClick={() => onGerar(dia)}>
            <CalendarPlus aria-hidden />
            Gerar rascunho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Aviso({
  icone: Icone,
  tom,
  children,
}: {
  icone: typeof Info
  tom?: 'atencao' | 'perigo'
  children: React.ReactNode
}) {
  return (
    <li>
      <Alert
        variant={tom === 'perigo' ? 'danger' : tom === 'atencao' ? 'warning' : 'info'}
        className="py-2.5"
      >
        <Icone aria-hidden />
        <AlertDescription className="text-pretty">{children}</AlertDescription>
      </Alert>
    </li>
  )
}
