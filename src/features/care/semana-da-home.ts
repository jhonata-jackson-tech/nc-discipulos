import type { CareWeek } from '@/types/database'

export interface SemanaDaHome {
  /** A semana que cobre hoje - a unica que pode ser chamada de "esta semana". */
  atual: CareWeek | null
  /** A ultima semana que ja terminou, quando nao ha semana cobrindo hoje. */
  encerrada: CareWeek | null
  /** A proxima semana ja publicada, quando ela ainda nao comecou. */
  proxima: CareWeek | null
}

/**
 * Semana encerrada antes do primeiro dia: ela nunca valeu.
 *
 * Acontece quando a lideranca gera a semana errada, publica e encerra minutos
 * depois para gerar a certa. Tratada como "esta semana", ela aparecia na home
 * de todo mundo com a lista abandonada - e em 14/09 recebeu um cuidado de
 * verdade, que passou a travar o recomeco da semana certa.
 */
export function nuncaValeu(semana: CareWeek): boolean {
  return (
    semana.status === 'closed' &&
    Boolean(semana.closed_at) &&
    semana.closed_at!.slice(0, 10) < semana.starts_on
  )
}

/**
 * Separa as semanas do GC em torno de hoje.
 *
 * "Esta semana" e a que contem hoje - nada mais. Uma semana que ja terminou
 * nao pode ocupar esse lugar: quando a lideranca gera a distribuicao na propria
 * segunda, a semana corrente fica sem cuidado nenhum, e mostrar a anterior como
 * se fosse a de agora faz o GC inteiro trabalhar com a lista velha.
 *
 * Espera a lista ordenada da mais recente para a mais antiga - a mesma ordem em
 * que o banco devolve.
 */
export function separarSemanas(todas: CareWeek[], hoje: string): SemanaDaHome {
  const semanas = todas.filter((semana) => !nuncaValeu(semana))
  return {
    atual: semanas.find((semana) => semana.starts_on <= hoje && hoje <= semana.ends_on) ?? null,
    encerrada: semanas.find((semana) => semana.ends_on < hoje) ?? null,
    // Da mais recente para a mais antiga: a proxima e a ultima das que ainda
    // nao comecaram.
    proxima: semanas.filter((semana) => semana.starts_on > hoje).at(-1) ?? null,
  }
}
