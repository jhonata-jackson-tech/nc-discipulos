import { describe, expect, it } from 'vitest'
import { recortar, resumoParaWhatsapp, tempoSemCuidado } from './relatorio-semana'
import type {
  RelatorioSemana,
  RelatorioSemanaCuidador,
  RelatorioSemanaPessoa,
  SituacaoDoCuidado,
} from '@/types/database'

function pessoa(
  nome: string,
  genero: 'male' | 'female',
  situacao: SituacaoDoCuidado,
  cuidador: string,
): RelatorioSemanaPessoa {
  return {
    id: nome,
    nome,
    nomeCompleto: nome,
    papel: 'member',
    genero,
    cuidadorId: cuidador,
    cuidador,
    situacao,
    contatoEm: null,
    registros: 0,
    canal: null,
    comoEsta: null,
    vemAoGc: null,
    atencao: situacao === 'sem_contato' ? 'leader_action' : 'normal',
    observacao: 'texto privado de quem cuidou',
    ultimoCuidado: null,
    semanasSemCuidado: 0,
  }
}

function cuidador(
  nome: string,
  genero: 'male' | 'female',
  feitos: number,
  total: number,
): RelatorioSemanaCuidador {
  return {
    id: nome,
    nome,
    nomeCompleto: nome,
    papel: 'disciple',
    genero,
    total,
    feitos,
    tentativas: 0,
    semContato: total - feitos,
    situacao: feitos === total ? 'todos' : feitos === 0 ? 'nenhum' : 'parte',
    avaliacao: 'constante',
    constancia: { semanas: 4, combinados: 10, feitos: 9, tentativas: 0, taxa: 0.9 },
    historico: [],
    pessoas: [],
  }
}

const relatorio: RelatorioSemana = {
  semana: {
    id: 's',
    inicio: '2026-09-07',
    fim: '2026-09-13',
    situacao: 'closed',
    publicadaEm: null,
    encerradaEm: null,
  },
  resumo: {
    combinados: 4,
    cuidados: 2,
    semResposta: 1,
    semContato: 1,
    precisamDaLideranca: 1,
    vemAoGc: 0,
    cuidadores: 3,
    anterior: null,
  },
  cuidadores: [
    cuidador('Ana', 'female', 2, 2),
    cuidador('Bruno', 'male', 0, 1),
    cuidador('Caio', 'male', 1, 1),
  ],
  pessoas: [
    pessoa('Dani', 'female', 'cuidada', 'Ana'),
    pessoa('Eva', 'female', 'cuidada', 'Ana'),
    pessoa('Fábio', 'male', 'sem_contato', 'Bruno'),
    pessoa('Gil', 'male', 'sem_resposta', 'Caio'),
  ],
  semCuidadoHaMais: [
    {
      id: 'Fábio',
      nome: 'Fábio',
      nomeCompleto: 'Fábio',
      papel: 'member',
      genero: 'male',
      ultimoCuidado: null,
      dias: null,
      semanasSemCuidado: 3,
      cuidadorNaSemana: 'Bruno',
    },
    {
      id: 'Eva',
      nome: 'Eva',
      nomeCompleto: 'Eva',
      papel: 'member',
      genero: 'female',
      ultimoCuidado: '2026-09-10',
      dias: 3,
      semanasSemCuidado: 0,
      cuidadorNaSemana: 'Ana',
    },
  ],
  transferencias: [],
  geradoEm: '2026-09-14T10:00:00Z',
}

describe('recortar', () => {
  it('refaz os números de capa a partir das pessoas do recorte', () => {
    const homens = recortar(relatorio, 'male')
    expect(homens.numeros).toEqual({
      combinados: 2,
      cuidados: 0,
      semResposta: 1,
      semContato: 1,
      precisamDaLideranca: 1,
      percentual: 0,
    })
    expect(homens.cuidadores.map((c) => c.nome)).toEqual(['Bruno', 'Caio'])
    expect(homens.semCuidadoHaMais.map((p) => p.nome)).toEqual(['Fábio'])
  })

  it('não inventa percentual quando não havia nada combinado', () => {
    expect(recortar({ ...relatorio, pessoas: [] }, 'todos').numeros.percentual).toBeNull()
  })
})

describe('resumoParaWhatsapp', () => {
  const texto = resumoParaWhatsapp(recortar(relatorio, 'todos'))

  it('abre com o período e o que foi feito', () => {
    expect(texto.split('\n')[0]).toBe('*Relatório do cuidado · 7 a 13 de setembro*')
    expect(texto).toContain('✅ 2 de 4 pessoas cuidadas (50%)')
  })

  it('separa quem cuidou de todos, de parte e de ninguém', () => {
    expect(texto).toContain('*Cuidaram de todos:* Ana, Caio')
    expect(texto).toContain('*Não registraram nenhum cuidado:* Bruno (0/1)')
  })

  it('lista quem ficou sem cuidado com quem era responsável', () => {
    expect(texto).toContain('*Ficaram sem cuidado:* Fábio (com Bruno), Gil (com Caio)')
  })

  it('não leva para fora a observação escrita por quem cuidou', () => {
    expect(texto).not.toContain('texto privado')
  })

  it('só chama de "há mais tempo" quem passou de duas semanas', () => {
    expect(texto).toContain('*Há mais tempo sem cuidado:* Fábio (nunca)')
    expect(texto).not.toContain('Eva (3 dias)')
  })
})

describe('tempoSemCuidado', () => {
  it('fala como gente', () => {
    expect(tempoSemCuidado(null)).toBe('nunca teve cuidado registrado')
    expect(tempoSemCuidado(1)).toBe('há 1 dia')
    expect(tempoSemCuidado(23)).toBe('há 23 dias')
  })
})
