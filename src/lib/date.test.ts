import { describe, expect, it } from 'vitest'
import {
  addDays,
  birthdayInWindow,
  endOfWeek,
  formatDate,
  formatWeekRange,
  lastWeekdayOn,
  relativeDeadline,
  startOfWeek,
  todayISO,
  weekdayName,
} from './date'

describe('semana de cuidado', () => {
  it('comeca sempre na segunda-feira', () => {
    // 2026-08-26 e uma quarta-feira.
    expect(startOfWeek('2026-08-26')).toBe('2026-08-24')
    expect(endOfWeek('2026-08-26')).toBe('2026-08-30')
  })

  it('mantem a segunda-feira quando ja e segunda', () => {
    expect(startOfWeek('2026-08-24')).toBe('2026-08-24')
  })

  it('trata o domingo como fim da semana anterior', () => {
    expect(startOfWeek('2026-08-23')).toBe('2026-08-17')
  })

  it('anda entre semanas sem escorregar no fuso', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('o dia do encontro do GC', () => {
  // 2026-08-27 e uma quinta-feira; 4 = quinta.
  it('devolve o proprio dia quando hoje e o dia do GC', () => {
    expect(lastWeekdayOn(4, '2026-08-27')).toBe('2026-08-27')
  })

  it('na sexta, ainda aponta para a quinta que acabou de passar', () => {
    // E o caso que mais importa: quem abre a presenca na manha seguinte quer a
    // de ontem, nao a da semana que vem.
    expect(lastWeekdayOn(4, '2026-08-28')).toBe('2026-08-27')
  })

  it('na quarta, aponta para a quinta anterior', () => {
    expect(lastWeekdayOn(4, '2026-09-02')).toBe('2026-08-27')
  })

  it('acompanha um GC que mude de dia', () => {
    // Se o grupo passar a se reunir na terca (2), a conta continua valendo.
    expect(lastWeekdayOn(2, '2026-08-27')).toBe('2026-08-25')
  })

  it('escreve o dia da semana por extenso', () => {
    expect(weekdayName('2026-08-27')).toBe('quinta-feira')
    expect(weekdayName('2026-08-28')).toBe('sexta-feira')
  })
})

describe('apresentacao de datas em pt-BR', () => {
  it('formata o intervalo dentro do mesmo mes', () => {
    expect(formatWeekRange('2026-08-24', '2026-08-30')).toBe('24 a 30 de agosto')
  })

  it('formata o intervalo que atravessa dois meses', () => {
    expect(formatWeekRange('2026-08-31', '2026-09-06')).toBe('31 de agosto a 6 de setembro')
  })

  it('usa o formato brasileiro de data', () => {
    expect(formatDate('2026-08-24')).toBe('24/08/26')
    expect(formatDate('2026-08-24', 'long')).toBe('24 de agosto de 2026')
  })

  it('mostra um traco quando nao ha data', () => {
    expect(formatDate(null)).toBe('--')
  })
})

describe('prazos', () => {
  it('descreve o prazo em linguagem simples', () => {
    expect(relativeDeadline(todayISO())).toBe('para hoje')
    expect(relativeDeadline(addDays(todayISO(), 1))).toBe('para amanha')
    expect(relativeDeadline(addDays(todayISO(), 4))).toBe('em 4 dias')
    expect(relativeDeadline(addDays(todayISO(), -2))).toBe('atrasada ha 2 dias')
  })

  it('devolve nulo sem prazo definido', () => {
    expect(relativeDeadline(null)).toBeNull()
  })
})

describe('aniversarios', () => {
  it('encontra o aniversario proximo ignorando o ano de nascimento', () => {
    const soon = addDays(todayISO(), 3)
    const birth = `1995-${soon.slice(5)}`
    expect(birthdayInWindow(birth, 10)).toBe(true)
  })

  it('ignora quem esta fora da janela', () => {
    const far = addDays(todayISO(), 40)
    const birth = `1995-${far.slice(5)}`
    expect(birthdayInWindow(birth, 10)).toBe(false)
  })
})
