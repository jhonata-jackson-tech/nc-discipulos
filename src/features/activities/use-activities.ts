import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/session-context'
import type { Activity, ActivityStatus, ActivityType, Profile } from '@/types/database'

export interface ActivityWithAssignees extends Activity {
  assignees: { profile: Profile }[]
}

const ACTIVITY_SELECT = '*, assignees:activity_assignees(profile:profiles(*))'

export function useActivities(weekId?: string | null) {
  const { group } = useSession()

  return useQuery({
    queryKey: ['activities', group?.id, weekId ?? 'all'],
    enabled: Boolean(group?.id),
    queryFn: async () => {
      let query = supabase.from('activities').select(ACTIVITY_SELECT).eq('group_id', group!.id)
      if (weekId) query = query.eq('week_id', weekId)
      const { data, error } = await query
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as ActivityWithAssignees[]
    },
  })
}

export interface SaveActivityInput {
  id?: string | null
  groupId: string
  weekId?: string | null
  type: ActivityType
  title: string
  description?: string | null
  dueAt?: string | null
  status?: ActivityStatus
  notes?: string | null
  isRecurring?: boolean
  assigneeIds: string[]
}

export function useSaveActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveActivityInput) => {
      const { error } = await supabase.rpc('save_activity', {
        p_id: input.id ?? null,
        p_group_id: input.groupId,
        p_week_id: input.weekId ?? null,
        p_type: input.type,
        p_title: input.title,
        p_description: input.description ?? null,
        p_due_at: input.dueAt ?? null,
        p_status: input.status ?? 'todo',
        p_notes: input.notes ?? null,
        p_is_recurring: input.isRecurring ?? false,
        p_assignee_ids: input.assigneeIds,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success(variables.id ? 'Atividade atualizada.' : 'Atividade criada.')
    },
  })
}

export function useSetActivityStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ActivityStatus }) => {
      const { error } = await supabase.rpc('set_activity_status', { p_id: id, p_status: status })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}

export function useDeleteActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('activities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success('Atividade removida.')
    },
  })
}

export function useCopyRecurringActivities() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, weekId }: { groupId: string; weekId: string }) => {
      const { data, error } = await supabase.rpc('copy_recurring_activities', {
        p_group_id: groupId,
        p_week_id: weekId,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success(
        count > 0
          ? `${count} atividade(s) recorrente(s) trazida(s) para esta semana.`
          : 'Nenhuma atividade recorrente nova para copiar.',
      )
    },
  })
}
