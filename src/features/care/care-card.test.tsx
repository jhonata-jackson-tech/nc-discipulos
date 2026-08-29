import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CareCard } from './care-card'
import type { AssignmentWithPeople } from './use-care'
import type { Profile } from '@/types/database'

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    user_id: null,
    full_name: 'Ana Flávia',
    display_name: null,
    photo_url: null,
    email: null,
    phone: null,
    birth_date: null,
    salutation: 'irma',
    care_gender: 'female',
    care_gender_confirmed_at: null,
    role: 'member',
    status: 'active',
    is_admin: false,
    deleted_at: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function assignment(overrides: Partial<AssignmentWithPeople> = {}): AssignmentWithPeople {
  return {
    id: 'a1',
    week_id: 'w1',
    caregiver_id: 'p2',
    cared_for_id: 'p1',
    origin: 'rotation',
    status: 'pending',
    attention_level: 'normal',
    previous_caregiver_id: null,
    transferred_at: null,
    last_contact_at: null,
    created_at: '2026-08-24T00:00:00Z',
    cared_for: profile(),
    caregiver: profile({ id: 'p2', full_name: 'Jenifer Messias', role: 'leader' }),
    ...overrides,
  }
}

describe('cartao de cuidado', () => {
  it('mostra a pessoa cuidada e a origem da atribuicao', () => {
    render(
      <CareCard
        assignment={assignment()}
        onContact={vi.fn()}
        onHistory={vi.fn()}
      />,
    )

    expect(screen.getByText('Ana Flávia')).toBeInTheDocument()
    expect(screen.getByText('Rodízio da semana')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
  })

  it('convida ao contato quando ainda esta pendente', async () => {
    const onContact = vi.fn()
    render(<CareCard assignment={assignment()} onContact={onContact} onHistory={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Marcar contato' }))
    expect(onContact).toHaveBeenCalledOnce()
  })

  it('muda o texto do botao depois do primeiro contato', () => {
    render(
      <CareCard
        assignment={assignment({ status: 'contacted', last_contact_at: '2026-08-25T12:00:00Z' })}
        onContact={vi.fn()}
        onHistory={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Registrar novo contato' })).toBeInTheDocument()
    expect(screen.getByText(/Último contato em/)).toBeInTheDocument()
  })

  it('destaca o cuidado que precisa da lideranca', () => {
    render(
      <CareCard
        assignment={assignment({ attention_level: 'leader_action', status: 'needs_attention' })}
        onContact={vi.fn()}
        onHistory={vi.fn()}
      />,
    )

    expect(screen.getByText('Liderança precisa agir')).toBeInTheDocument()
  })

  it('so oferece transferencia quando a acao existe', async () => {
    const onTransfer = vi.fn()
    render(
      <CareCard
        assignment={assignment()}
        onContact={vi.fn()}
        onTransfer={onTransfer}
        onHistory={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Ações para Ana Flávia' }))
    await userEvent.click(await screen.findByText('Transferir cuidado'))
    expect(onTransfer).toHaveBeenCalledOnce()
  })

  it('mostra o responsavel quando a lista e do GC inteiro', () => {
    render(
      <CareCard
        assignment={assignment()}
        showCaregiver
        onContact={vi.fn()}
        onHistory={vi.fn()}
      />,
    )

    expect(screen.getByText('Com Jenifer Messias')).toBeInTheDocument()
  })
})
