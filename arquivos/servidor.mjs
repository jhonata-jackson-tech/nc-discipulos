/**
 * Discípulos :: serviço de arquivos.
 *
 * Guarda o PDF e a arte dos talks num disco no Brasil, e entrega por um túnel
 * da Cloudflare. Existe porque a VPS do app fica em Ashburn, na Virgínia: a
 * 190 ms de distância, um PDF de 6 MB levava 25 segundos para subir e 12 para
 * abrir. Daqui ele fica a poucos milissegundos de todo mundo do GC.
 *
 * Este serviço não sabe quem é quem. Cada pedido traz uma autorização assinada
 * pela API da VPS (`assinatura.mjs`), que já conferiu no banco se a pessoa pode
 * ler ou gravar aquele arquivo. Sem assinatura válida, nada entra e nada sai.
 *
 * Sem dependências de propósito: um serviço que só guarda e entrega bytes não
 * deveria precisar de `npm install` para subir de novo daqui a dois anos.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { assinaturaDoArquivoConfere, conferir, faixa } from './assinatura.mjs'

const SEGREDO = process.env.ARQUIVOS_SECRET ?? ''
const PASTA = process.env.PASTA ?? '/dados'
const PORTA = Number(process.env.PORT ?? 8130)
const ORIGENS = (process.env.ORIGENS ?? '')
  .split(',')
  .map((origem) => origem.trim())
  .filter(Boolean)

if (SEGREDO.length < 32) {
  console.error('[arquivos] ARQUIVOS_SECRET ausente ou curto demais (32+ caracteres).')
  process.exit(1)
}

const ROTA = /^\/talks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(pdf|arte|capa|\*)(\/info)?$/i

const pastaDoTalk = (talk) => path.join(PASTA, 'talks', talk.toLowerCase())
const caminho = (talk, tipo) => path.join(pastaDoTalk(talk), tipo)

function responderJson(res, status, corpo) {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'no-store',
  })
  res.end(texto)
}

/**
 * O app mora em outro endereço: sem estes cabeçalhos o navegador não deixa a
 * página ler o PDF nem enviar o arquivo. Só as origens configuradas passam.
 */
function cors(req, res) {
  const origem = req.headers.origin
  if (origem && ORIGENS.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type')
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Accept-Ranges, Content-Range, Content-Length, ETag',
    )
    res.setHeader('Access-Control-Max-Age', '86400')
  }
}

async function lerMetadados(talk, tipo) {
  try {
    return JSON.parse(await fsp.readFile(`${caminho(talk, tipo)}.json`, 'utf8'))
  } catch {
    return null
  }
}

function nomeParaCabecalho(nome, disposicao) {
  const ascii = nome.replace(/[^\x20-\x7e]|"/g, '_')
  return `${disposicao}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

// ------------------------------------------------------------------ gravar
/**
 * Recebe o arquivo em fluxo, direto para o disco.
 *
 * Nada fica inteiro na memória: conta os bytes, calcula o hash e confere os
 * primeiros bytes contra o tipo autorizado enquanto grava num arquivo
 * temporário. Só no fim ele toma o lugar do anterior — um envio que cai no meio
 * não estraga o PDF que já estava lá.
 */
async function gravar(req, res, autorizacao, talk, tipo) {
  const declarado = Number(req.headers['content-length'] ?? NaN)
  if (Number.isFinite(declarado) && declarado > (autorizacao.maximo ?? 0)) {
    req.resume()
    return responderJson(res, 413, { error: 'Arquivo grande demais.' })
  }

  await fsp.mkdir(pastaDoTalk(talk), { recursive: true })
  const temporario = `${caminho(talk, tipo)}.envio-${crypto.randomUUID()}`
  const hash = crypto.createHash('sha256')
  let tamanho = 0
  let inicio = Buffer.alloc(0)
  let recusado = null

  const conferencia = async function* (fonte) {
    for await (const pedaco of fonte) {
      tamanho += pedaco.length
      if (tamanho > (autorizacao.maximo ?? 0)) {
        recusado = { status: 413, error: 'Arquivo grande demais.' }
        throw new Error('grande demais')
      }
      if (inicio.length < 16) inicio = Buffer.concat([inicio, pedaco]).subarray(0, 16)
      hash.update(pedaco)
      yield pedaco
    }
  }

  try {
    await pipeline(req, conferencia, fs.createWriteStream(temporario))
  } catch (erro) {
    await fsp.rm(temporario, { force: true })
    if (recusado) {
      req.resume()
      return responderJson(res, recusado.status, { error: recusado.error })
    }
    throw erro
  }

  if (tamanho === 0 || !assinaturaDoArquivoConfere(autorizacao.mime ?? '', inicio)) {
    await fsp.rm(temporario, { force: true })
    return responderJson(res, 415, {
      error: tipo === 'pdf' ? 'Envie o talk em PDF.' : 'Envie a arte em JPG, PNG ou WebP.',
    })
  }

  const metadados = {
    mime: autorizacao.mime,
    nome: autorizacao.nome ?? null,
    tamanho,
    sha256: hash.digest('hex'),
    atualizadoEm: new Date().toISOString(),
  }

  await fsp.rename(temporario, caminho(talk, tipo))
  await fsp.writeFile(`${caminho(talk, tipo)}.json`, JSON.stringify(metadados))
  responderJson(res, 200, metadados)
}

// ------------------------------------------------------------------- ler
async function entregar(req, res, autorizacao, talk, tipo, url) {
  const metadados = await lerMetadados(talk, tipo)
  if (!metadados) return responderJson(res, 404, { error: 'Arquivo não encontrado.' })

  const etag = `"${metadados.sha256}"`
  const cabecalhos = {
    'Content-Type': metadados.mime,
    'Accept-Ranges': 'bytes',
    ETag: etag,
    // O endereço carrega a versão do arquivo: quando ele muda, o endereço
    // muda junto. Por isso dá para guardar por uma semana sem risco de mostrar
    // a arte antiga — e `private` impede qualquer cache no caminho.
    'Cache-Control': 'private, max-age=604800',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': nomeParaCabecalho(
      metadados.nome || `talk.${tipo === 'pdf' ? 'pdf' : 'jpg'}`,
      url.searchParams.get('baixar') === '1' ? 'attachment' : 'inline',
    ),
  }

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, cabecalhos)
    return res.end()
  }

  const pedido = faixa(req.headers.range, metadados.tamanho)
  if (pedido === false) {
    res.writeHead(416, { ...cabecalhos, 'Content-Range': `bytes */${metadados.tamanho}` })
    return res.end()
  }

  const { inicio, fim } = pedido ?? { inicio: 0, fim: metadados.tamanho - 1 }
  res.writeHead(pedido ? 206 : 200, {
    ...cabecalhos,
    'Content-Length': fim - inicio + 1,
    ...(pedido ? { 'Content-Range': `bytes ${inicio}-${fim}/${metadados.tamanho}` } : {}),
  })

  if (req.method === 'HEAD') return res.end()
  await pipeline(fs.createReadStream(caminho(talk, tipo), { start: inicio, end: fim }), res)
}

// ----------------------------------------------------------------- apagar
async function apagar(res, talk, tipo) {
  if (tipo === '*') {
    await fsp.rm(pastaDoTalk(talk), { recursive: true, force: true })
  } else {
    await fsp.rm(caminho(talk, tipo), { force: true })
    await fsp.rm(`${caminho(talk, tipo)}.json`, { force: true })
  }
  res.writeHead(204)
  res.end()
}

// ---------------------------------------------------------------- servidor
async function atender(req, res) {
  const url = new URL(req.url ?? '/', 'http://arquivos')
  cors(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  if (url.pathname === '/saude') {
    await fsp.access(PASTA, fs.constants.W_OK)
    return responderJson(res, 200, { status: 'ok' })
  }

  const rota = ROTA.exec(url.pathname)
  if (!rota) return responderJson(res, 404, { error: 'Não encontrado.' })

  const [, talk, tipo, info] = rota
  const autorizacao = conferir(SEGREDO, url.searchParams.get('token') ?? '')
  const vale = (acao) =>
    autorizacao?.acao === acao &&
    autorizacao.talk?.toLowerCase() === talk.toLowerCase() &&
    autorizacao.tipo === tipo

  if (req.method === 'PUT' && !info && tipo !== '*' && vale('gravar')) {
    return gravar(req, res, autorizacao, talk, tipo)
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && !info && tipo !== '*' && vale('ler')) {
    return entregar(req, res, autorizacao, talk, tipo, url)
  }
  if (req.method === 'GET' && info && vale('conferir')) {
    const metadados = await lerMetadados(talk, tipo)
    return metadados
      ? responderJson(res, 200, metadados)
      : responderJson(res, 404, { error: 'Arquivo não encontrado.' })
  }
  if (req.method === 'DELETE' && !info && vale('apagar')) {
    return apagar(res, talk, tipo)
  }

  req.resume()
  responderJson(res, 403, { error: 'Link vencido. Abra o talk de novo pelo app.' })
}

const servidor = http.createServer((req, res) => {
  const comeco = Date.now()
  res.on('finish', () => {
    // Sem a query: o token não vai para o log.
    console.log(
      `[arquivos] ${req.method} ${(req.url ?? '').split('?')[0]} ${res.statusCode} ${Date.now() - comeco}ms`,
    )
  })

  atender(req, res).catch((erro) => {
    console.error('[arquivos] erro:', erro)
    if (!res.headersSent) responderJson(res, 500, { error: 'Algo deu errado. Tente novamente.' })
    else res.destroy()
  })
})

// Um PDF subindo por um 4G ruim pode levar minutos; o padrão do Node corta em 5.
servidor.requestTimeout = 30 * 60 * 1000
servidor.headersTimeout = 60 * 1000

servidor.listen(PORTA, () => {
  console.log(`[arquivos] guardando em ${PASTA}, ouvindo na porta ${PORTA}`)
})

for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => servidor.close(() => process.exit(0)))
}
