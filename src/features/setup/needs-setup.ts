import type { Group, Profile } from '@/types/database'

/**
 * A primeira distribuicao so pode acontecer depois que a lideranca confirmar o
 * genero de cuidado de todos os integrantes ativos.
 */
export function needsSetup(group: Pick<Group, 'setup_completed_at'> | null, members?: Profile[]) {
  if (!group || group.setup_completed_at || !members) return false

  return members.some(
    (member) =>
      member.status === 'active' &&
      ['leader', 'disciple', 'member'].includes(member.role) &&
      member.care_gender === null,
  )
}
