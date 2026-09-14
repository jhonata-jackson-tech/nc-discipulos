import express, { Router } from 'express'
import { withUser } from '../db.ts'
import { asyncRoute, HttpError, requireSession, type AuthedRequest } from '../http.ts'
import { signFileKey, verifyFileKey } from '../tokens.ts'

/**
 * Os arquivos do talk: o PDF, a arte e a miniatura dela.
 *
 * O PostgREST fala JSON, e um PDF de 6 MB em base64 dentro de um JSON pesaria
 * 8 MB e travaria o celular de quem envia. Por isso os bytes passam por aqui,
 * crus. O resto do talk - tema, playlists, publicar - continua indo direto ao
 * PostgREST, como tudo no app.
 *
 * Nenhuma regra de acesso mora neste arquivo: gravar e ler rodam com a
 * identidade de quem pediu, e as funcoes do banco decidem.
 */
export const talksRouter = Router()

type Tipo = 'pdf' | 'arte' | 'capa'

const TIPOS: Tipo[] = ['pdf', 'arte', 'capa']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O que cada tipo aceita. O banco confere de novo - aqui e so para errar cedo. */
const MIMES: Record<Tipo, string[]> = {
  pdf: ['application/pdf'],
  arte: ['image/jpeg', 'image/png', 'image/webp'],
  capa: ['image/jpeg', 'image/png', 'image/webp'],
}

function alvo(req: express.Request): { talkId: string; tipo: Tipo } {
  const talkId = String(req.params.id ?? '')
  const tipo = String(req.params.tipo ?? '') as Tipo
  if (!UUID.test(talkId) || !TIPOS.includes(tipo)) {
    throw new HttpError(404, 'Arquivo não encontrado.')
  }
  return { talkId, tipo }
}

/**
 * O conteudo e mesmo o que diz ser?
 *
 * O `Content-Type` e so o que o navegador declarou. Conferir a assinatura dos
 * primeiros bytes impede que um arquivo qualquer renomeado para .pdf seja
 * servido depois como PDF para o GC inteiro.
 */
function assinaturaConfere(mime: string, bytes: Buffer): boolean {
  const inicio = (texto: string, deslocamento = 0) =>
    bytes.subarray(deslocamento, deslocamento + texto.length).toString('latin1') === texto

  switch (mime) {
    case 'application/pdf':
      return inicio('%PDF-')
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/png':
      return inicio('\x89PNG')
    case 'image/webp':
      return inicio('RIFF') && inicio('WEBP', 8)
    default:
      return false
  }
}

/** A chave que vai no endereco das imagens e do PDF. */
talksRouter.post(
  '/arquivos/chave',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    res.json(signFileKey({ id: req.claims!.sub, email: req.claims!.email }))
  }),
)

talksRouter.put(
  '/talks/:id/arquivos/:tipo',
  requireSession,
  // 26 MB: o teto do banco para o PDF e 25 MB, e a folga evita que o arquivo
  // no limite seja recusado aqui com uma mensagem pior que a do banco.
  express.raw({ type: () => true, limit: '26mb' }),
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { talkId, tipo } = alvo(req)
    // O tipo de verdade vem em `X-Tipo-Arquivo`. O `Content-Type` do envio e
    // sempre `application/octet-stream`: o ModSecurity do cPanel, na frente
    // da VPS, recusa `application/pdf` e `image/*` antes de o pedido chegar
    // aqui (regra 920420 do OWASP CRS), e devolve so um 502 para o celular.
    const declarado = req.header('x-tipo-arquivo') ?? req.header('content-type') ?? ''
    const mime = declarado.split(';')[0]!.trim().toLowerCase()
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)

    if (bytes.length === 0) throw new HttpError(400, 'O arquivo chegou vazio.')
    if (!MIMES[tipo].includes(mime) || !assinaturaConfere(mime, bytes)) {
      throw new HttpError(
        415,
        tipo === 'pdf' ? 'Envie o talk em PDF.' : 'Envie a arte em JPG, PNG ou WebP.',
      )
    }

    let nome: string | null = null
    try {
      nome = decodeURIComponent(req.header('x-nome-arquivo') ?? '').slice(0, 200) || null
    } catch {
      nome = null
    }

    await withUser(req.claims!, async (client) => {
      await client.query('select public.salvar_arquivo_talk($1, $2, $3, $4, $5)', [
        talkId,
        tipo,
        mime,
        nome,
        bytes,
      ])
    })

    res.status(204).end()
  }),
)

talksRouter.delete(
  '/talks/:id/arquivos/:tipo',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { talkId, tipo } = alvo(req)
    await withUser(req.claims!, async (client) => {
      await client.query('select public.apagar_arquivo_talk($1, $2)', [talkId, tipo])
    })
    res.status(204).end()
  }),
)

interface Arquivo {
  mime: string
  nome: string | null
  tamanho: number
  conteudo: Buffer
  atualizado_em: Date
}

/** `?baixar=1` pede para salvar em vez de abrir - e o que o "Salvar arte" usa. */
talksRouter.get(
  '/talks/:id/arquivos/:tipo',
  asyncRoute(async (req, res) => {
    const { talkId, tipo } = alvo(req)
    const claims = verifyFileKey(typeof req.query.chave === 'string' ? req.query.chave : '')
    if (!claims) throw new HttpError(401, 'Link vencido. Abra o talk de novo pelo app.')

    const arquivo = await withUser(claims, async (client) => {
      const { rows } = await client.query<Arquivo>('select * from public.arquivo_talk($1, $2)', [
        talkId,
        tipo,
      ])
      return rows[0] ?? null
    })

    if (!arquivo) throw new HttpError(404, 'Arquivo não encontrado.')

    const etag = `"${tipo}-${arquivo.atualizado_em.getTime()}"`
    res.setHeader('ETag', etag)
    // Privado: nenhum proxy no caminho guarda material que so o GC alcanca. O
    // endereco muda quando o arquivo muda (`v=` na tela), entao o navegador
    // pode guardar sem medo de mostrar a arte antiga.
    res.setHeader('Cache-Control', 'private, max-age=86400')

    if (req.header('if-none-match') === etag) {
      res.status(304).end()
      return
    }

    const extensao = arquivo.mime === 'application/pdf' ? 'pdf' : arquivo.mime.split('/')[1]
    const nome = arquivo.nome || `talk.${extensao}`
    const disposicao = req.query.baixar === '1' ? 'attachment' : 'inline'

    res.setHeader('Content-Type', arquivo.mime)
    res.setHeader('Content-Length', String(arquivo.conteudo.length))
    res.setHeader(
      'Content-Disposition',
      `${disposicao}; filename="${nome.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    )
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(arquivo.conteudo)
  }),
)
