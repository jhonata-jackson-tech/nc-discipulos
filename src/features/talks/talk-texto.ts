import { addDays, parseISODate, todayISO } from '@/lib/date'

/**
 * "Alegria como combustível da perseverança" a partir de "ALEGRIA COMO
 * COMBUSTÍVEL DA PERSEVERANÇA". O material chega gritando no nome do arquivo;
 * no app ele fala baixo, como o resto.
 */
export function comoFrase(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (!limpo) return ''
  const minusculo = limpo.toLocaleLowerCase('pt-BR')
  return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1)
}

/**
 * O tema e o número a partir do nome do PDF.
 *
 * O arquivo da igreja chega como "NEXT 27+ - TEMA 8 - ALEGRIA COMO COMBUSTÍVEL
 * DA PERSEVERANÇA .pdf". Ler isso poupa digitar o que já está escrito — e
 * quando o nome vier diferente, não adivinha: devolve vazio e a pessoa digita.
 */
export function lerNomeDoPdf(nomeDoArquivo: string): { numero: number | null; tema: string } {
  const semExtensao = nomeDoArquivo.replace(/\.pdf\s*$/i, '').trim()
  const achado = /tema\s*(\d+)\s*[-–—:]\s*(.+)$/i.exec(semExtensao)
  if (!achado) return { numero: null, tema: '' }
  return { numero: Number(achado[1]), tema: comoFrase(achado[2]!) }
}

/**
 * O próximo dia de GC a partir de hoje — hoje, se hoje for o dia.
 *
 * O material chega na segunda para o encontro de quinta: "para o GC de quinta"
 * é o que a pessoa quer ler, não "semana de 14 de setembro".
 */
export function proximoDiaDeGc(diaDaSemana: number, apartir: string = todayISO()): string {
  const diferenca = (diaDaSemana - parseISODate(apartir).getUTCDay() + 7) % 7
  return addDays(apartir, diferenca)
}

/**
 * O endereço para abrir um link colado.
 *
 * O link é guardado exatamente como veio — encurtado, com parâmetros, do app de
 * música. Só na hora de abrir, se ele veio sem `https://`, o app completa: sem
 * isso o navegador trataria "open.spotify.com/…" como um caminho dentro do
 * próprio Discípulos.
 */
export function comoLink(colado: string): string {
  const limpo = colado.trim()
  if (!limpo) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(limpo) ? limpo : `https://${limpo}`
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** "Tema 8 · Alegria como combustível da perseverança" */
export function tituloDoTalk(talk: { numero: number | null; tema: string }): string {
  return talk.numero ? `Tema ${talk.numero} · ${talk.tema}` : talk.tema
}
