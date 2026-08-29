import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { friendlyError } from '@/lib/errors'
import type {
  Devotional,
  DevotionalAudience,
  DevotionalAuthor,
  DevotionalCard,
} from '@/types/database'

/**
 * Os autores vêm separados dos devocionais de propósito.
 *
 * O retrato tem ~18 KB e é o mesmo em todos os cartões. Buscando a lista de
 * autores uma vez, o navegador guarda a imagem e a lista de devocionais fica
 * com o peso de um texto — em vez de baixar o mesmo rosto trinta vezes.
 */
export function useAuthors() {
  return useQuery({
    queryKey: ['devotional-authors'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from('devotional_authors').select('*').order('name')
      if (error) throw error
      return data as DevotionalAuthor[]
    },
  })
}

export function useDevotionals() {
  return useQuery({
    queryKey: ['devotionals'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('devocionais')
      if (error) throw error
      return (data ?? []) as unknown as DevotionalCard[]
    },
  })
}

export function useDevotional(id: string | undefined) {
  return useQuery({
    queryKey: ['devotional', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await db.rpc('devocional', { p_id: id })
      if (error) throw error
      return (data ?? null) as unknown as Devotional | null
    },
  })
}

export interface SaveDevotionalInput {
  id?: string | null
  authorId: string
  titulo: string
  corpo: string
  alcance: DevotionalAudience
}

export function useSaveDevotional() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveDevotionalInput) => {
      const { data, error } = await db.rpc('salvar_devocional', {
        p_id: input.id ?? null,
        p_author_id: input.authorId,
        p_title: input.titulo,
        p_body: input.corpo,
        p_audience: input.alcance,
      })
      if (error) throw error
      return data as unknown as string
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: ['devotionals'] })
      queryClient.invalidateQueries({ queryKey: ['devotional'] })
      toast.success(variables.id ? 'Devocional atualizado.' : 'Rascunho salvo.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

/** Publicar é o gesto que dispara o aviso. Não tem volta, e a tela avisa antes. */
export function usePublishDevotional() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('publicar_devocional', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devotionals'] })
      queryClient.invalidateQueries({ queryKey: ['devotional'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Devocional publicado. O aviso saiu.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

export function useDeleteDevotional() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('apagar_devocional', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devotionals'] })
      toast.success('Devocional removido.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

/**
 * Amém: um toque liga, outro desliga.
 *
 * A resposta já traz a contagem nova, então a tela não precisa recarregar a
 * lista inteira para mostrar um número que mudou em um.
 */
export function useAmen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.rpc('amem_devocional', { p_id: id })
      if (error) throw error
      return data as unknown as { euAmem: boolean; amens: number }
    },
    onSuccess: (resultado, id) => {
      queryClient.setQueryData<Devotional | null>(['devotional', id], (atual) =>
        atual ? { ...atual, ...resultado } : atual,
      )
      queryClient.setQueryData<DevotionalCard[]>(['devotionals'], (atual) =>
        atual?.map((item) => (item.id === id ? { ...item, ...resultado } : item)),
      )
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}

export interface SaveAuthorInput {
  id?: string | null
  name: string
  title: string
  /** `''` apaga o retrato; `null` mantém o que já estava. */
  photoUrl?: string | null
  active?: boolean
}

export function useSaveAuthor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveAuthorInput) => {
      const { error } = await db.rpc('salvar_autor', {
        p_id: input.id ?? null,
        p_name: input.name,
        p_title: input.title,
        p_photo_url: input.photoUrl ?? null,
        p_active: input.active ?? true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devotional-authors'] })
      queryClient.invalidateQueries({ queryKey: ['devotionals'] })
      toast.success('Autor salvo.')
    },
    onError: (error) => toast.error(friendlyError(error)),
  })
}
