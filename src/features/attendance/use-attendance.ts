import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { friendlyError } from '@/lib/errors'
import { useSession } from '@/features/auth/session-context'
import type { AppRole, AttendanceMark, VisitorStatus } from '@/types/database'

export interface PresencaIntegrante {
  id: string
  nome: string
  nomeCompleto: string
  papel: AppRole
  foto: string | null
  marca: AttendanceMark
  justificativa: string | null
}

export interface PresencaVisitante {
  id: string
  nome: string
  primeiraVisita: string
  situacao: VisitorStatus
  marca: AttendanceMark
}

/**
 * A presença de um dia, já montada pelo banco.
 *
 * `id` nulo significa que aquele encontro ainda não foi registrado — a lista
 * vem inteira mesmo assim, com todo mundo em "faltou". É o estado inicial
 * correto: a lista começa vazia e se preenche com quem apareceu.
 */
export interface Encontro {
  id: string | null
  quando: string
  semanaId: string | null
  anotacao: string | null
  registradoEm: string | null
  registradoPor: string | null
  integrantes: PresencaIntegrante[]
  visitantes: PresencaVisitante[]
}

export interface EncontroResumo {
  id: string
  quando: string
  semanaId: string | null
  anotacao: string | null
  registradoEm: string | null
  presentes: number
  justificados: number
  ausentes: number
  visitantes: number
}

export function useMeetingRoster(quando: string | undefined) {
  const { group } = useSession()

  return useQuery({
    queryKey: ['encontro', group?.id, quando],
    enabled: Boolean(group?.id && quando),
    queryFn: async () => {
      const { data, error } = await db.rpc('encontro', {
        p_group_id: group!.id,
        p_held_on: quando!,
      })
      if (error) throw error
      return data as unknown as Encontro
    },
  })
}

export function useMeetings(limite = 12) {
  const { group } = useSession()

  return useQuery({
    queryKey: ['encontros', group?.id, limite],
    enabled: Boolean(group?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('encontros', {
        p_group_id: group!.id,
        p_limite: limite,
      })
      if (error) throw error
      return data as unknown as EncontroResumo[]
    },
  })
}

export interface MarcaEnviada {
  tipo: 'integrante' | 'visitante'
  id: string
  marca: AttendanceMark
  justificativa?: string | null
}

/**
 * Salva a presença inteira de uma vez.
 *
 * A tela manda a lista completa, e não apenas quem veio: no banco, uma foto
 * pela metade não distingue "faltou" de "ainda não marquei". Salvar de novo no
 * mesmo dia corrige — é o caso de quem chegou atrasado e foi lembrado depois.
 */
export function useSaveAttendance() {
  const queryClient = useQueryClient()
  const { group } = useSession()

  return useMutation({
    mutationFn: async ({
      quando,
      marcas,
      anotacao,
    }: {
      quando: string
      marcas: MarcaEnviada[]
      anotacao?: string | null
    }) => {
      const { error } = await db.rpc('salvar_presenca', {
        p_group_id: group!.id,
        p_held_on: quando,
        p_marcas: marcas,
        p_notes: anotacao ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encontro'] })
      queryClient.invalidateQueries({ queryKey: ['encontros'] })
      queryClient.invalidateQueries({ queryKey: ['relatorio-presenca'] })
      toast.success('Presença registrada.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('apagar_encontro', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encontro'] })
      queryClient.invalidateQueries({ queryKey: ['encontros'] })
      queryClient.invalidateQueries({ queryKey: ['relatorio-presenca'] })
      toast.success('Encontro removido.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}
