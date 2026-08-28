import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiUrl, db } from '@/lib/db'
import { getAccessToken } from '@/lib/auth'
import type { AuditLog, PoolReportRow } from '@/types/database'

export interface GenerateWeekResponse {
  weekId: string
  assignments: number
  pools: PoolReportRow[]
  warnings: string[]
}

export class GenerationError extends Error {
  code?: string
  people?: string[]

  constructor(message: string, code?: string, people?: string[]) {
    super(message)
    this.code = code
    this.people = people
  }
}

/**
 * A geracao acontece inteiramente no servidor, dentro de uma transacao. O
 * navegador so pede e mostra o resultado - o algoritmo nunca roda aqui.
 */
export function useGenerateWeek() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, startsOn }: { groupId: string; startsOn: string }) => {
      const token = await getAccessToken()
      if (!token) throw new GenerationError('Sua sessão expirou. Entre novamente.')

      let response: Response
      try {
        response = await fetch(apiUrl('/api/gerar-semana'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ groupId, startsOn }),
        })
      } catch {
        throw new GenerationError('Não foi possível falar com o servidor. Verifique sua conexão.')
      }

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        // O servidor devolve o motivo no corpo, mesmo em erro: a tela precisa
        // saber quem esta sem genero confirmado para listar os nomes.
        throw new GenerationError(
          body?.error ?? 'Não foi possível gerar a semana.',
          body?.code,
          body?.details?.people,
        )
      }

      return body as GenerateWeekResponse
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['weeks'] })
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      queryClient.invalidateQueries({ queryKey: ['week', data.weekId] })
      toast.success(`Rascunho gerado com ${data.assignments} cuidados.`)
    },
    onError: (error: GenerationError) => toast.error(error.message),
  })
}

export function usePublishWeek() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (weekId: string) => {
      const { error } = await db.rpc('publish_care_week', { p_week_id: weekId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeks'] })
      queryClient.invalidateQueries({ queryKey: ['week'] })
      queryClient.invalidateQueries({ queryKey: ['current-week'] })
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      toast.success('Semana publicada. Todos foram avisados.')
    },
  })
}

export function useCloseWeek() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (weekId: string) => {
      const { error } = await db.rpc('close_care_week', { p_week_id: weekId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeks'] })
      queryClient.invalidateQueries({ queryKey: ['week'] })
      toast.success('Semana encerrada.')
    },
  })
}

export function useSetDraftAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      weekId: string
      caredForId: string
      caregiverId: string | null
    }) => {
      const { error } = await db.rpc('set_draft_assignment', {
        p_week_id: input.weekId,
        p_cared_for_id: input.caredForId,
        p_caregiver_id: input.caregiverId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
    },
  })
}

export function useAuditLogs(entity?: string, entityId?: string) {
  return useQuery({
    queryKey: ['audit-logs', entity ?? 'all', entityId ?? 'all'],
    queryFn: async () => {
      let query = db
        .from('audit_logs')
        .select('*, actor:profiles!audit_logs_actor_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (entity) query = query.eq('entity', entity)
      if (entityId) query = query.eq('entity_id', entityId)

      const { data, error } = await query
      if (error) throw error
      return data as unknown as (AuditLog & { actor: { full_name: string } | null })[]
    },
  })
}
