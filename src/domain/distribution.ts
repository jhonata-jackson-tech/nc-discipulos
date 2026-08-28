/**
 * Distribuicao semanal do cuidado.
 *
 * Regra inviolavel: homem cuida somente de homem, mulher somente de mulher.
 * Por isso o problema e resolvido como dois problemas independentes - um pool
 * masculino e um pool feminino - e a carga e equilibrada dentro de cada pool,
 * nunca por uma media global do grupo.
 *
 * O modulo e puro e deterministico: a mesma entrada e a mesma semente produzem
 * sempre o mesmo resultado. Ele roda na Edge Function `generate-week`, jamais
 * no navegador.
 */

// A extensao explicita e proposital: o mesmo arquivo e carregado pelo Deno na
// Edge Function, que exige o caminho completo.
import { MinCostFlow } from './min-cost-flow.ts'

export type CareGender = 'male' | 'female'
export type AppRole = 'supervisor' | 'leader' | 'disciple' | 'member'
export type AssignmentOrigin = 'fixed_disciple' | 'rotation' | 'manual' | 'transfer'

export interface Participant {
  id: string
  fullName: string
  role: AppRole
  careGender: CareGender
}

export interface FixedLink {
  discipleId: string
  leaderId: string
}

export interface Restriction {
  a: string
  b: string
}

export interface PairHistory {
  caregiverId: string
  caredForId: string
  /** Data (YYYY-MM-DD) da ultima semana publicada em que a dupla aconteceu. */
  lastUsedOn: string | null
  timesUsed: number
}

export interface DistributionInput {
  seed: string
  participants: Participant[]
  fixedLinks: FixedLink[]
  restrictions: Restriction[]
  history: PairHistory[]
  /** Quantas vezes cada cuidador ja absorveu a vaga extra do arredondamento. */
  extraSlotHistory: Record<string, number>
}

export interface GeneratedAssignment {
  caregiverId: string
  caredForId: string
  origin: Extract<AssignmentOrigin, 'fixed_disciple' | 'rotation'>
}

export interface CaregiverLoad {
  caregiverId: string
  fullName: string
  fixed: number
  rotation: number
  total: number
}

export interface RepeatedPair {
  caregiverId: string
  caredForId: string
  timesUsed: number
  lastUsedOn: string | null
}

export interface PoolReport {
  gender: CareGender
  caregiverCount: number
  caredForCount: number
  /** Carga minima do pool: piso de pessoas cuidadas / cuidadores. */
  baseLoad: number
  /** Quantos cuidadores ficam com uma pessoa a mais que o piso. */
  extraSlotCount: number
  loads: CaregiverLoad[]
  /** Duplas que ja tinham acontecido - so aparecem quando nao havia alternativa. */
  repeatedPairs: RepeatedPair[]
  /** Pessoas que nenhuma regra permitiu atribuir. */
  unassigned: string[]
  warnings: string[]
}

export interface DistributionResult {
  assignments: GeneratedAssignment[]
  /** Cuidadores que ficaram acima do piso nesta semana; alimenta o rodizio. */
  extraSlots: string[]
  pools: PoolReport[]
  warnings: string[]
}

export type DistributionErrorCode =
  | 'PENDING_CARE_GENDER'
  | 'NO_CAREGIVER_FOR_GENDER'
  | 'NO_PARTICIPANTS'

export class DistributionError extends Error {
  code: DistributionErrorCode
  details: Record<string, unknown>

  constructor(code: DistributionErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'DistributionError'
    this.code = code
    this.details = details
  }
}

const GENDERS: CareGender[] = ['male', 'female']
const CAREGIVER_ROLES: AppRole[] = ['leader', 'disciple']
const CARED_FOR_ROLES: AppRole[] = ['disciple', 'member']

/** FNV-1a: hash estavel e barato, suficiente para desempate reprodutivel. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function pairKey(caregiverId: string, caredForId: string): string {
  return `${caregiverId}>${caredForId}`
}

function restrictionKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function generateDistribution(input: DistributionInput): DistributionResult {
  const { seed, participants } = input

  if (participants.length === 0) {
    throw new DistributionError('NO_PARTICIPANTS', 'Nenhum integrante ativo para distribuir.')
  }

  const missingGender = participants.filter((p) => !p.careGender)
  if (missingGender.length > 0) {
    throw new DistributionError(
      'PENDING_CARE_GENDER',
      'Confirme o genero de cuidado de todos os integrantes ativos antes de gerar a semana.',
      { people: missingGender.map((p) => p.fullName) },
    )
  }

  const byId = new Map(participants.map((p) => [p.id, p]))
  const restricted = new Set(input.restrictions.map((r) => restrictionKey(r.a, r.b)))
  const historyByPair = new Map(input.history.map((h) => [pairKey(h.caregiverId, h.caredForId), h]))

  const assignments: GeneratedAssignment[] = []
  const extraSlots: string[] = []
  const pools: PoolReport[] = []
  const warnings: string[] = []

  for (const gender of GENDERS) {
    const pool = buildPool({
      gender,
      seed,
      participants,
      byId,
      restricted,
      historyByPair,
      fixedLinks: input.fixedLinks,
      extraSlotHistory: input.extraSlotHistory ?? {},
    })

    assignments.push(...pool.assignments)
    extraSlots.push(...pool.extraSlots)
    pools.push(pool.report)
    warnings.push(...pool.report.warnings)
  }

  return { assignments, extraSlots, pools, warnings }
}

interface PoolContext {
  gender: CareGender
  seed: string
  participants: Participant[]
  byId: Map<string, Participant>
  restricted: Set<string>
  historyByPair: Map<string, PairHistory>
  fixedLinks: FixedLink[]
  extraSlotHistory: Record<string, number>
}

function buildPool(ctx: PoolContext): {
  assignments: GeneratedAssignment[]
  extraSlots: string[]
  report: PoolReport
} {
  const { gender, seed, byId, restricted, historyByPair, extraSlotHistory } = ctx
  const warnings: string[] = []

  const inPool = (p: Participant) => p.careGender === gender
  const caregivers = ctx.participants.filter((p) => inPool(p) && CAREGIVER_ROLES.includes(p.role))
  const caredFor = ctx.participants.filter((p) => inPool(p) && CARED_FOR_ROLES.includes(p.role))

  const emptyReport = (): PoolReport => ({
    gender,
    caregiverCount: caregivers.length,
    caredForCount: caredFor.length,
    baseLoad: 0,
    extraSlotCount: 0,
    loads: [],
    repeatedPairs: [],
    unassigned: [],
    warnings,
  })

  if (caredFor.length === 0) {
    return { assignments: [], extraSlots: [], report: emptyReport() }
  }

  if (caregivers.length === 0) {
    throw new DistributionError(
      'NO_CAREGIVER_FOR_GENDER',
      gender === 'male'
        ? 'Ha irmaos para cuidar, mas nenhum lider ou discipulo homem ativo.'
        : 'Ha irmas para cuidar, mas nenhuma lider ou discipula mulher ativa.',
      { gender, caredForCount: caredFor.length },
    )
  }

  const assignments: GeneratedAssignment[] = []
  const load = new Map<string, number>(caregivers.map((c) => [c.id, 0]))
  const fixedCount = new Map<string, number>(caregivers.map((c) => [c.id, 0]))
  const assigned = new Set<string>()
  const repeatedPairs: RepeatedPair[] = []

  const isBlocked = (caregiverId: string, caredForId: string) =>
    caregiverId === caredForId || restricted.has(restrictionKey(caregiverId, caredForId))

  // -------------------------------------------------- 1. cuidados fixos
  // Cada discipulo permanece com o seu lider primario, e isso conta na carga
  // semanal do lider.
  const caregiverIds = new Set(caregivers.map((c) => c.id))
  const fixedForPool = ctx.fixedLinks
    .filter((link) => {
      const disciple = byId.get(link.discipleId)
      const leader = byId.get(link.leaderId)
      return Boolean(disciple && leader && inPool(disciple) && inPool(leader))
    })
    .sort((a, b) => hash(seed + a.discipleId) - hash(seed + b.discipleId))

  for (const link of fixedForPool) {
    const disciple = byId.get(link.discipleId)!
    if (!caregiverIds.has(link.leaderId)) {
      warnings.push(`${disciple.fullName} tem lider primario fora do rodizio desta semana.`)
      continue
    }
    if (isBlocked(link.leaderId, link.discipleId)) {
      warnings.push(
        `${disciple.fullName} nao pode ficar com o lider primario por causa de uma restricao cadastrada.`,
      )
      continue
    }
    assignments.push({
      caregiverId: link.leaderId,
      caredForId: link.discipleId,
      origin: 'fixed_disciple',
    })
    assigned.add(link.discipleId)
    load.set(link.leaderId, (load.get(link.leaderId) ?? 0) + 1)
    fixedCount.set(link.leaderId, (fixedCount.get(link.leaderId) ?? 0) + 1)
  }

  // ------------------------------------------- 2. carga ideal deste pool
  // A carga vem da divisao dentro do proprio pool - nunca de uma media global
  // do GC, que misturaria homens e mulheres.
  const baseLoad = Math.floor(caredFor.length / caregivers.length)
  const extraSlotCount = caredFor.length % caregivers.length

  const remaining = caredFor.filter((p) => !assigned.has(p.id))

  // ------------------------------------ 3. rodizio como fluxo de custo minimo
  // Nos: 0 = origem, 1..C = cuidadores, C+1..C+R = pessoas, ultimo = destino.
  const SOURCE = 0
  const SINK = caregivers.length + remaining.length + 1
  const caregiverNode = (index: number) => index + 1
  const personNode = (index: number) => caregivers.length + index + 1

  const flow = new MinCostFlow(SINK + 1)

  // Bonus alto para saturar a carga minima antes de qualquer vaga extra: e o
  // que garante que ninguem fique abaixo do piso enquanto houver gente para
  // cuidar.
  const BASE_BONUS = 1e12

  const extraSlotEdges: { caregiverIndex: number; edge: number }[] = []

  caregivers.forEach((caregiver, index) => {
    const fixed = fixedCount.get(caregiver.id) ?? 0
    const baseCapacity = Math.max(0, baseLoad - fixed)
    const extraCapacity = Math.max(0, baseLoad + 1 - fixed - baseCapacity)

    if (baseCapacity > 0) {
      flow.addEdge(SOURCE, caregiverNode(index), baseCapacity, -BASE_BONUS)
    }
    if (extraCapacity > 0) {
      // Quem menos absorveu a sobra ate hoje paga menos para absorve-la agora.
      const history = Math.min(extraSlotHistory[caregiver.id] ?? 0, 500)
      const cost = history * 1e6 + (hash(seed + 'extra' + caregiver.id) % 10_000)
      extraSlotEdges.push({
        caregiverIndex: index,
        edge: flow.addEdge(SOURCE, caregiverNode(index), extraCapacity, cost),
      })
    }
  })

  // Recencia comprimida: 0 = dupla inedita, 1 = a mais antiga ja usada, etc.
  const distinctDates = Array.from(
    new Set(
      Array.from(historyByPair.values())
        .map((h) => h.lastUsedOn)
        .filter((d): d is string => Boolean(d)),
    ),
  ).sort()
  const recencyRank = new Map(distinctDates.map((date, i) => [date, i + 1] as const))

  const pairCost = (caregiverId: string, caredForId: string): number => {
    const previous = historyByPair.get(pairKey(caregiverId, caredForId))
    const timesUsed = Math.min(previous?.timesUsed ?? 0, 500)
    const recency = previous?.lastUsedOn ? (recencyRank.get(previous.lastUsedOn) ?? 0) : 0
    const tie = hash(`${seed}|${caregiverId}>${caredForId}`) % 10_000
    // Repetir uma dupla custa muito mais que qualquer outro criterio; entre
    // duplas ja usadas, a mais antiga custa menos.
    return timesUsed * 1e9 + recency * 1e4 + tie
  }

  const pairEdges: { caregiverIndex: number; personIndex: number; edge: number }[] = []

  remaining.forEach((person, personIndex) => {
    flow.addEdge(personNode(personIndex), SINK, 1, 0)

    caregivers.forEach((caregiver, caregiverIndex) => {
      if (isBlocked(caregiver.id, person.id)) return
      pairEdges.push({
        caregiverIndex,
        personIndex,
        edge: flow.addEdge(
          caregiverNode(caregiverIndex),
          personNode(personIndex),
          1,
          pairCost(caregiver.id, person.id),
        ),
      })
    })
  })

  flow.run(SOURCE, SINK)

  const chosenByPerson = new Map<number, number>()
  for (const pair of pairEdges) {
    if (flow.edges[pair.edge].flow > 0) chosenByPerson.set(pair.personIndex, pair.caregiverIndex)
  }

  remaining.forEach((person, personIndex) => {
    const caregiverIndex = chosenByPerson.get(personIndex)

    if (caregiverIndex === undefined) {
      warnings.push(
        `Nenhum cuidador disponivel para ${person.fullName} sem violar as regras cadastradas.`,
      )
      return
    }

    const caregiver = caregivers[caregiverIndex]

    assignments.push({ caregiverId: caregiver.id, caredForId: person.id, origin: 'rotation' })
    assigned.add(person.id)
    load.set(caregiver.id, (load.get(caregiver.id) ?? 0) + 1)

    const previous = historyByPair.get(pairKey(caregiver.id, person.id))
    if (previous && previous.timesUsed > 0) {
      repeatedPairs.push({
        caregiverId: caregiver.id,
        caredForId: person.id,
        timesUsed: previous.timesUsed,
        lastUsedOn: previous.lastUsedOn,
      })
    }
  })

  // Vaga extra efetivamente usada nesta semana, para alimentar o rodizio.
  const extraSlotsUsed = extraSlotEdges
    .filter(({ edge }) => flow.edges[edge].flow > 0)
    .map(({ caregiverIndex }) => caregivers[caregiverIndex].id)

  // ----------------------------------------------------- 4. relatorio
  const loads: CaregiverLoad[] = caregivers
    .map((c) => {
      const fixed = fixedCount.get(c.id) ?? 0
      const total = load.get(c.id) ?? 0
      return { caregiverId: c.id, fullName: c.fullName, fixed, rotation: total - fixed, total }
    })
    .sort((a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName, 'pt-BR'))

  // Alem das vagas extras do arredondamento, quem carrega discipulos fixos
  // acima do piso tambem entra no historico de sobrecarga.
  const extraSlots = Array.from(
    new Set([...extraSlotsUsed, ...loads.filter((l) => l.total > baseLoad).map((l) => l.caregiverId)]),
  )
  const unassigned = caredFor.filter((p) => !assigned.has(p.id)).map((p) => p.fullName)

  const spread = loads.length > 0 ? loads[0].total - loads[loads.length - 1].total : 0
  if (spread > 1) {
    warnings.push(
      gender === 'male'
        ? `A carga entre os cuidadores homens ficou desigual (diferenca de ${spread}). Verifique discipulos fixos e restricoes.`
        : `A carga entre as cuidadoras mulheres ficou desigual (diferenca de ${spread}). Verifique discipulas fixas e restricoes.`,
    )
  }

  if (repeatedPairs.length > 0) {
    warnings.push(
      `${repeatedPairs.length} dupla(s) se repetiram porque todas as combinacoes ineditas ja foram usadas.`,
    )
  }

  return {
    assignments,
    extraSlots,
    report: {
      gender,
      caregiverCount: caregivers.length,
      caredForCount: caredFor.length,
      baseLoad,
      extraSlotCount,
      loads,
      repeatedPairs,
      unassigned,
      warnings,
    },
  }
}
