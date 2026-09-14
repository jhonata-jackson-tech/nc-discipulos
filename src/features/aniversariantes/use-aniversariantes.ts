import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import type { Aniversariante } from '@/types/database'
import type { AniversarianteLido } from './lista'

export function useAniversariantes() {
  return useQuery({
    queryKey: ['aniversariantes'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('aniversariantes')
        .select('*')
        .order('mes')
        .order('dia')
        .order('nome')
      if (error) throw error
      return (data ?? []) as Aniversariante[]
    },
  })
}

export interface SalvarAniversarianteInput {
  id?: string | null
  nome: string
  dia: number
  mes: number
  observacao: string
}

export function useSalvarAniversariante() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nome, dia, mes, observacao }: SalvarAniversarianteInput) => {
      const campos = { nome: nome.trim(), dia, mes, observacao: observacao.trim() || null }
      const { error } = id
        ? await db.from('aniversariantes').update(campos).eq('id', id)
        : await db.from('aniversariantes').insert(campos)
      if (error) {
        if (error.code === '23505') throw new Error('Essa pessoa já está na lista nesse dia.')
        throw error
      }
    },
    onSuccess: (_resultado, variaveis) => {
      queryClient.invalidateQueries({ queryKey: ['aniversariantes'] })
      toast.success(variaveis.id ? 'Aniversariante atualizado.' : 'Aniversariante incluído.')
    },
  })
}

export function useApagarAniversariante() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('aniversariantes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aniversariantes'] })
      toast.success('Aniversariante removido.')
    },
  })
}

/** A lista colada, de uma vez. Quem já estava fica de fora antes de chegar aqui. */
export function useImportarAniversariantes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (novos: AniversarianteLido[]) => {
      if (novos.length === 0) return 0
      const { error } = await db
        .from('aniversariantes')
        .insert(novos.map((a) => ({ nome: a.nome, dia: a.dia, mes: a.mes })))
      if (error) {
        if (error.code === '23505') {
          throw new Error('Alguém da lista já foi incluído enquanto você colava. Abra de novo.')
        }
        throw error
      }
      return novos.length
    },
    onSuccess: (total) => {
      queryClient.invalidateQueries({ queryKey: ['aniversariantes'] })
      toast.success(`${total} aniversariante(s) incluído(s).`)
    },
  })
}
