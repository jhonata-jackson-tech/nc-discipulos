import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarRange,
  DoorOpen,
  HeartHandshake,
  House,
  ListChecks,
  MessagesSquare,
  Shuffle,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppRole } from '@/types/database'

export interface NavItem {
  to: string
  label: string
  /** Versao curta usada na barra inferior do celular, onde o espaco e apertado. */
  shortLabel?: string
  icon: LucideIcon
  roles: AppRole[]
  /** Aparece na barra inferior do celular. */
  primary?: boolean
  description?: string
}

/**
 * A navegacao lista o trabalho do GC.
 *
 * Configuracoes ficou de fora de proposito: ela e da pessoa, nao do grupo, e
 * mora no menu da foto de perfil - junto de "Perfil" e "Sair", que sao os
 * outros dois gestos da mesma natureza.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Minha semana',
    shortLabel: 'Início',
    icon: House,
    roles: ['supervisor', 'leader', 'disciple', 'member'],
    primary: true,
    description: 'Tudo o que você precisa fazer nesta semana',
  },
  {
    to: '/cuidados',
    label: 'Cuidados',
    icon: HeartHandshake,
    roles: ['supervisor', 'leader', 'disciple'],
    primary: true,
    description: 'Pessoas sob cuidado, contatos e pontos de atenção',
  },
  {
    to: '/atividades',
    label: 'Atividades',
    icon: ListChecks,
    roles: ['supervisor', 'leader', 'disciple', 'member'],
    primary: true,
    description: 'Talk, lanche, dinâmica e aniversariantes',
  },
  {
    to: '/devocionais',
    label: 'Devocionais',
    icon: BookOpen,
    roles: ['supervisor', 'leader', 'disciple', 'member'],
    description: 'O que a liderança da igreja tem mandado',
  },
  {
    to: '/distribuicao',
    label: 'Distribuição',
    icon: Shuffle,
    roles: ['leader'],
    description: 'Gerar, revisar e publicar a semana',
  },
  {
    to: '/integrantes',
    label: 'Integrantes',
    icon: Users,
    roles: ['leader', 'supervisor'],
    description: 'Cadastro, convites e discipulado',
  },
  {
    to: '/presenca',
    label: 'Presença',
    icon: CalendarCheck,
    roles: ['leader', 'supervisor'],
    description: 'A chamada do fim do GC',
  },
  {
    to: '/visitantes',
    label: 'Visitantes',
    icon: DoorOpen,
    roles: ['leader', 'supervisor'],
    description: 'Quem visitou e ainda não faz parte do GC',
  },
  {
    to: '/relatorios',
    label: 'Relatórios',
    icon: BarChart3,
    roles: ['leader', 'supervisor'],
    description: 'Como o GC está indo, semana a semana',
  },
  {
    to: '/supervisao',
    label: 'Supervisão',
    icon: MessagesSquare,
    roles: ['supervisor', 'leader', 'disciple'],
    primary: true,
    description: 'Conversa reservada com os supervisores',
  },
  {
    to: '/agenda',
    label: 'Semanas',
    icon: CalendarRange,
    roles: ['leader', 'supervisor'],
    description: 'Histórico das semanas de cuidado',
  },
]

export function navFor(role: AppRole | null): NavItem[] {
  if (!role) return []
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}
