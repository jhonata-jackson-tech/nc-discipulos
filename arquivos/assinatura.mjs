import crypto from 'node:crypto'

/**
 * A autorização que viaja no endereço de um arquivo.
 *
 * O serviço de arquivos mora em outra máquina, no Brasil, e não conhece o
 * banco: ele não sabe quem é líder, nem se um talk já foi publicado. Quem sabe
 * é a API da VPS. Então a API confere no banco e assina uma autorização
 * estreita — "pode ler o PDF deste talk até tal hora" — e o serviço de arquivos
 * só confere a assinatura.
 *
 * Formato: `base64url(json).base64url(hmac-sha256)`. Não é JWT de propósito:
 * o token de sessão do app é JWT, e um formato diferente com um segredo
 * diferente garante que um não passe pelo outro por engano.
 *
 * O mesmo arquivo é usado pelos dois lados — a API assina, o serviço confere —
 * para nunca existirem duas versões da regra.
 */

const b64 = (dados) => Buffer.from(dados).toString('base64url')

function hmac(segredo, conteudo) {
  return crypto.createHmac('sha256', segredo).update(conteudo).digest('base64url')
}

/**
 * @param {string} segredo
 * @param {{ acao: 'ler' | 'gravar' | 'conferir' | 'apagar', talk: string, tipo: string, exp: number, [k: string]: unknown }} autorizacao
 */
export function assinar(segredo, autorizacao) {
  if (!segredo || segredo.length < 32) throw new Error('ARQUIVOS_SECRET precisa ter 32+ caracteres.')
  const corpo = b64(JSON.stringify(autorizacao))
  return `${corpo}.${hmac(segredo, corpo)}`
}

/**
 * Devolve a autorização se a assinatura confere e ela não venceu; senão, nulo.
 *
 * @param {string} segredo
 * @param {string} token
 * @param {number} [agora] epoch em segundos
 */
export function conferir(segredo, token, agora = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string') return null
  const [corpo, assinatura, sobra] = token.split('.')
  if (!corpo || !assinatura || sobra !== undefined) return null

  const esperada = Buffer.from(hmac(segredo, corpo))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) {
    return null
  }

  try {
    const autorizacao = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
    if (typeof autorizacao?.exp !== 'number' || autorizacao.exp < agora) return null
    return autorizacao
  } catch {
    return null
  }
}

/**
 * O vencimento de um link de leitura, arredondado para uma janela de doze horas.
 *
 * Com o mesmo vencimento o dia inteiro, o endereço da capa não muda a cada
 * abertura do app, e o navegador consegue guardar a imagem. Vale pelo menos
 * doze horas a partir de agora.
 */
export function vencimentoDeLeitura(agora = Math.floor(Date.now() / 1000)) {
  const janela = 12 * 60 * 60
  return (Math.floor(agora / janela) + 2) * janela
}

/**
 * A faixa pedida em `Range: bytes=...`, ou nulo para o arquivo inteiro.
 *
 * Só uma faixa por pedido — é o que o leitor de PDF usa. Faixa impossível
 * devolve `false`, e quem chamou responde 416.
 *
 * @param {string | undefined} cabecalho
 * @param {number} tamanho
 * @returns {{ inicio: number, fim: number } | null | false}
 */
export function faixa(cabecalho, tamanho) {
  if (!cabecalho) return null
  const achado = /^bytes=(\d*)-(\d*)$/.exec(cabecalho.trim())
  if (!achado || (achado[1] === '' && achado[2] === '')) return false

  let inicio
  let fim
  if (achado[1] === '') {
    // "bytes=-500": os últimos 500 bytes.
    const ultimos = Number(achado[2])
    if (ultimos === 0) return false
    inicio = Math.max(0, tamanho - ultimos)
    fim = tamanho - 1
  } else {
    inicio = Number(achado[1])
    fim = achado[2] === '' ? tamanho - 1 : Math.min(Number(achado[2]), tamanho - 1)
  }

  if (inicio >= tamanho || fim < inicio) return false
  return { inicio, fim }
}

/** Os primeiros bytes batem com o tipo declarado? */
export function assinaturaDoArquivoConfere(mime, bytes) {
  const inicio = (texto, deslocamento = 0) =>
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
