/**
 * O texto como ele chega.
 *
 * O devocional é colado do WhatsApp, e vem com a formatação de lá: parágrafos
 * separados por linha em branco, versículos quebrados linha a linha, e
 * `*negrito*` marcado com asteriscos. Guardamos o texto exatamente como foi
 * escrito — quem escreveu não deveria precisar aprender uma sintaxe nova — e é
 * a leitura que o transforma em parágrafos.
 *
 * O resultado é uma estrutura, não HTML: a tela monta elementos do React a
 * partir dela. Texto de terceiros nunca vira marcação executável.
 */
export interface Trecho {
  texto: string
  forte: boolean
  enfase: boolean
}

/** Um parágrafo é uma lista de linhas; cada linha, uma lista de trechos. */
export type Paragrafo = Trecho[][]

/** `*negrito*` e `_itálico_`, como o WhatsApp marca. */
const MARCA = /\*([^*\n]+)\*|_([^_\n]+)_/g

function lerLinha(linha: string): Trecho[] {
  const trechos: Trecho[] = []
  let ultimo = 0

  for (const achado of linha.matchAll(MARCA)) {
    const inicio = achado.index
    if (inicio > ultimo) {
      trechos.push({ texto: linha.slice(ultimo, inicio), forte: false, enfase: false })
    }
    trechos.push({
      texto: achado[1] ?? achado[2] ?? '',
      forte: achado[1] !== undefined,
      enfase: achado[2] !== undefined,
    })
    ultimo = inicio + achado[0].length
  }

  if (ultimo < linha.length) {
    trechos.push({ texto: linha.slice(ultimo), forte: false, enfase: false })
  }

  return trechos
}

export function lerDevocional(bruto: string): Paragrafo[] {
  return (
    bruto
      .replace(/\r\n?/g, '\n')
      .trim()
      // Duas ou mais quebras separam parágrafos; uma só é quebra de linha
      // dentro do mesmo — é assim que um versículo citado se mantém inteiro.
      .split(/\n{2,}/)
      .map((paragrafo) =>
        paragrafo
          .split('\n')
          .map((linha) => linha.trim())
          .filter((linha) => linha.length > 0)
          .map(lerLinha),
      )
      .filter((paragrafo) => paragrafo.length > 0)
  )
}

/** Quanto tempo de leitura, para a pessoa saber no que está entrando. */
export function tempoDeLeitura(bruto: string): number {
  const palavras = bruto.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(palavras / 200))
}
