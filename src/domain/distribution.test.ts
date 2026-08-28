import { describe, expect, it } from 'vitest'
import {
  DistributionError,
  generateDistribution,
  type DistributionInput,
  type Participant,
  type PairHistory,
} from './distribution'

// ---------------------------------------------------------------- utilidades
function person(id: string, role: Participant['role'], careGender: Participant['careGender']) {
  return { id, fullName: id, role, careGender } satisfies Participant
}

function baseInput(overrides: Partial<DistributionInput> = {}): DistributionInput {
  return {
    seed: 'semana-teste',
    participants: [],
    fixedLinks: [],
    restrictions: [],
    history: [],
    extraSlotHistory: {},
    ...overrides,
  }
}

/** Elenco real do GC (33 pessoas), com os generos definidos apenas no teste. */
function currentGroup(): Participant[] {
  const men = [
    'anderson',
    'diego-alves',
    'matheus-amorim',
    'robson',
    'brennoh',
    'david-cruz',
    'jonatas-freitas',
    'matheus-amanda',
    'jeferson',
    'messias',
    'jonas',
    'ph',
  ]
  const women = [
    'amanda-diego',
    'camila',
    'carla-robson',
    'clara-machado',
    'amanda-garcia',
    'isabela-marques',
    'rafaela-duque',
    'raissa',
    'ana-flavia',
    'victor-f',
    'ygor-f',
  ]

  return [
    person('jhonata', 'leader', 'male'),
    person('jenifer', 'leader', 'female'),
    person('rolian', 'supervisor', 'male'),
    person('larissa', 'supervisor', 'female'),
    person('felipe', 'disciple', 'male'),
    person('gabriel', 'disciple', 'male'),
    person('victor-hugo', 'disciple', 'male'),
    person('leticia', 'disciple', 'female'),
    person('lethicia', 'disciple', 'female'),
    person('paty', 'disciple', 'female'),
    ...men.map((id) => person(id, 'member', 'male' as const)),
    ...women.map((id) => person(id, 'member', 'female' as const)),
  ]
}

const CURRENT_FIXED = [
  { discipleId: 'felipe', leaderId: 'jhonata' },
  { discipleId: 'gabriel', leaderId: 'jhonata' },
  { discipleId: 'victor-hugo', leaderId: 'jhonata' },
  { discipleId: 'leticia', leaderId: 'jenifer' },
  { discipleId: 'lethicia', leaderId: 'jenifer' },
  { discipleId: 'paty', leaderId: 'jenifer' },
]

function loadsById(result: ReturnType<typeof generateDistribution>) {
  const map = new Map<string, number>()
  for (const a of result.assignments) map.set(a.caregiverId, (map.get(a.caregiverId) ?? 0) + 1)
  return map
}

// ============================================================================
describe('distribuicao semanal - elenco atual do GC', () => {
  const participants = currentGroup()
  const input = baseInput({ participants, fixedLinks: CURRENT_FIXED })

  it('cuida das 29 pessoas do fluxo comum com 8 cuidadores', () => {
    const result = generateDistribution(input)

    expect(result.assignments).toHaveLength(29)
    expect(loadsById(result).size).toBe(8)
  })

  it('deixa supervisores e lideres fora do sorteio como pessoas cuidadas', () => {
    const result = generateDistribution(input)
    const caredFor = result.assignments.map((a) => a.caredForId)

    for (const id of ['rolian', 'larissa', 'jhonata', 'jenifer']) {
      expect(caredFor).not.toContain(id)
    }
  })

  it('calcula os pools masculino e feminino de forma independente', () => {
    const result = generateDistribution(input)
    const male = result.pools.find((p) => p.gender === 'male')!
    const female = result.pools.find((p) => p.gender === 'female')!

    // 3 discipulos + 12 irmaos = 15 para 4 cuidadores
    expect(male.caredForCount).toBe(15)
    expect(male.caregiverCount).toBe(4)
    expect(male.baseLoad).toBe(3)
    expect(male.extraSlotCount).toBe(3)

    // 3 discipulas + 11 irmas = 14 para 4 cuidadoras
    expect(female.caredForCount).toBe(14)
    expect(female.caregiverCount).toBe(4)
    expect(female.baseLoad).toBe(3)
    expect(female.extraSlotCount).toBe(2)

    // A media global (29/8 = 3,6) nao e imposta a nenhum dos dois pools.
    expect(male.baseLoad + male.extraSlotCount / male.caregiverCount).not.toBe(29 / 8)
  })

  it('mantem a diferenca de carga em no maximo uma pessoa dentro de cada pool', () => {
    const result = generateDistribution(input)

    for (const pool of result.pools) {
      const totals = pool.loads.map((l) => l.total)
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1)
    }
  })

  it('e reproduzivel: a mesma semente devolve exatamente o mesmo resultado', () => {
    const a = generateDistribution(input)
    const b = generateDistribution(input)
    expect(b.assignments).toEqual(a.assignments)
  })

  it('muda a distribuicao quando a semente da semana muda', () => {
    const a = generateDistribution(input)
    const b = generateDistribution({ ...input, seed: 'outra-semana' })
    expect(b.assignments).not.toEqual(a.assignments)
  })
})

// ============================================================================
describe('regra de genero', () => {
  it('nunca cria uma atribuicao entre generos diferentes', () => {
    const participants = currentGroup()
    const gender = new Map(participants.map((p) => [p.id, p.careGender]))
    const result = generateDistribution(baseInput({ participants, fixedLinks: CURRENT_FIXED }))

    for (const a of result.assignments) {
      expect(gender.get(a.caregiverId)).toBe(gender.get(a.caredForId))
    }
  })

  it('recusa gerar quando ha pessoas para cuidar sem cuidador do mesmo genero', () => {
    const participants = [
      person('jhonata', 'leader', 'male'),
      person('irma-1', 'member', 'female'),
      person('irmao-1', 'member', 'male'),
    ]

    expect(() => generateDistribution(baseInput({ participants }))).toThrowError(DistributionError)

    try {
      generateDistribution(baseInput({ participants }))
    } catch (error) {
      expect((error as DistributionError).code).toBe('NO_CAREGIVER_FOR_GENDER')
    }
  })

  it('recusa gerar enquanto houver genero de cuidado pendente', () => {
    const participants = [
      person('jhonata', 'leader', 'male'),
      { id: 'sem-genero', fullName: 'Sem genero', role: 'member', careGender: undefined },
    ] as unknown as Participant[]

    try {
      generateDistribution(baseInput({ participants }))
      throw new Error('deveria ter falhado')
    } catch (error) {
      expect((error as DistributionError).code).toBe('PENDING_CARE_GENDER')
    }
  })

  it('ignora um vinculo de discipulado entre generos diferentes e avisa', () => {
    const participants = [
      person('lider-m', 'leader', 'male'),
      person('lider-f', 'leader', 'female'),
      person('discipula', 'disciple', 'female'),
      person('irmao', 'member', 'male'),
    ]
    const result = generateDistribution(
      baseInput({
        participants,
        fixedLinks: [{ discipleId: 'discipula', leaderId: 'lider-m' }],
      }),
    )

    const fixed = result.assignments.filter((a) => a.origin === 'fixed_disciple')
    expect(fixed).toHaveLength(0)
    expect(result.assignments.find((a) => a.caredForId === 'discipula')?.caregiverId).toBe('lider-f')
  })

  it('nao permite pool masculino sem pessoas cuidadas quebrar o feminino', () => {
    const participants = [
      person('lider-f', 'leader', 'female'),
      person('irma-1', 'member', 'female'),
      person('irma-2', 'member', 'female'),
    ]
    const result = generateDistribution(baseInput({ participants }))

    expect(result.assignments).toHaveLength(2)
    expect(result.pools.find((p) => p.gender === 'male')?.caredForCount).toBe(0)
  })
})

// ============================================================================
describe('discipulos fixos', () => {
  it('mantem o discipulo com o lider primario e conta na carga dele', () => {
    const result = generateDistribution(baseInput({ participants: currentGroup(), fixedLinks: CURRENT_FIXED }))

    for (const link of CURRENT_FIXED) {
      const found = result.assignments.find((a) => a.caredForId === link.discipleId)
      expect(found?.caregiverId).toBe(link.leaderId)
      expect(found?.origin).toBe('fixed_disciple')
    }

    const male = result.pools.find((p) => p.gender === 'male')!
    const jhonata = male.loads.find((l) => l.caregiverId === 'jhonata')!
    expect(jhonata.fixed).toBe(3)
    expect(jhonata.total).toBeGreaterThanOrEqual(3)
  })

  it('preenche as vagas restantes do lider com irmaos do rodizio', () => {
    // Exemplo do planejamento: carga ideal 5 no pool, um lider com 3 discipulos
    // fixos recebe mais 2 irmaos.
    const participants = [
      person('lider', 'leader', 'male'),
      person('d1', 'disciple', 'male'),
      person('d2', 'disciple', 'male'),
      person('d3', 'disciple', 'male'),
      ...Array.from({ length: 17 }, (_, i) => person(`irmao-${i}`, 'member', 'male' as const)),
    ]
    const fixedLinks = [
      { discipleId: 'd1', leaderId: 'lider' },
      { discipleId: 'd2', leaderId: 'lider' },
      { discipleId: 'd3', leaderId: 'lider' },
    ]

    const result = generateDistribution(baseInput({ participants, fixedLinks }))
    const pool = result.pools.find((p) => p.gender === 'male')!

    expect(pool.caredForCount).toBe(20)
    expect(pool.caregiverCount).toBe(4)
    expect(pool.baseLoad).toBe(5)
    expect(pool.extraSlotCount).toBe(0)

    const lider = pool.loads.find((l) => l.caregiverId === 'lider')!
    expect(lider.fixed).toBe(3)
    expect(lider.rotation).toBe(2)
    expect(lider.total).toBe(5)
    expect(pool.loads.every((l) => l.total === 5)).toBe(true)
  })

  it('avisa quando os discipulos fixos deixam a carga do lider acima do piso', () => {
    // Um unico lider com 4 discipulos fixos e poucos irmaos: o desequilibrio e
    // consequencia do discipulado, e precisa ficar visivel.
    const participants = [
      person('lider', 'leader', 'male'),
      ...Array.from({ length: 4 }, (_, i) => person(`d${i}`, 'disciple', 'male' as const)),
      person('irmao', 'member', 'male'),
    ]
    const fixedLinks = Array.from({ length: 4 }, (_, i) => ({
      discipleId: `d${i}`,
      leaderId: 'lider',
    }))

    const result = generateDistribution(baseInput({ participants, fixedLinks }))
    const pool = result.pools.find((p) => p.gender === 'male')!
    const lider = pool.loads.find((l) => l.caregiverId === 'lider')!

    expect(lider.total).toBe(4)
    expect(pool.warnings.some((w) => w.includes('desigual'))).toBe(true)
  })
})

// ============================================================================
describe('equilibrio e vagas extras', () => {
  it('distribui a sobra da divisao nao exata sem passar de uma pessoa de diferenca', () => {
    const participants = [
      person('c1', 'leader', 'male'),
      person('c2', 'disciple', 'male'),
      person('c3', 'disciple', 'male'),
      ...Array.from({ length: 8 }, (_, i) => person(`m${i}`, 'member', 'male' as const)),
    ]
    // 2 discipulos + 8 irmaos = 10 pessoas para 3 cuidadores -> 3, 3 e 4.
    const result = generateDistribution(baseInput({ participants }))
    const pool = result.pools.find((p) => p.gender === 'male')!

    expect(pool.baseLoad).toBe(3)
    expect(pool.extraSlotCount).toBe(1)
    expect(pool.loads.map((l) => l.total).sort()).toEqual([3, 3, 4])
    expect(result.extraSlots).toHaveLength(1)
  })

  it('alterna a vaga extra usando o historico acumulado', () => {
    const participants = [
      person('c1', 'leader', 'male'),
      person('c2', 'disciple', 'male'),
      person('c3', 'disciple', 'male'),
      ...Array.from({ length: 8 }, (_, i) => person(`m${i}`, 'member', 'male' as const)),
    ]

    const primeira = generateDistribution(baseInput({ participants }))
    const quemPegou = primeira.extraSlots[0]

    // Na semana seguinte, quem ja carregou a sobra sai da frente da fila.
    const segunda = generateDistribution(
      baseInput({
        participants,
        seed: 'semana-2',
        extraSlotHistory: { [quemPegou]: 3 },
      }),
    )

    expect(segunda.extraSlots[0]).not.toBe(quemPegou)
  })
})

// ============================================================================
describe('integridade das atribuicoes', () => {
  const participants = currentGroup()
  const input = baseInput({ participants, fixedLinks: CURRENT_FIXED })

  it('nao permite que alguem cuide de si mesmo', () => {
    const result = generateDistribution(input)
    for (const a of result.assignments) {
      expect(a.caregiverId).not.toBe(a.caredForId)
    }
  })

  it('nao repete a mesma pessoa cuidada na semana', () => {
    const result = generateDistribution(input)
    const ids = result.assignments.map((a) => a.caredForId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('atribui somente a lideres e discipulos', () => {
    const role = new Map(participants.map((p) => [p.id, p.role]))
    const result = generateDistribution(input)

    for (const a of result.assignments) {
      expect(['leader', 'disciple']).toContain(role.get(a.caregiverId))
    }
  })
})

// ============================================================================
describe('nao repetir duplas', () => {
  const participants = [
    person('c1', 'leader', 'female'),
    person('c2', 'disciple', 'female'),
    person('m1', 'member', 'female'),
    person('m2', 'member', 'female'),
    person('m3', 'member', 'female'),
  ]

  it('prefere duplas ineditas enquanto existir combinacao disponivel', () => {
    // c1 ja cuidou de m1 e m2; c2 ja cuidou de m3.
    const history: PairHistory[] = [
      { caregiverId: 'c1', caredForId: 'm1', lastUsedOn: '2026-08-10', timesUsed: 1 },
      { caregiverId: 'c1', caredForId: 'm2', lastUsedOn: '2026-08-17', timesUsed: 1 },
      { caregiverId: 'c2', caredForId: 'm3', lastUsedOn: '2026-08-17', timesUsed: 1 },
    ]

    const result = generateDistribution(baseInput({ participants, history }))
    const usados = new Set(result.assignments.map((a) => `${a.caregiverId}>${a.caredForId}`))

    expect(usados.has('c1>m1')).toBe(false)
    expect(usados.has('c1>m2')).toBe(false)
    expect(usados.has('c2>m3')).toBe(false)
  })

  it('quando todas as combinacoes se esgotam, escolhe a usada ha mais tempo', () => {
    // Uma unica cuidadora: toda dupla e obrigatoriamente repetida.
    const soUmaCuidadora = [
      person('c1', 'leader', 'female'),
      person('m1', 'member', 'female'),
      person('m2', 'member', 'female'),
    ]
    const history: PairHistory[] = [
      { caregiverId: 'c1', caredForId: 'm1', lastUsedOn: '2026-01-05', timesUsed: 4 },
      { caregiverId: 'c1', caredForId: 'm2', lastUsedOn: '2026-08-17', timesUsed: 4 },
    ]

    const result = generateDistribution(baseInput({ participants: soUmaCuidadora, history }))

    expect(result.assignments).toHaveLength(2)
    const pool = result.pools.find((p) => p.gender === 'female')!
    expect(pool.repeatedPairs).toHaveLength(2)
    expect(pool.warnings.some((w) => w.includes('repetiram'))).toBe(true)
  })

  it('desempata pelo par com menos usos no ciclo', () => {
    const duas = [
      person('c1', 'leader', 'female'),
      person('c2', 'disciple', 'female'),
      person('m1', 'member', 'female'),
      person('m2', 'member', 'female'),
    ]
    const history: PairHistory[] = [
      { caregiverId: 'c1', caredForId: 'm1', lastUsedOn: '2026-08-17', timesUsed: 3 },
      { caregiverId: 'c2', caredForId: 'm1', lastUsedOn: '2026-08-10', timesUsed: 1 },
      { caregiverId: 'c1', caredForId: 'm2', lastUsedOn: '2026-08-10', timesUsed: 1 },
      { caregiverId: 'c2', caredForId: 'm2', lastUsedOn: '2026-08-17', timesUsed: 3 },
    ]

    const result = generateDistribution(baseInput({ participants: duas, history }))
    const map = new Map(result.assignments.map((a) => [a.caredForId, a.caregiverId]))

    expect(map.get('m1')).toBe('c2')
    expect(map.get('m2')).toBe('c1')
  })
})

// ============================================================================
describe('restricoes de pareamento', () => {
  it('nunca combina um par bloqueado', () => {
    const participants = [
      person('c1', 'leader', 'male'),
      person('c2', 'disciple', 'male'),
      person('m1', 'member', 'male'),
      person('m2', 'member', 'male'),
    ]
    const result = generateDistribution(
      baseInput({ participants, restrictions: [{ a: 'c1', b: 'm1' }] }),
    )

    expect(result.assignments.find((a) => a.caredForId === 'm1')?.caregiverId).toBe('c2')
  })

  it('respeita a restricao mesmo quando ela aparece invertida', () => {
    const participants = [
      person('c1', 'leader', 'male'),
      person('c2', 'disciple', 'male'),
      person('m1', 'member', 'male'),
      person('m2', 'member', 'male'),
    ]
    const result = generateDistribution(
      baseInput({ participants, restrictions: [{ a: 'm1', b: 'c1' }] }),
    )

    expect(result.assignments.find((a) => a.caredForId === 'm1')?.caregiverId).toBe('c2')
  })

  it('quebra o vinculo fixo quando o par esta bloqueado e avisa a lideranca', () => {
    const participants = [
      person('lider', 'leader', 'male'),
      person('outro', 'disciple', 'male'),
      person('d1', 'disciple', 'male'),
    ]
    const result = generateDistribution(
      baseInput({
        participants,
        fixedLinks: [{ discipleId: 'd1', leaderId: 'lider' }],
        restrictions: [{ a: 'lider', b: 'd1' }],
      }),
    )

    expect(result.assignments.find((a) => a.caredForId === 'd1')?.caregiverId).toBe('outro')
    expect(result.warnings.some((w) => w.includes('restricao'))).toBe(true)
  })

  it('relata quem ficou sem cuidador quando as restricoes esgotam as opcoes', () => {
    const participants = [
      person('c1', 'leader', 'male'),
      person('m1', 'member', 'male'),
    ]
    const result = generateDistribution(
      baseInput({ participants, restrictions: [{ a: 'c1', b: 'm1' }] }),
    )

    expect(result.assignments).toHaveLength(0)
    expect(result.pools.find((p) => p.gender === 'male')?.unassigned).toEqual(['m1'])
  })
})

// ============================================================================
describe('mudancas no elenco', () => {
  it('redistribui quando um cuidador e desativado', () => {
    const participants = currentGroup()
    const comTodos = generateDistribution(baseInput({ participants, fixedLinks: CURRENT_FIXED }))

    // Integrantes inativos nao chegam ao algoritmo: saem da lista de entrada.
    const semGabriel = participants.filter((p) => p.id !== 'gabriel')
    const result = generateDistribution(
      baseInput({
        participants: semGabriel,
        fixedLinks: CURRENT_FIXED.filter((l) => l.discipleId !== 'gabriel'),
      }),
    )

    expect(comTodos.assignments).toHaveLength(29)
    expect(result.assignments).toHaveLength(28)
    expect(result.assignments.some((a) => a.caregiverId === 'gabriel')).toBe(false)
    expect(result.assignments.some((a) => a.caredForId === 'gabriel')).toBe(false)

    const male = result.pools.find((p) => p.gender === 'male')!
    expect(male.caregiverCount).toBe(3)
    expect(male.caredForCount).toBe(14)
  })

  it('funciona com um grupo bem menor sem numeros fixos no algoritmo', () => {
    const participants = [
      person('lider', 'leader', 'female'),
      person('d1', 'disciple', 'female'),
      person('m1', 'member', 'female'),
    ]
    const result = generateDistribution(
      baseInput({ participants, fixedLinks: [{ discipleId: 'd1', leaderId: 'lider' }] }),
    )

    expect(result.assignments).toHaveLength(2)
    const pool = result.pools.find((p) => p.gender === 'female')!
    expect(pool.baseLoad).toBe(1)
    expect(pool.loads.map((l) => l.total).sort()).toEqual([1, 1])
  })

  it('cresce sem perder o equilibrio quando o GC dobra de tamanho', () => {
    const participants = [
      person('lider', 'leader', 'male'),
      ...Array.from({ length: 5 }, (_, i) => person(`d${i}`, 'disciple', 'male' as const)),
      ...Array.from({ length: 60 }, (_, i) => person(`m${i}`, 'member', 'male' as const)),
    ]
    const result = generateDistribution(baseInput({ participants }))
    const pool = result.pools.find((p) => p.gender === 'male')!

    expect(result.assignments).toHaveLength(65)
    expect(Math.max(...pool.loads.map((l) => l.total)) - Math.min(...pool.loads.map((l) => l.total)))
      .toBeLessThanOrEqual(1)
  })
})
