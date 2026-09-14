import { addDays } from '@/lib/date'
import type { CareWeek } from '@/types/database'

export interface PlanoDaSemana {
  inicio: string
  fim: string
  /**
   * A semana com o mesmo início: rascunho é gerado de novo; publicada ou
   * encerrada é refeita, se ninguém registrou cuidado nela (quem confere é o
   * banco — a lista de semanas não sabe disso).
   */
  refaz: CareWeek | null
  /** A semana publicada logo depois, que faz esta terminar na véspera dela. */
  limitadaPor: CareWeek | null
  /** A semana que ainda estaria valendo neste dia e termina na véspera desta. */
  encurta: CareWeek | null
}

/**
 * O que acontece se a semana começar em `inicio`.
 *
 * É a mesma regra de `app.fim_da_semana`, no
 * banco — lá ela decide, aqui ela só avisa antes. A tela precisa dizer "a
 * semana de 7 a 13 vai terminar no dia 13" *antes* do toque, não descobrir
 * depois.
 *
 * Rascunho não limita o fim nem é encurtado: rascunho esquecido perde a vez.
 * A única regra que depende de dado que a lista não tem — se a semana já tem
 * cuidado registrado — fica com o banco (`app.bloqueio_para_iniciar`).
 */
export function planejarSemana(inicio: string, semanas: CareWeek[]): PlanoDaSemana {
  const oficiais = semanas.filter((semana) => semana.status !== 'draft')

  const refaz = semanas.find((semana) => semana.starts_on === inicio) ?? null

  const limitadaPor =
    oficiais
      .filter((semana) => semana.starts_on > inicio)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ?? null

  const seteDias = addDays(inicio, 6)
  const vespera = limitadaPor ? addDays(limitadaPor.starts_on, -1) : null
  const fim = vespera && vespera < seteDias ? vespera : seteDias

  const encurta =
    oficiais.find(
      (semana) => semana.starts_on < inicio && semana.ends_on >= inicio && semana.id !== refaz?.id,
    ) ?? null

  return {
    inicio,
    fim,
    refaz,
    limitadaPor: vespera && vespera < seteDias ? limitadaPor : null,
    encurta,
  }
}

/**
 * A semana publicada (ou encerrada) que cobre o dia — a que o GC vê na home.
 *
 * Semana encerrada antes do primeiro dia não conta: ela nunca valeu, e dizer
 * que ela "cobre hoje" esconderia justamente o aviso de que o GC está sem lista.
 */
export function semanaDoDia(semanas: CareWeek[], dia: string): CareWeek | null {
  return (
    semanas
      .filter((semana) => semana.status !== 'draft')
      .filter(
        (semana) =>
          !(
            semana.status === 'closed' &&
            semana.closed_at &&
            semana.closed_at.slice(0, 10) < semana.starts_on
          ),
      )
      .filter((semana) => semana.starts_on <= dia && dia <= semana.ends_on)
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0] ?? null
  )
}
