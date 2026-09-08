import { describe, expect, it } from 'vitest'
import { separarSemanas } from './semana-da-home'
import type { CareWeek } from '@/types/database'

function semana(startsOn: string, endsOn: string): CareWeek {
  return {
    id: startsOn,
    group_id: 'gc',
    starts_on: startsOn,
    ends_on: endsOn,
    status: 'published',
    seed: 'x',
    generation_report: null,
    generated_at: null,
    published_at: null,
    closed_at: null,
    notes: null,
  }
}

// Da mais recente para a mais antiga, como o banco devolve.
const proxima = semana('2026-09-14', '2026-09-20')
const atual = semana('2026-09-07', '2026-09-13')
const passada = semana('2026-08-31', '2026-09-06')

describe('separarSemanas', () => {
  it('escolhe a semana que contem hoje, mesmo com a proxima ja publicada', () => {
    const { atual: escolhida, proxima: futura } = separarSemanas(
      [proxima, atual, passada],
      '2026-09-07',
    )
    expect(escolhida).toBe(atual)
    expect(futura).toBe(proxima)
  })

  it('nao promove a semana encerrada quando a corrente nao existe', () => {
    const resultado = separarSemanas([proxima, passada], '2026-09-07')
    expect(resultado.atual).toBeNull()
    expect(resultado.encerrada).toBe(passada)
    expect(resultado.proxima).toBe(proxima)
  })

  it('aponta a mais proxima entre varias semanas futuras', () => {
    const distante = semana('2026-09-21', '2026-09-27')
    expect(separarSemanas([distante, proxima, passada], '2026-09-07').proxima).toBe(proxima)
  })

  it('vale ate o ultimo dia da semana', () => {
    expect(separarSemanas([proxima, atual], '2026-09-13').atual).toBe(atual)
    expect(separarSemanas([proxima, atual], '2026-09-14').atual).toBe(proxima)
  })

  it('devolve tudo vazio quando o GC ainda nao tem semana', () => {
    expect(separarSemanas([], '2026-09-07')).toEqual({
      atual: null,
      encerrada: null,
      proxima: null,
    })
  })
})
