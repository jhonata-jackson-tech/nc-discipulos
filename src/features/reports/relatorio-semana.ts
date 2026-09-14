import { formatWeekRange } from '@/lib/date'
import type {
  AvaliacaoDoCuidador,
  CareGender,
  RelatorioSemana,
  SituacaoDoCuidador,
} from '@/types/database'

export type Recorte = 'todos' | CareGender

export const avaliacaoLabel: Record<AvaliacaoDoCuidador, string> = {
  constante: 'Cuidando de verdade',
  oscilando: 'Oscilando',
  ausente: 'Não está cuidando',
  pouco_historico: 'Começando agora',
}

export const situacaoDoCuidadorLabel: Record<SituacaoDoCuidador, string> = {
  nenhum: 'Não registraram nenhum cuidado',
  parte: 'Cuidaram de parte',
  todos: 'Cuidaram de todos',
}

export interface NumerosDaSemana {
  combinados: number
  cuidados: number
  semResposta: number
  semContato: number
  precisamDaLideranca: number
  /** 0 a 100, arredondado. Nulo quando não havia nada combinado. */
  percentual: number | null
}

/**
 * O relatório só com os homens, só com as mulheres, ou inteiro.
 *
 * O GC cuida em dois grupos que não se misturam, e muitas vezes cada um tem a
 * sua liderança. Quem lidera os homens quer ler o relatório dos homens sem
 * fazer a conta de cabeça. Os números de capa são refeitos a partir das
 * pessoas — é a única forma de eles concordarem com as listas embaixo.
 */
export function recortar(
  relatorio: RelatorioSemana,
  recorte: Recorte,
): RelatorioSemana & { numeros: NumerosDaSemana } {
  const dentro = <T extends { genero: CareGender | null }>(item: T) =>
    recorte === 'todos' || item.genero === recorte

  const pessoas = relatorio.pessoas.filter(dentro)
  const cuidados = pessoas.filter((p) => p.situacao === 'cuidada').length

  return {
    ...relatorio,
    pessoas,
    cuidadores: relatorio.cuidadores.filter(dentro),
    semCuidadoHaMais: relatorio.semCuidadoHaMais.filter(dentro),
    numeros: {
      combinados: pessoas.length,
      cuidados,
      semResposta: pessoas.filter((p) => p.situacao === 'sem_resposta').length,
      semContato: pessoas.filter((p) => p.situacao === 'sem_contato').length,
      precisamDaLideranca: pessoas.filter((p) => p.atencao === 'leader_action').length,
      percentual: pessoas.length > 0 ? Math.round((cuidados / pessoas.length) * 100) : null,
    },
  }
}

/** "há 23 dias", "nunca teve cuidado registrado". */
export function tempoSemCuidado(dias: number | null): string {
  if (dias === null) return 'nunca teve cuidado registrado'
  if (dias <= 0) return 'cuidado nesta semana'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

/**
 * O resumo para colar no grupo da liderança.
 *
 * A liderança conversa no WhatsApp, e o relatório só serve se chegar onde a
 * conversa acontece. É texto com a marcação de lá (`*negrito*`), curto o
 * bastante para ser lido no celular, e sem o que só faz sentido dentro do app:
 * observação escrita por quem cuidou fica aqui dentro.
 */
export function resumoParaWhatsapp(
  relatorio: RelatorioSemana & { numeros: NumerosDaSemana },
  recorte: Recorte = 'todos',
): string {
  const { numeros } = relatorio
  const titulo =
    recorte === 'todos'
      ? 'Relatório do cuidado'
      : `Relatório do cuidado · ${recorte === 'male' ? 'homens' : 'mulheres'}`

  const linhas: string[] = [
    `*${titulo} · ${formatWeekRange(relatorio.semana.inicio, relatorio.semana.fim)}*`,
    '',
    `✅ ${numeros.cuidados} de ${numeros.combinados} pessoas cuidadas${numeros.percentual === null ? '' : ` (${numeros.percentual}%)`}`,
  ]

  if (numeros.semResposta > 0) linhas.push(`💬 ${numeros.semResposta} não responderam`)
  if (numeros.semContato > 0) linhas.push(`⚠️ ${numeros.semContato} sem nenhum contato`)
  if (numeros.precisamDaLideranca > 0) {
    linhas.push(`🙋 ${numeros.precisamDaLideranca} precisam da liderança`)
  }

  const grupo = (situacao: SituacaoDoCuidador) =>
    relatorio.cuidadores
      .filter((c) => c.situacao === situacao)
      .map((c) => (situacao === 'todos' ? c.nome : `${c.nome} (${c.feitos}/${c.total})`))

  for (const situacao of ['todos', 'parte', 'nenhum'] as const) {
    const nomes = grupo(situacao)
    if (nomes.length > 0) {
      linhas.push('', `*${situacaoDoCuidadorLabel[situacao]}:* ${nomes.join(', ')}`)
    }
  }

  const semCuidado = relatorio.pessoas.filter((p) => p.situacao !== 'cuidada')
  if (semCuidado.length > 0) {
    linhas.push(
      '',
      `*Ficaram sem cuidado:* ${semCuidado.map((p) => `${p.nome} (com ${p.cuidador})`).join(', ')}`,
    )
  }

  const haMais = relatorio.semCuidadoHaMais
    .filter((p) => p.dias === null || p.dias > 14)
    .slice(0, 5)
  if (haMais.length > 0) {
    linhas.push(
      '',
      `*Há mais tempo sem cuidado:* ${haMais
        .map((p) => `${p.nome} (${p.dias === null ? 'nunca' : `${p.dias} dias`})`)
        .join(', ')}`,
    )
  }

  return linhas.join('\n')
}
