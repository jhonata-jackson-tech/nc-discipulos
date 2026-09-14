import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiUrl, db } from '@/lib/db'
import { getAccessToken } from '@/lib/auth'
import type { Talk, TalkArquivoTipo, TalkCard } from '@/types/database'

export function useTalks() {
  return useQuery({
    queryKey: ['talks'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('lista_talks')
      if (error) throw error
      return (data ?? []) as unknown as TalkCard[]
    },
  })
}

export function useTalk(id: string | undefined) {
  return useQuery({
    queryKey: ['talk', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await db.rpc('talk', { p_id: id })
      if (error) throw error
      return (data ?? null) as unknown as Talk | null
    },
  })
}

/**
 * A chave que vai no endereço dos arquivos.
 *
 * `<img>` e `<a href>` não mandam o token de sessão, então o servidor emite uma
 * chave só para baixar arquivo. Ela vale por pelo menos doze horas e é a mesma
 * durante a janela — é o que deixa o navegador guardar a capa.
 */
export function useChaveDeArquivos(ligada = true) {
  return useQuery({
    queryKey: ['chave-arquivos'],
    enabled: ligada,
    staleTime: 4 * 60 * 60_000,
    gcTime: 8 * 60 * 60_000,
    queryFn: async () => {
      const token = await getAccessToken()
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
      const resposta = await fetch(apiUrl('/api/arquivos/chave'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resposta.ok) throw new Error('Não foi possível liberar os arquivos do talk.')
      const corpo = (await resposta.json()) as { chave: string }
      return corpo.chave
    },
  })
}

export function arquivoUrl(
  talkId: string,
  tipo: TalkArquivoTipo,
  chave: string,
  versao: number,
  baixar = false,
): string {
  const busca = new URLSearchParams({ v: String(versao), chave })
  if (baixar) busca.set('baixar', '1')
  return apiUrl(`/api/talks/${talkId}/arquivos/${tipo}?${busca}`)
}

export interface SalvarTalkInput {
  id?: string | null
  numero: number | null
  tema: string
  serie: string
  semanaDe: string
  mensagem: string
  spotifyUrl: string
  youtubeUrl: string
}

export function useSalvarTalk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SalvarTalkInput) => {
      const { data, error } = await db.rpc('salvar_talk', {
        p_id: input.id ?? null,
        p_numero: input.numero,
        p_tema: input.tema,
        p_serie: input.serie,
        p_semana_de: input.semanaDe,
        p_mensagem: input.mensagem,
        p_spotify_url: input.spotifyUrl,
        p_youtube_url: input.youtubeUrl,
      })
      if (error) throw error
      return data as unknown as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talks'] })
      queryClient.invalidateQueries({ queryKey: ['talk'] })
    },
  })
}

/**
 * Envia um arquivo cru para o servidor.
 *
 * Não passa pelo PostgREST: um PDF de 6 MB em base64 dentro de JSON pesaria 8
 * MB e travaria o celular de quem envia.
 */
export async function enviarArquivo(
  talkId: string,
  tipo: TalkArquivoTipo,
  arquivo: Blob,
  nome?: string,
) {
  const token = await getAccessToken()
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.')

  let resposta: Response
  try {
    resposta = await fetch(apiUrl(`/api/talks/${talkId}/arquivos/${tipo}`), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': arquivo.type,
        ...(nome ? { 'X-Nome-Arquivo': encodeURIComponent(nome) } : {}),
      },
      body: arquivo,
    })
  } catch {
    throw new Error('Não foi possível enviar o arquivo. Verifique sua conexão.')
  }

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { error?: string } | null
    throw new Error(
      corpo?.error ??
        (resposta.status === 413 ? 'Arquivo grande demais.' : 'Não foi possível enviar o arquivo.'),
    )
  }
}

export async function apagarArquivo(talkId: string, tipo: TalkArquivoTipo) {
  const token = await getAccessToken()
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.')
  const resposta = await fetch(apiUrl(`/api/talks/${talkId}/arquivos/${tipo}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resposta.ok) throw new Error('Não foi possível remover o arquivo.')
}

/** Publicar é o gesto que dispara o aviso. Não tem volta, e a tela avisa antes. */
export function usePublicarTalk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('publicar_talk', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talks'] })
      queryClient.invalidateQueries({ queryKey: ['talk'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Talk publicado. Líderes e discípulos foram avisados.')
    },
  })
}

export function useApagarTalk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('apagar_talk', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talks'] })
      toast.success('Talk removido.')
    },
  })
}

/** Marca que a pessoa abriu o material. Silencioso: não é algo que ela pediu. */
export function useAbrirTalk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('abrir_talk', { p_id: id })
      if (error) throw error
    },
    onSuccess: (_resultado, id) => {
      queryClient.setQueryData<Talk | null>(['talk', id], (atual) =>
        atual ? { ...atual, euAbri: true } : atual,
      )
      queryClient.invalidateQueries({ queryKey: ['talks'] })
    },
    onError: () => undefined,
  })
}

// ------------------------------------------------------------------- a arte

async function paraJpeg(imagem: ImageBitmap, ladoMaior: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, ladoMaior / Math.max(imagem.width, imagem.height))
  const tela = document.createElement('canvas')
  tela.width = Math.round(imagem.width * escala)
  tela.height = Math.round(imagem.height * escala)
  const contexto = tela.getContext('2d')
  if (!contexto) throw new Error('Não foi possível preparar a imagem.')
  contexto.drawImage(imagem, 0, 0, tela.width, tela.height)

  return new Promise((resolver, rejeitar) =>
    tela.toBlob(
      (blob) =>
        blob ? resolver(blob) : rejeitar(new Error('Não foi possível preparar a imagem.')),
      'image/jpeg',
      qualidade,
    ),
  )
}

/**
 * A arte em dois tamanhos: a de ver (até 1600px) e a capa do histórico (480px).
 *
 * A arte do WhatsApp já chega comprimida, mas a que vem do designer pode ter
 * 8 MB. Reduzir aqui, no aparelho de quem publica, é o que mantém o histórico
 * leve para quem abre no 4G.
 */
export async function prepararArte(arquivo: File): Promise<{ arte: Blob; capa: Blob }> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha uma imagem para a arte.')

  const imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  try {
    let arte = await paraJpeg(imagem, 1600, 0.86)
    if (arte.size > 1.8 * 1024 * 1024) arte = await paraJpeg(imagem, 1400, 0.72)
    const capa = await paraJpeg(imagem, 480, 0.78)
    return { arte, capa }
  } finally {
    imagem.close()
  }
}
