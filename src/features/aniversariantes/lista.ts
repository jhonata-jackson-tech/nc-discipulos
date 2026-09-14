/**
 * A lista de aniversariantes, do jeito que ela circula no WhatsApp.
 *
 *   *Janeiro*
 *   - 2: Patrícia
 *   - ⁠04 Jonas
 *    •   17: Vitor H
 *
 * O texto chega com marcadores diferentes, dia com e sem dois-pontos, e
 * caracteres invisíveis que o WhatsApp enfia no começo das linhas. Ler isso
 * aqui é o que deixa a liderança colar a lista inteira em vez de cadastrar
 * cinquenta nomes à mão.
 */

export const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

/** Dias de cada mês. Fevereiro aceita 29: quem nasceu nele existe. */
const DIAS_NO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export interface AniversarianteLido {
  nome: string
  dia: number
  mes: number
}

export interface LeituraDaLista {
  lidos: AniversarianteLido[]
  /** Linhas que pareciam um aniversário e não deu para entender. */
  ignoradas: string[]
}

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Tira o que o WhatsApp esconde: espaço de largura zero, word joiner, BOM. */
const limpar = (linha: string) => linha.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim()

export function dataValida(dia: number, mes: number): boolean {
  return (
    Number.isInteger(dia) &&
    Number.isInteger(mes) &&
    mes >= 1 &&
    mes <= 12 &&
    dia >= 1 &&
    dia <= DIAS_NO_MES[mes - 1]!
  )
}

export function lerLista(texto: string): LeituraDaLista {
  const lidos: AniversarianteLido[] = []
  const ignoradas: string[] = []
  let mes: number | null = null

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = limpar(bruta)
    if (!linha) continue

    // Um mês sozinho na linha, com ou sem *negrito* do WhatsApp.
    const cabecalho = semAcento(linha.replace(/[*_~:]/g, '').trim())
    const indice = MESES.findIndex((nome) => semAcento(nome) === cabecalho)
    if (indice >= 0) {
      mes = indice + 1
      continue
    }

    // "- 2: Patrícia", "• 17: Vitor H", "- 04 Jonas", "12 - Isabela"
    const conteudo = linha.replace(/^[-•*·–—]+\s*/, '')
    const achado = /^(\d{1,2})\s*[:.\-–—)]?\s*(.+)$/.exec(conteudo)
    if (!achado) {
      // Marcador vazio ("-") e títulos como "*ANIVERSARIANTES*" não são erro.
      if (/[a-zá-ú]/i.test(conteudo) && mes !== null && !/^\*.*\*$/.test(linha)) {
        ignoradas.push(linha)
      }
      continue
    }

    const dia = Number(achado[1])
    const nome = limpar(achado[2]!).replace(/\s+/g, ' ')

    if (mes === null || !nome || !dataValida(dia, mes)) {
      ignoradas.push(linha)
      continue
    }

    lidos.push({ nome, dia, mes })
  }

  return { lidos, ignoradas }
}

/** A mesma pessoa no mesmo dia: não entra duas vezes ao colar a lista de novo. */
export function chaveDoAniversariante(a: AniversarianteLido): string {
  return `${semAcento(a.nome).replace(/\s+/g, ' ').trim()}|${a.dia}|${a.mes}`
}

/**
 * Quantos dias faltam, a partir de hoje, para o próximo aniversário.
 *
 * Quem nasceu em 29 de fevereiro comemora em 28 quando o ano não tem o dia 29 —
 * é o que a família costuma fazer, e é melhor do que sumir da lista três anos
 * em cada quatro.
 */
export function diasAte(dia: number, mes: number, hoje: string): number {
  const [ano, mesHoje, diaHoje] = hoje.split('-').map(Number) as [number, number, number]
  const base = Date.UTC(ano, mesHoje - 1, diaHoje)

  const dataNoAno = (a: number) => {
    const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
    const d = mes === 2 && dia === 29 && !bissexto ? 28 : dia
    return Date.UTC(a, mes - 1, d)
  }

  let alvo = dataNoAno(ano)
  if (alvo < base) alvo = dataNoAno(ano + 1)
  return Math.round((alvo - base) / 86_400_000)
}

/** "hoje", "amanhã", "em 5 dias". */
export function quando(dias: number): string {
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  return `em ${dias} dias`
}
