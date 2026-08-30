import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { friendlyError } from '@/lib/errors'
import { useSession } from '@/features/auth/session-context'
import type {
  CareGender,
  ContactChannel,
  GcIntent,
  VisitorOrigin,
  VisitorStatus,
} from '@/types/database'

/**
 * O visitante, como a tela precisa dele.
 *
 * Vem de `public.visitantes()` já com a contagem de contatos e a data do
 * último — uma consulta na tabela devolveria as mesmas linhas sem responder a
 * única pergunta que essa tela existe para responder: com quem ainda não se
 * falou.
 */
export interface Visitante {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  nascimento: string | null
  generoDeCuidado: CareGender | null
  origem: VisitorOrigin
  convidadoPor: string | null
  primeiraVisita: string
  anotacao: string | null
  situacao: VisitorStatus
  motivo: string | null
  encerradoEm: string | null
  integranteId: string | null
  contatos: number
  ultimoContato: string | null
  /** A última palavra dele sobre voltar. É o que decide insistir ou respeitar. */
  ultimaIntencao: GcIntent | null
}

export interface ContatoDoVisitante {
  id: string
  quando: string
  canal: ContactChannel
  intencao: GcIntent | null
  anotacao: string | null
  autor: string
}

export const visitorsKey = ['visitantes'] as const

export function useVisitors() {
  return useQuery({
    queryKey: visitorsKey,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('visitantes')
      if (error) throw error
      return data as unknown as Visitante[]
    },
  })
}

export function useVisitorContacts(visitorId: string | undefined) {
  return useQuery({
    queryKey: ['visitante-contatos', visitorId],
    enabled: Boolean(visitorId),
    queryFn: async () => {
      const { data, error } = await db.rpc('contatos_do_visitante', { p_visitor_id: visitorId! })
      if (error) throw error
      return data as unknown as ContatoDoVisitante[]
    },
  })
}

export interface SalvarVisitanteInput {
  id?: string | null
  nome: string
  telefone?: string | null
  email?: string | null
  nascimento?: string | null
  generoDeCuidado?: CareGender | null
  origem: VisitorOrigin
  convidadoPor?: string | null
  primeiraVisita: string
  anotacao?: string | null
}

export function useSaveVisitor() {
  const queryClient = useQueryClient()
  const { group } = useSession()

  return useMutation({
    mutationFn: async (input: SalvarVisitanteInput) => {
      const { data, error } = await db.rpc('salvar_visitante', {
        p_id: input.id ?? null,
        p_group_id: group!.id,
        p_full_name: input.nome,
        p_phone: input.telefone ?? null,
        p_email: input.email ?? null,
        p_birth_date: input.nascimento || null,
        p_care_gender: input.generoDeCuidado ?? null,
        p_origin: input.origem,
        p_invited_by: input.convidadoPor ?? null,
        p_first_visit_on: input.primeiraVisita,
        p_notes: input.anotacao ?? null,
      })
      if (error) throw error
      return data as unknown as string
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: visitorsKey })
      toast.success(input.id ? 'Dados atualizados.' : 'Visitante cadastrado.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

export interface ContatoInput {
  visitorId: string
  canal: ContactChannel
  intencao?: GcIntent | null
  quando: string
  anotacao?: string | null
}

export function useLogVisitorContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ContatoInput) => {
      const { error } = await db.rpc('registrar_contato_visitante', {
        p_visitor_id: input.visitorId,
        p_channel: input.canal,
        p_coming_to_gc: input.intencao ?? null,
        p_contacted_on: input.quando,
        p_notes: input.anotacao ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: visitorsKey })
      queryClient.invalidateQueries({ queryKey: ['visitante-contatos', input.visitorId] })
      toast.success('Contato registrado.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

/**
 * O visitante virou integrante.
 *
 * A partir daqui ele entra no rodízio como qualquer irmão — por isso o
 * cadastro de integrantes é invalidado junto: a lista muda de tamanho.
 */
export function usePromoteVisitor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      visitorId,
      papel,
    }: {
      visitorId: string
      papel: 'member' | 'disciple'
    }) => {
      const { error } = await db.rpc('promover_visitante', {
        p_visitor_id: visitorId,
        p_role: papel,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: visitorsKey })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      toast.success('Agora faz parte do GC. Confirme o gênero de cuidado em Integrantes.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

export function useCloseVisitor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ visitorId, motivo }: { visitorId: string; motivo: string }) => {
      const { error } = await db.rpc('encerrar_visitante', {
        p_visitor_id: visitorId,
        p_reason: motivo,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: visitorsKey })
      toast.success('Acompanhamento encerrado, com o motivo registrado.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

export function useReopenVisitor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (visitorId: string) => {
      const { error } = await db.rpc('reabrir_visitante', { p_visitor_id: visitorId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: visitorsKey })
      toast.success('Voltamos a acompanhar.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

export function useDeleteVisitor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (visitorId: string) => {
      const { error } = await db.rpc('apagar_visitante', { p_visitor_id: visitorId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: visitorsKey })
      toast.success('Cadastro removido.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}
