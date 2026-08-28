import crypto from 'node:crypto'

/**
 * Hash de senha com scrypt.
 *
 * Antes isso vivia no banco, pelo pgcrypto. Ele nao existe em toda instalacao
 * de Postgres - e faltava justamente na maquina de producao, compilada sem os
 * modulos contrib. Trazer o hash para ca tira a exigencia: a aplicacao roda em
 * qualquer Postgres 13+, sem extensao nenhuma.
 *
 * scrypt e o que o Node traz de fabrica e e uma funcao *memory-hard*: para
 * quebrar por forca bruta nao basta ter muitos nucleos, e preciso ter muita
 * memoria por tentativa. Nao ha dependencia nova para auditar.
 */

/** ~16 MB e ~50ms por verificacao: caro para quem tenta adivinhar, imperceptivel para quem entra. */
const CUSTO = 16_384
const BLOCO = 8
const PARALELISMO = 1
const TAMANHO = 32

/** Guarda os parametros junto do hash: mudar o custo depois nao invalida o que ja existe. */
const FORMATO = 'scrypt'

function derivar(senha: string, salt: Buffer, custo: number, bloco: number, paralelismo: number) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      senha.normalize('NFKC'),
      salt,
      TAMANHO,
      { N: custo, r: bloco, p: paralelismo, maxmem: 64 * 1024 * 1024 },
      (erro, chave) => (erro ? reject(erro) : resolve(chave)),
    )
  })
}

export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const chave = await derivar(senha, salt, CUSTO, BLOCO, PARALELISMO)
  return [
    FORMATO,
    CUSTO,
    BLOCO,
    PARALELISMO,
    salt.toString('base64'),
    chave.toString('base64'),
  ].join('$')
}

/**
 * Comparacao em tempo constante: um `===` vaza, pelo tempo de resposta, quantos
 * bytes iniciais bateram.
 */
export async function senhaConfere(senha: string, guardado: string): Promise<boolean> {
  const partes = (guardado ?? '').split('$')
  if (partes.length !== 6 || partes[0] !== FORMATO) return false

  const [, custo, bloco, paralelismo, salt, chave] = partes
  let esperado: Buffer
  try {
    esperado = Buffer.from(chave!, 'base64')
    const calculado = await derivar(
      senha,
      Buffer.from(salt!, 'base64'),
      Number(custo),
      Number(bloco),
      Number(paralelismo),
    )
    if (calculado.length !== esperado.length) return false
    return crypto.timingSafeEqual(calculado, esperado)
  } catch {
    return false
  }
}
