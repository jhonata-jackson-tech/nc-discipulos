import { describe, expect, it } from 'vitest'
import { needsSetup } from './needs-setup'
import type { Group, Profile } from '@/types/database'

const grupo = (setupCompletedAt: string | null) =>
  ({ setup_completed_at: setupCompletedAt }) as Group

function pessoa(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    user_id: null,
    full_name: 'Alguém',
    display_name: null,
    photo_url: null,
    email: null,
    phone: null,
    birth_date: null,
    salutation: null,
    care_gender: 'male',
    care_gender_confirmed_at: null,
    role: 'member',
    status: 'active',
    deleted_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('assistente de primeiros passos', () => {
  it('aparece enquanto houver participante ativo sem gênero de cuidado', () => {
    const membros = [pessoa(), pessoa({ id: 'p2', care_gender: null })]
    expect(needsSetup(grupo(null), membros)).toBe(true)
  })

  it('some quando todos estão confirmados', () => {
    expect(needsSetup(grupo(null), [pessoa(), pessoa({ id: 'p2' })])).toBe(false)
  })

  it('não volta depois que a liderança conclui a configuração', () => {
    const membros = [pessoa({ care_gender: null })]
    expect(needsSetup(grupo('2026-08-20T12:00:00Z'), membros)).toBe(false)
  })

  it('ignora quem está inativo', () => {
    const membros = [pessoa({ care_gender: null, status: 'inactive' })]
    expect(needsSetup(grupo(null), membros)).toBe(false)
  })

  it('ignora supervisores, que não entram no rodízio comum', () => {
    const membros = [pessoa({ role: 'supervisor', care_gender: null })]
    expect(needsSetup(grupo(null), membros)).toBe(false)
  })

  it('não decide nada antes de os dados chegarem', () => {
    expect(needsSetup(grupo(null), undefined)).toBe(false)
    expect(needsSetup(null, [pessoa({ care_gender: null })])).toBe(false)
  })
})
