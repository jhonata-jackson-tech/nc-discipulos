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

/** Aceita só o endereço do serviço certo; o banco confere de novo. */
export function linkDoSpotify(url: string): boolean {
  return /^https:\/\/([a-z0-9-]+\.)*spotify\.com\//i.test(url.trim())
}

export function linkDoYoutube(url: string): boolean {
  return /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i.test(url.trim())
}

/**
 * Link de playlist do YouTube que parece cortado.
 *
 * Os identificadores de playlist têm dezenas de caracteres ("PL" + 16 ou 32).
 * Um link colado pela metade abre uma página de erro na quinta à noite; avisar
 * na hora de salvar custa uma linha.
 */
export function playlistDoYoutubeIncompleta(url: string): boolean {
  try {
    const lista = new URL(url.trim()).searchParams.get('list')
    return lista !== null && lista.length < 18
  } catch {
    return false
  }
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** "Tema 8 · Alegria como combustível da perseverança" */
export function tituloDoTalk(talk: { numero: number | null; tema: string }): string {
  return talk.numero ? `Tema ${talk.numero} · ${talk.tema}` : talk.tema
}
