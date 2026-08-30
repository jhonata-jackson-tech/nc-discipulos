/**
 * Datas do produto.
 *
 * O banco guarda tudo em UTC; a interface fala sempre em America/Sao_Paulo,
 * o fuso do GC. A semana de cuidado comeca na segunda-feira.
 */
const TIME_ZONE = 'America/Sao_Paulo'

export const WEEK_STARTS_ON = 1 // segunda-feira

/** "Hoje" no fuso do GC, como YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function parseISODate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`)
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Segunda-feira da semana que contem a data informada. */
export function startOfWeek(iso: string = todayISO()): string {
  const date = parseISODate(iso)
  const weekday = date.getUTCDay() // 0 = domingo
  const diff = (weekday - WEEK_STARTS_ON + 7) % 7
  return addDays(iso, -diff)
}

export function endOfWeek(iso: string = todayISO()): string {
  return addDays(startOfWeek(iso), 6)
}

/**
 * O ultimo dia de encontro que ja aconteceu - hoje, se hoje for ele.
 *
 * O GC e na quinta. Na sexta de manha, a chamada que a lideranca quer abrir e
 * a de ontem; na quarta, a da quinta passada. Uma data que sempre nasce certa
 * evita o erro mais caro dessa tela: registrar a presenca no dia errado.
 */
export function lastWeekdayOn(weekday: number, from: string = todayISO()): string {
  const diff = (parseISODate(from).getUTCDay() - weekday + 7) % 7
  return addDays(from, -diff)
}

/** "quinta-feira" - o dia da semana por extenso, no fuso do GC. */
export function weekdayName(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, weekday: 'long' }).format(
    parseISODate(iso),
  )
}

export function formatDate(iso: string | null | undefined, style: 'short' | 'long' = 'short') {
  if (!iso) return '--'
  const date = iso.length === 10 ? parseISODate(iso) : new Date(iso)
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: style === 'long' ? 'long' : '2-digit',
    year: style === 'long' ? 'numeric' : '2-digit',
  }).format(date)
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/** "18 a 24 de agosto" - usado no cabecalho de "Minha semana". */
export function formatWeekRange(startsOn: string, endsOn: string): string {
  const start = parseISODate(startsOn)
  const end = parseISODate(endsOn)
  const day = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: 'numeric' }).format(d)
  const month = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, month: 'long' }).format(d)

  return month(start) === month(end)
    ? `${day(start)} a ${day(end)} de ${month(end)}`
    : `${day(start)} de ${month(start)} a ${day(end)} de ${month(end)}`
}

/** Distancia em dias, positiva no futuro. */
export function daysUntil(value: string): number {
  const target = new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
  const today = parseISODate(todayISO())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function relativeDeadline(value: string | null | undefined): string | null {
  if (!value) return null
  const diff = daysUntil(value)
  if (diff < 0) return `atrasada ha ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'}`
  if (diff === 0) return 'para hoje'
  if (diff === 1) return 'para amanha'
  return `em ${diff} dias`
}

/** Aniversario dentro da janela informada, ignorando o ano. */
export function birthdayInWindow(birthDate: string, days = 14): boolean {
  const today = parseISODate(todayISO())
  const birth = parseISODate(birthDate)
  const next = new Date(
    Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate(), 12),
  )
  if (next.getTime() < today.getTime()) next.setUTCFullYear(next.getUTCFullYear() + 1)
  const diff = Math.round((next.getTime() - today.getTime()) / 86_400_000)
  return diff >= 0 && diff <= days
}
