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

export type LinksDoTalk = Partial<Record<TalkArquivoTipo, string>>

/**
 * Os endereços dos arquivos de todos os talks que esta pessoa alcança.
 *
 * Os arquivos moram num serviço no Brasil, e ele só entrega com um link
 * assinado pela API — que antes pergunta ao banco se a pessoa pode ver. O link
 * é o mesmo por pelo menos doze horas e muda quando o arquivo muda: é o que
 * deixa o navegador guardar a capa sem nunca mostrar a arte antiga.
 */
export function useLinksDosTalks(ligado = true) {
  return useQuery({
    queryKey: ['talk-links'],
    enabled: ligado,
    staleTime: 4 * 60 * 60_000,
    gcTime: 8 * 60 * 60_000,
    queryFn: async () => {
      const corpo = await chamarApi<{ links: Record<string, LinksDoTalk> }>('/api/talks/links', {
        method: 'POST',
      })
      return corpo.links
    },
  })
}

/** O link com `baixar=1`: o arquivo vem para salvar, em vez de abrir. */
export const paraBaixar = (url: string) => `${url}&baixar=1`

async function chamarApi<T = void>(caminho: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.')

  let resposta: Response
  try {
    resposta = await fetch(apiUrl(caminho), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique sua conexão.')
  }

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { error?: string } | null
    throw new Error(corpo?.error ?? `Algo deu errado (erro ${resposta.status}).`)
  }

  return (resposta.status === 204 ? undefined : await resposta.json()) as T
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
      queryClient.invalidateQueries({ queryKey: ['talk-links'] })
    },
  })
}

/**
 * Manda o arquivo direto do celular para o serviço de arquivos, no Brasil.
 *
 * Três passos: a API autoriza (e confere no banco que é líder), o arquivo sobe
 * direto para o serviço — sem passar pela VPS nos EUA —, e a API registra o
 * que chegou, perguntando o tamanho ao próprio serviço.
 *
 * `XMLHttpRequest` e não `fetch` por um motivo só: é o único que conta o
 * progresso do envio. "Enviando… 62%" é a diferença entre esperar e achar que
 * travou.
 */
export async function enviarArquivo(
  talkId: string,
  tipo: TalkArquivoTipo,
  arquivo: Blob,
  nome?: string,
  aoProgredir?: (fracao: number) => void,
) {
  const base = `/api/talks/${talkId}/arquivos/${tipo}`
  const { url } = await chamarApi<{ url: string }>(`${base}/envio`, {
    method: 'POST',
    body: JSON.stringify({ mime: arquivo.type, nome, tamanho: arquivo.size }),
  })

  await new Promise<void>((resolver, rejeitar) => {
    const pedido = new XMLHttpRequest()
    pedido.open('PUT', url)
    pedido.setRequestHeader('Content-Type', arquivo.type || 'application/octet-stream')
    pedido.upload.onprogress = (evento) => {
      if (evento.lengthComputable) aoProgredir?.(evento.loaded / evento.total)
    }
    pedido.onload = () => {
      if (pedido.status >= 200 && pedido.status < 300) return resolver()
      let mensagem = `Não foi possível enviar o arquivo (erro ${pedido.status}).`
      try {
        mensagem = (JSON.parse(pedido.responseText) as { error?: string }).error ?? mensagem
      } catch {
        // Fica a mensagem com o código.
      }
      rejeitar(new Error(mensagem))
    }
    pedido.onerror = () =>
      rejeitar(new Error('O envio caiu no meio. Verifique sua conexão e tente de novo.'))
    pedido.send(arquivo)
  })

  await chamarApi(`${base}/confirmar`, { method: 'POST', body: '{}' })
}

export async function apagarArquivo(talkId: string, tipo: TalkArquivoTipo) {
  await chamarApi(`/api/talks/${talkId}/arquivos/${tipo}`, { method: 'DELETE' })
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
      // Pela API, e não direto no banco: a pasta dos arquivos sai junto.
      await chamarApi(`/api/talks/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talks'] })
      queryClient.invalidateQueries({ queryKey: ['talk-links'] })
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
