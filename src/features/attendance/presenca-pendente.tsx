import { Link } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { addDays, daysUntil, formatDate, lastWeekdayOn, weekdayName } from '@/lib/date'
import { useMeetings } from './use-attendance'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/** Depois disso, o lembrete vira ruído — a tela de Presença já mostra o buraco. */
const DIAS_DE_LEMBRETE = 3

/**
 * "A presença de quinta ainda não foi registrada."
 *
 * O aviso existe porque o custo de esquecer é assimétrico: registrar a
 * presença leva um minuto no fim do GC e é impossível de reconstruir uma
 * semana depois — ninguém lembra quem estava na sala.
 *
 * Ele conta a sexta como o mesmo encontro: quando o GC é movido por um
 * imprevisto, a presença de sexta resolve a quinta, e cobrar as duas seria
 * cobrar um GC que não houve.
 */
export function PresencaPendente() {
  const { group, isLeader } = useSession()
  const diaFixo = group?.meeting_weekday ?? 4
  const encontros = useMeetings(6)

  if (!isLeader || !encontros.isSuccess) return null

  const diaDoGc = lastWeekdayOn(diaFixo)
  const diaSeguinte = addDays(diaDoGc, 1)

  const registrada = encontros.data.some(
    (encontro) => encontro.quando === diaDoGc || encontro.quando === diaSeguinte,
  )
  if (registrada) return null

  const diasDesde = -daysUntil(diaDoGc)
  if (diasDesde > DIAS_DE_LEMBRETE) return null

  return (
    <Alert variant="warning">
      <CalendarCheck aria-hidden />
      <div className="min-w-0 flex-1">
        <AlertTitle>
          A presença de {weekdayName(diaDoGc)}, {formatDate(diaDoGc)}, ainda não foi registrada
        </AlertTitle>
        <AlertDescription>
          Leva um minuto agora, e é impossível reconstruir daqui a uma semana.
        </AlertDescription>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to="/presenca">Registrar</Link>
      </Button>
    </Alert>
  )
}
