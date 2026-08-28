import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { useSession } from '@/features/auth/session-context'
import type {
  Profile,
  SupervisionNote,
  SupervisionRequest,
  SupervisionStatus,
  SupervisionUrgency,
} from '@/types/database'

export interface SupervisionRequestWithPeople extends SupervisionRequest {
  requester: Profile
  supervisor: Profile | null
}

/**
 * A RLS decide o que aparece: uma solicitacao reservada simplesmente nao existe
 * para lideres - nem aqui, nem em contadores.
 */
export function useSupervisionRequests() {
  const { group } = useSession()

  return useQuery({
    queryKey: ['supervision-requests', group?.id],
    enabled: Boolean(group?.id),
    queryFn: async () => {
      const { data, error } = await db
        .from('supervision_requests')
        .select(
          `*, requester:profiles!supervision_requests_requester_id_fkey(*),
           supervisor:profiles!supervision_requests_supervisor_id_fkey(*)`,
        )
        .eq('group_id', group!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as SupervisionRequestWithPeople[]
    },
  })
}

export function useCreateSupervisionRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      groupId: string
      requesterId: string
      supervisorId: string | null
      subject: string
      message: string
      urgency: SupervisionUrgency
      suggestedTimes?: string
      confidential: boolean
    }) => {
      const { error } = await db.from('supervision_requests').insert({
        group_id: input.groupId,
        requester_id: input.requesterId,
        supervisor_id: input.supervisorId,
        subject: input.subject,
        message: input.message,
        urgency: input.urgency,
        suggested_times: input.suggestedTimes || null,
        confidential_to_supervisors: input.confidential,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervision-requests'] })
      toast.success('Solicitação enviada aos supervisores.')
    },
  })
}

export function useUpdateSupervisionRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      status: SupervisionStatus
      scheduledFor?: string | null
    }) => {
      const { error } = await db.rpc('update_supervision_request', {
        p_id: input.id,
        p_status: input.status,
        p_scheduled_for: input.scheduledFor ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervision-requests'] })
      toast.success('Solicitação atualizada.')
    },
  })
}

export function useSupervisionNotes(requestId: string | undefined) {
  return useQuery({
    queryKey: ['supervision-notes', requestId],
    enabled: Boolean(requestId),
    queryFn: async () => {
      const { data, error } = await db
        .from('supervision_notes')
        .select('*')
        .eq('request_id', requestId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SupervisionNote[]
    },
  })
}

export function useAddSupervisionNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { requestId: string; supervisorId: string; note: string }) => {
      const { error } = await db.from('supervision_notes').insert({
        request_id: input.requestId,
        supervisor_id: input.supervisorId,
        note: input.note,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supervision-notes', variables.requestId] })
      toast.success('Anotação salva. Ela é visível apenas aos supervisores.')
    },
  })
}
