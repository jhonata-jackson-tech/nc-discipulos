import { Router } from 'express'
import { config } from '../config.ts'
import { withUser } from '../db.ts'
import { asyncRoute, HttpError, requireSession, type AuthedRequest } from '../http.ts'
import { assinar, vencimentoDeLeitura } from '../../../arquivos/assinatura.mjs'

/**
 * Os arquivos do talk: o PDF, a arte e a miniatura dela.
 *
 * Os bytes não passam mais por aqui. A VPS fica em Ashburn, a 190 ms do GC, e
 * um PDF de 6 MB levava 25 segundos para subir. Eles moram no serviço de
 * arquivos (`arquivos/`), no Brasil, e o celular fala direto com ele.
 *
 * O que continua aqui é a decisão: antes de assinar um link de leitura ou de
 * envio, esta API pergunta ao banco, com a identidade de quem pediu, se a
 * pessoa pode. O serviço de arquivos só confere a assinatura.
 */
export const talksRouter = Router()

type Tipo = 'pdf' | 'arte' | 'capa'

const TIPOS: Tipo[] = ['pdf', 'arte', 'capa']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O que cada tipo aceita. O banco confere de novo quando o arquivo é registrado. */
const REGRAS: Record<Tipo, { mimes: string[]; maximo: number }> = {
  pdf: { mimes: ['application/pdf'], maximo: 25 * 1024 * 1024 },
  arte: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maximo: 2 * 1024 * 1024 },
  capa: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maximo: 250 * 1024 },
}

function servico() {
  if (!config.arquivos) {
    throw new HttpError(503, 'O serviço de arquivos dos talks não está configurado.')
  }
  return config.arquivos
}

function alvo(params: Record<string, unknown>): { talkId: string; tipo: Tipo } {
  const talkId = String(params.id ?? '')
  const tipo = String(params.tipo ?? '') as Tipo
  if (!UUID.test(talkId) || !TIPOS.includes(tipo)) {
    throw new HttpError(404, 'Arquivo não encontrado.')
  }
  return { talkId, tipo }
}

const agora = () => Math.floor(Date.now() / 1000)

/** Pede ao serviço de arquivos, de servidor para servidor. */
async function falarComServico(
  metodo: 'GET' | 'DELETE',
  talkId: string,
  tipo: string,
  acao: 'conferir' | 'apagar',
  sufixo = '',
) {
  const { segredo, urlInterna } = servico()
  const token = assinar(segredo, { acao, talk: talkId, tipo, exp: agora() + 120 })
  return fetch(
    `${urlInterna}/talks/${talkId}/${encodeURIComponent(tipo)}${sufixo}?token=${token}`,
    { method: metodo, signal: AbortSignal.timeout(20_000) },
  )
}

/** Apagar lá é faxina: se falhar, o banco já não aponta para o arquivo. */
async function apagarNoServico(talkId: string, tipos: string[]) {
  for (const tipo of tipos) {
    try {
      await falarComServico('DELETE', talkId, tipo, 'apagar')
    } catch (erro) {
      console.error(`[talks] não apagou ${talkId}/${tipo} no serviço:`, (erro as Error).message)
    }
  }
}

interface TalkNaLista {
  id: string
  arquivos: Record<string, { versao: number }> | null
}

/**
 * Os links de leitura de todos os talks que esta pessoa alcança.
 *
 * Quem decide o alcance é `lista_talks()`, com a identidade de quem pediu:
 * rascunho só aparece para líder, e irmão/irmã não recebe link nenhum. O link
 * leva a versão do arquivo e vence numa janela de doze horas — o mesmo endereço
 * o dia inteiro, para o navegador guardar a capa, e um endereço novo quando o
 * arquivo muda.
 */
talksRouter.post(
  '/talks/links',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { segredo, url } = servico()

    const lista = await withUser(req.claims!, async (client) => {
      const { rows } = await client.query<{ lista: TalkNaLista[] }>(
        'select public.lista_talks() as lista',
      )
      return rows[0]?.lista ?? []
    })

    const exp = vencimentoDeLeitura()
    const links: Record<string, Partial<Record<Tipo, string>>> = {}

    for (const talk of lista) {
      const doTalk: Partial<Record<Tipo, string>> = {}
      for (const [tipo, arquivo] of Object.entries(talk.arquivos ?? {})) {
        const versao = String(arquivo.versao)
        const token = assinar(segredo, { acao: 'ler', talk: talk.id, tipo, versao, exp })
        doTalk[tipo as Tipo] = `${url}/talks/${talk.id}/${tipo}?v=${versao}&token=${token}`
      }
      links[talk.id] = doTalk
    }

    res.json({ links, expiraEm: exp })
  }),
)

/** Autoriza o celular a enviar um arquivo direto ao serviço de arquivos. */
talksRouter.post(
  '/talks/:id/arquivos/:tipo/envio',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { segredo, url } = servico()
    const { talkId, tipo } = alvo(req.params)
    const mime = typeof req.body?.mime === 'string' ? req.body.mime.toLowerCase() : ''
    const nome = typeof req.body?.nome === 'string' ? req.body.nome.slice(0, 200) : undefined
    const tamanho = Number(req.body?.tamanho ?? 0)

    if (!REGRAS[tipo].mimes.includes(mime)) {
      throw new HttpError(
        415,
        tipo === 'pdf' ? 'Envie o talk em PDF.' : 'Envie a arte em JPG, PNG ou WebP.',
      )
    }
    if (tamanho > REGRAS[tipo].maximo) {
      throw new HttpError(
        413,
        tipo === 'pdf' ? 'O PDF passa de 25 MB.' : 'A imagem é grande demais.',
      )
    }

    await withUser(req.claims!, async (client) => {
      await client.query('select public.pode_enviar_arquivo_talk($1)', [talkId])
    })

    const token = assinar(segredo, {
      acao: 'gravar',
      talk: talkId,
      tipo,
      mime,
      nome,
      maximo: REGRAS[tipo].maximo,
      // Uma hora: um PDF subindo por 4G ruim não pode perder a autorização no meio.
      exp: agora() + 60 * 60,
    })

    res.json({ url: `${url}/talks/${talkId}/${tipo}?token=${token}` })
  }),
)

interface Metadados {
  mime: string
  nome: string | null
  tamanho: number
  sha256: string
}

/**
 * O celular terminou de enviar: registra no banco o que chegou.
 *
 * Tamanho, tipo e hash vêm do próprio serviço de arquivos, que contou os bytes
 * enquanto gravava — não do navegador.
 */
talksRouter.post(
  '/talks/:id/arquivos/:tipo/confirmar',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { talkId, tipo } = alvo(req.params)

    let resposta: Response
    try {
      resposta = await falarComServico('GET', talkId, tipo, 'conferir', '/info')
    } catch {
      throw new HttpError(502, 'Não foi possível falar com o serviço de arquivos. Tente de novo.')
    }
    if (resposta.status === 404) {
      throw new HttpError(409, 'O arquivo não chegou ao servidor. Tente enviar de novo.')
    }
    if (!resposta.ok) {
      throw new HttpError(502, 'O serviço de arquivos não respondeu. Tente de novo.')
    }

    const metadados = (await resposta.json()) as Metadados

    await withUser(req.claims!, async (client) => {
      await client.query('select public.registrar_arquivo_talk($1, $2, $3, $4, $5, $6)', [
        talkId,
        tipo,
        metadados.mime,
        metadados.nome,
        metadados.tamanho,
        metadados.sha256,
      ])
    })

    res.status(204).end()
  }),
)

talksRouter.delete(
  '/talks/:id/arquivos/:tipo',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { talkId, tipo } = alvo(req.params)
    await withUser(req.claims!, async (client) => {
      await client.query('select public.apagar_arquivo_talk($1, $2)', [talkId, tipo])
    })
    // Tirar a arte leva a miniatura junto, como no banco.
    await apagarNoServico(talkId, tipo === 'arte' ? ['arte', 'capa'] : [tipo])
    res.status(204).end()
  }),
)

/** Apagar o talk passa por aqui para a pasta dele sair do serviço de arquivos junto. */
talksRouter.delete(
  '/talks/:id',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const talkId = String(req.params.id ?? '')
    if (!UUID.test(talkId)) throw new HttpError(404, 'Talk não encontrado.')

    await withUser(req.claims!, async (client) => {
      await client.query('select public.apagar_talk($1)', [talkId])
    })
    await apagarNoServico(talkId, ['*'])
    res.status(204).end()
  }),
)
