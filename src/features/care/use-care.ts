import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/session-context'
import { startOfWeek } from '@/lib/date'
import type {
  AssignmentStatus,
  AttentionLevel,
  CareAssignment,
  CareWeek,
  ContactChannel,
  ContactLog,
  Profile,
  TransferRequest,
  WeekSummary,
} from '@/types/database'

export interface AssignmentWithPeople extends CareAssignment {
  cared_for: Profile
  caregiver: Profile
}

const ASSIGNMENT_SELECT =
  '*, cared_for:profiles!care_assignments_cared_for_id_fkey(*), caregiver:profiles!care_assignments_caregiver_id_fkey(*)'

/** Semana visivel para o usuario: a publicada mais recente que ja comecou. */
export function useCurrentWeek() {
  const { group } = useSession()

  return useQuery({
    queryKey: ['current-week', group?.id],
    enabled: Boolean(group?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('care_weeks')
        .select('*')
        .eq('group_id', group!.id)
        .lte('starts_on', startOfWeek())
        .in('status', ['published', 'closed'])
        .order('starts_on', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as CareWeek | null
    },
  })
}

export function useWeeks() {
  const { group } = useSession()

  return useQuery({
    queryKey: ['weeks', group?.id],
    enabled: Boolean(group?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('care_weeks')
        .select('*')
        .eq('group_id', group!.id)
        .order('starts_on', { ascending: false })
        .limit(52)
      if (error) throw error
      return data as CareWeek[]
    },
  })
}

export function useWeek(weekId: string | undefined) {
  return useQuery({
    queryKey: ['week', weekId],
    enabled: Boolean(weekId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('care_weeks')
        .select('*')
        .eq('id', weekId!)
        .single()
      if (error) throw error
      return data as CareWeek
    },
  })
}

/** Cuidados de uma semana. A RLS ja limita o que cada papel enxerga. */
export function useAssignments(weekId: string | undefined, caregiverId?: string) {
  return useQuery({
    queryKey: ['assignments', weekId, caregiverId ?? 'all'],
    enabled: Boolean(weekId),
    queryFn: async () => {
      let query = supabase.from('care_assignments').select(ASSIGNMENT_SELECT).eq('week_id', weekId!)
      if (caregiverId) query = query.eq('caregiver_id', caregiverId)

      const { data, error } = await query
      if (error) throw error
      return (data as unknown as AssignmentWithPeople[]).sort((a, b) =>
        a.cared_for.full_name.localeCompare(b.cared_for.full_name, 'pt-BR'),
      )
    },
  })
}

export function useContactLogs(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ['contact-logs', assignmentId],
    enabled: Boolean(assignmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_logs')
        .select('*, author:profiles!contact_logs_author_id_fkey(full_name)')
        .eq('assignment_id', assignmentId!)
        .order('contacted_on', { ascending: false })
      if (error) throw error
      return data as unknown as (ContactLog & { author: { full_name: string } })[]
    },
  })
}

export interface LogContactInput {
  assignmentId: string
  channel: ContactChannel
  contactedOn: string
  gotReply: boolean
  feedback?: string
  attentionLevel: AttentionLevel
  status: AssignmentStatus
}

export function useLogContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: LogContactInput) => {
      const { error } = await supabase.rpc('log_contact', {
        p_assignment_id: input.assignmentId,
        p_channel: input.channel,
        p_contacted_on: input.contactedOn,
        p_got_reply: input.gotReply,
        p_feedback: input.feedback ?? null,
        p_attention_level: input.attentionLevel,
        p_status: input.status,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      queryClient.invalidateQueries({ queryKey: ['contact-logs', variables.assignmentId] })
      queryClient.invalidateQueries({ queryKey: ['week-summary'] })
      toast.success('Contato registrado. Obrigado por cuidar.')
    },
  })
}

// ------------------------------------------------------------ transferencias
export interface TransferWithContext extends TransferRequest {
  /**
   * Nulo quando a RLS ja nao expoe a atribuicao a esta pessoa - por exemplo,
   * depois que ela transferiu o cuidado e deixou de ser a responsavel.
   */
  assignment: AssignmentWithPeople | null
  requester: Profile
  recipient: Profile
}

export function useTransferRequests(profileId: string | undefined) {
  return useQuery({
    queryKey: ['transfers', profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transfer_requests')
        .select(
          `*, assignment:care_assignments(${ASSIGNMENT_SELECT}),
           requester:profiles!transfer_requests_requester_id_fkey(*),
           recipient:profiles!transfer_requests_recipient_id_fkey(*)`,
        )
        .or(`requester_id.eq.${profileId},recipient_id.eq.${profileId}`)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as TransferWithContext[]
    },
  })
}

export function useRequestTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { assignmentId: string; recipientId: string; reason: string }) => {
      const { error } = await supabase.rpc('request_transfer', {
        p_assignment_id: input.assignmentId,
        p_recipient_id: input.recipientId,
        p_reason: input.reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      toast.success('Pedido enviado. O cuidado continua com você até o aceite.')
    },
  })
}

export function useRespondTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { requestId: string; accept: boolean; note?: string }) => {
      const { error } = await supabase.rpc('respond_transfer', {
        p_request_id: input.requestId,
        p_accept: input.accept,
        p_note: input.note ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      toast.success(variables.accept ? 'Cuidado assumido.' : 'Pedido recusado.')
    },
  })
}

export function useCancelTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('cancel_transfer', { p_request_id: requestId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      toast.success('Pedido cancelado.')
    },
  })
}

export function useReassignCare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { assignmentId: string; newCaregiverId: string; reason: string }) => {
      const { error } = await supabase.rpc('reassign_care', {
        p_assignment_id: input.assignmentId,
        p_new_caregiver_id: input.newCaregiverId,
        p_reason: input.reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      queryClient.invalidateQueries({ queryKey: ['week-summary'] })
      toast.success('Cuidado reorganizado. A mudança ficou registrada.')
    },
  })
}

export function useWeekSummary(weekId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['week-summary', weekId],
    enabled: Boolean(weekId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('group_week_summary', { p_week_id: weekId! })
      if (error) throw error
      return data as WeekSummary
    },
  })
}
