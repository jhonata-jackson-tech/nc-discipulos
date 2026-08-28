import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { useSession } from '@/features/auth/session-context'
import { byName } from '@/lib/utils'
import type {
  CareGender,
  DiscipleshipLink,
  MemberStatus,
  PairingRestriction,
  Profile,
} from '@/types/database'

export const membersKey = ['members'] as const

/** Integrantes do GC da sessao - nunca de outro grupo que exista no banco. */
export function useMembers() {
  const { group } = useSession()

  return useQuery({
    queryKey: [...membersKey, group?.id],
    enabled: Boolean(group?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('profiles')
        .select('*, group_memberships!inner(group_id)')
        .eq('group_memberships.group_id', group!.id)
        .is('deleted_at', null)
        .order('full_name')
      if (error) throw error

      return (data as (Profile & { group_memberships: unknown })[])
        .map(({ group_memberships: _membership, ...profile }) => profile as Profile)
        .sort(byName)
    },
  })
}

export function useActiveMembers() {
  const query = useMembers()
  return { ...query, data: query.data?.filter((p) => p.status === 'active') }
}

export function useDiscipleshipLinks() {
  return useQuery({
    queryKey: ['discipleship-links'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from('discipleship_links').select('*').is('ended_on', null)
      if (error) throw error
      return data as DiscipleshipLink[]
    },
  })
}

export function useCreateMember() {
  const queryClient = useQueryClient()
  const { group } = useSession()

  return useMutation({
    mutationFn: async (input: {
      full_name: string
      email?: string | null
      phone?: string | null
      birth_date?: string | null
      role: Profile['role']
      care_gender?: CareGender | null
    }) => {
      const { data, error } = await db
        .from('profiles')
        .insert({
          full_name: input.full_name.trim(),
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          birth_date: input.birth_date || null,
          role: input.role,
          care_gender: input.care_gender ?? null,
          salutation: input.care_gender ? (input.care_gender === 'male' ? 'irmao' : 'irma') : null,
        })
        .select()
        .single()
      if (error) throw error

      // O integrante nasce ja vinculado ao GC: e a associacao que define qual
      // grupo ele enxerga ao entrar.
      if (group) {
        const membership = await db
          .from('group_memberships')
          .insert({ group_id: group.id, profile_id: data.id, role: input.role })
        if (membership.error) throw membership.error
      }

      return data as Profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey })
      toast.success('Integrante cadastrado.')
    },
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Profile> & { id: string }) => {
      const { error } = await db.from('profiles').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey })
      queryClient.invalidateQueries({ queryKey: ['session-profile'] })
      toast.success('Dados atualizados.')
    },
  })
}

export function useSetMemberStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      profileId,
      status,
      reason,
    }: {
      profileId: string
      status: MemberStatus
      reason?: string
    }) => {
      const { error } = await db.rpc('set_member_status', {
        p_profile_id: profileId,
        p_status: status,
        p_reason: reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: membersKey })
      queryClient.invalidateQueries({ queryKey: ['discipleship-links'] })
      toast.success(
        variables.status === 'active'
          ? 'Integrante reativado.'
          : 'Integrante desativado. O histórico foi preservado.',
      )
    },
  })
}

export function useSetDiscipleLeader() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      discipleId,
      leaderId,
    }: {
      discipleId: string
      leaderId: string | null
    }) => {
      const { error } = await db.rpc('set_disciple_leader', {
        p_disciple_id: discipleId,
        p_leader_id: leaderId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discipleship-links'] })
      toast.success('Discipulado atualizado.')
    },
  })
}

export function useConfirmCareGenders() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entries: { id: string; careGender: CareGender }[]) => {
      const { error } = await db.rpc('confirm_care_genders', { p_entries: entries })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey })
      queryClient.invalidateQueries({ queryKey: ['session-profile'] })
    },
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ profileId, email }: { profileId: string; email: string }) => {
      const { data, error } = await db.rpc('create_invite', {
        p_profile_id: profileId,
        p_email: email,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return row as { invite_id: string; token: string; expires_at: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey })
      queryClient.invalidateQueries({ queryKey: ['invites'] })
    },
  })
}

export function usePairingRestrictions() {
  const { group } = useSession()

  return useQuery({
    queryKey: ['pairing-restrictions', group?.id],
    enabled: Boolean(group?.id),
    queryFn: async () => {
      const { data, error } = await db
        .from('pairing_restrictions')
        .select('*')
        .eq('group_id', group!.id)
      if (error) throw error
      return data as PairingRestriction[]
    },
  })
}

export function useSavePairingRestriction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { groupId: string; a: string; b: string; reason: string }) => {
      const { error } = await db.from('pairing_restrictions').insert({
        group_id: input.groupId,
        profile_a: input.a,
        profile_b: input.b,
        reason: input.reason || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pairing-restrictions'] })
      toast.success('Restrição registrada.')
    },
  })
}

export function useRemovePairingRestriction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('pairing_restrictions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pairing-restrictions'] })
      toast.success('Restrição removida.')
    },
  })
}
