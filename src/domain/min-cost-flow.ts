/**
 * Fluxo de custo minimo (successive shortest paths com SPFA).
 *
 * A distribuicao semanal e, no fundo, um problema de atribuicao com capacidade:
 * cada cuidador tem um numero de vagas e cada pessoa cuidada precisa de
 * exatamente uma. Resolver por fluxo garante ao mesmo tempo o equilibrio de
 * carga (capacidades) e a menor repeticao possivel de duplas (custos) - coisa
 * que uma escolha gulosa, pessoa a pessoa, nao consegue.
 *
 * Aceita custos negativos (usados como bonus para saturar a carga minima);
 * o grafo nunca tem ciclo negativo, por construcao.
 */
export interface FlowEdge {
  to: number
  cap: number
  cost: number
  flow: number
}

export class MinCostFlow {
  private readonly adjacency: number[][]
  readonly edges: FlowEdge[] = []

  constructor(nodeCount: number) {
    this.adjacency = Array.from({ length: nodeCount }, () => [])
  }

  /** Devolve o indice da aresta direta (a reversa e sempre `indice + 1`). */
  addEdge(from: number, to: number, cap: number, cost: number): number {
    const index = this.edges.length
    this.edges.push({ to, cap, cost, flow: 0 })
    this.edges.push({ to: from, cap: 0, cost: -cost, flow: 0 })
    this.adjacency[from].push(index)
    this.adjacency[to].push(index + 1)
    return index
  }

  /** Envia o maior fluxo possivel de `source` a `sink` pelo menor custo. */
  run(source: number, sink: number): { flow: number; cost: number } {
    const n = this.adjacency.length
    let totalFlow = 0
    let totalCost = 0

    for (;;) {
      const dist = new Array<number>(n).fill(Number.POSITIVE_INFINITY)
      const prevEdge = new Array<number>(n).fill(-1)
      const inQueue = new Array<boolean>(n).fill(false)
      dist[source] = 0

      const queue: number[] = [source]
      inQueue[source] = true

      while (queue.length > 0) {
        const node = queue.shift()!
        inQueue[node] = false

        for (const edgeIndex of this.adjacency[node]) {
          const edge = this.edges[edgeIndex]
          if (edge.cap - edge.flow <= 0) continue

          const candidate = dist[node] + edge.cost
          if (candidate < dist[edge.to]) {
            dist[edge.to] = candidate
            prevEdge[edge.to] = edgeIndex
            if (!inQueue[edge.to]) {
              inQueue[edge.to] = true
              queue.push(edge.to)
            }
          }
        }
      }

      if (!Number.isFinite(dist[sink])) break

      // Gargalo do caminho encontrado.
      let bottleneck = Number.POSITIVE_INFINITY
      for (let node = sink; node !== source; ) {
        const edge = this.edges[prevEdge[node]]
        bottleneck = Math.min(bottleneck, edge.cap - edge.flow)
        node = this.edges[prevEdge[node] ^ 1].to
      }

      for (let node = sink; node !== source; ) {
        const edgeIndex = prevEdge[node]
        this.edges[edgeIndex].flow += bottleneck
        this.edges[edgeIndex ^ 1].flow -= bottleneck
        node = this.edges[edgeIndex ^ 1].to
      }

      totalFlow += bottleneck
      totalCost += bottleneck * dist[sink]
    }

    return { flow: totalFlow, cost: totalCost }
  }
}
