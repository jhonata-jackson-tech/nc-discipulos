import { describe, expect, it } from 'vitest'
import { planejarSemana, semanaDoDia } from './nova-semana'
import type { CareWeek, CareWeekStatus } from '@/types/database'

function semana(startsOn: string, endsOn: string, status: CareWeekStatus = 'published'): CareWeek {
  return {
    id: `${startsOn}-${status}`,
    group_id: 'gc',
    starts_on: startsOn,
    ends_on: endsOn,
    status,
    seed: 'x',
    generation_report: null,
    generated_at: null,
    published_at: null,
    closed_at: null,
    notes: null,
  }
}

describe('planejarSemana', () => {
  it('dura sete dias quando nada atrapalha', () => {
    const plano = planejarSemana('2026-09-14', [])
    expect(plano).toMatchObject({ inicio: '2026-09-14', fim: '2026-09-20', bloqueio: null })
  })

  it('refaz a semana publicada que começa no mesmo dia', () => {
    const publicada = semana('2026-09-14', '2026-09-20')
    const plano = planejarSemana('2026-09-14', [publicada, semana('2026-09-07', '2026-09-13')])
    expect(plano.refaz).toBe(publicada)
    expect(plano.encurta).toBeNull()
    expect(plano.fim).toBe('2026-09-20')
  })

  it('não deixa recomeçar uma semana encerrada', () => {
    const plano = planejarSemana('2026-09-07', [semana('2026-09-07', '2026-09-13', 'closed')])
    expect(plano.bloqueio).toContain('07/09')
  })

  it('começa no meio da semana e encurta a que estava valendo', () => {
    const valendo = semana('2026-09-14', '2026-09-20')
    const plano = planejarSemana('2026-09-17', [valendo])
    expect(plano.encurta).toBe(valendo)
    expect(plano.fim).toBe('2026-09-23')
  })

  it('termina na véspera da próxima semana publicada', () => {
    const proxima = semana('2026-09-21', '2026-09-27')
    const plano = planejarSemana('2026-09-17', [proxima])
    expect(plano.fim).toBe('2026-09-20')
    expect(plano.limitadaPor).toBe(proxima)
  })

  it('ignora rascunho esquecido na frente', () => {
    const plano = planejarSemana('2026-09-14', [semana('2026-09-17', '2026-09-23', 'draft')])
    expect(plano.fim).toBe('2026-09-20')
    expect(plano.limitadaPor).toBeNull()
  })

  it('não chama de limite uma semana que começa depois dos sete dias', () => {
    const plano = planejarSemana('2026-09-14', [semana('2026-09-28', '2026-10-04')])
    expect(plano.limitadaPor).toBeNull()
  })
})

describe('semanaDoDia', () => {
  it('prefere a mais recente quando duas cobrem o dia', () => {
    const antiga = semana('2026-09-07', '2026-09-13')
    const nova = semana('2026-09-10', '2026-09-16')
    expect(semanaDoDia([antiga, nova], '2026-09-11')).toBe(nova)
  })

  it('não conta rascunho', () => {
    expect(semanaDoDia([semana('2026-09-14', '2026-09-20', 'draft')], '2026-09-14')).toBeNull()
  })
})
