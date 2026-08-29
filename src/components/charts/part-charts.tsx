import * as React from 'react'
import { Dica, Figura, type ItemLegenda } from './base'
import { porcento, useLargura } from './medidas'

export interface Fatia {
  chave: string
  rotulo: string
  cor: string
  valor: number
}

/**
 * Rosca com o numero no meio.
 *
 * Uma rosca so se sustenta com poucas fatias e com o numero que importa
 * escrito no centro - sem ele, o leitor fica estimando angulo, que e
 * justamente o que olho humano faz pior. Acima de quatro fatias, use barras.
 */
export function Rosca({
  fatias,
  destaque,
  descricao,
  tamanho = 148,
}: {
  fatias: Fatia[]
  /** A fatia que vira o numero grande do centro. */
  destaque?: string
  descricao: string
  tamanho?: number
}) {
  const total = fatias.reduce((soma, fatia) => soma + fatia.valor, 0)
  const raio = tamanho / 2 - 12
  const perimetro = 2 * Math.PI * raio
  const foco = fatias.find((fatia) => fatia.chave === destaque) ?? fatias[0]

  let percorrido = 0

  return (
    <Figura
      descricao={descricao}
      legenda={fatias.map<ItemLegenda>((fatia) => ({
        cor: fatia.cor,
        rotulo: fatia.rotulo,
        valor: fatia.valor,
      }))}
    >
      <div className="flex items-center justify-center">
        <div className="relative" style={{ width: tamanho, height: tamanho }}>
          <svg width={tamanho} height={tamanho} className="-rotate-90">
            <circle
              cx={tamanho / 2}
              cy={tamanho / 2}
              r={raio}
              fill="none"
              stroke="var(--chart-grid)"
              strokeWidth={14}
            />
            {total > 0 &&
              fatias.map((fatia) => {
                if (fatia.valor <= 0) return null
                const comprimento = (fatia.valor / total) * perimetro
                const deslocamento = percorrido
                percorrido += comprimento
                return (
                  <circle
                    key={fatia.chave}
                    cx={tamanho / 2}
                    cy={tamanho / 2}
                    r={raio}
                    fill="none"
                    stroke={fatia.cor}
                    strokeWidth={14}
                    /* A folga de 2px separa as fatias sem inventar uma borda
                       colorida entre elas. */
                    strokeDasharray={`${Math.max(0, comprimento - 2)} ${perimetro}`}
                    strokeDashoffset={-deslocamento}
                    strokeLinecap="butt"
                  />
                )
              })}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display tabular text-2xl leading-none font-bold">
              {total > 0 && foco ? `${porcento(foco.valor, total)}%` : '—'}
            </span>
            <span className="text-muted-foreground mt-1 max-w-[86px] text-[11px] leading-tight text-pretty">
              {foco?.rotulo}
            </span>
          </div>
        </div>
      </div>
    </Figura>
  )
}

/**
 * Barras horizontais, um tom so.
 *
 * Categorias sem ordem - canais de contato, tipos de atividade - nao ganham
 * uma cor cada: a identidade ja esta escrita ao lado, e pintar cada barra de
 * um jeito gastaria a cor repetindo o que o comprimento diz. O tom unico da
 * escala guarda o significado: mais comprido, mais escuro nao seria verdade.
 */
export function ListaBarras({
  itens,
  cor = 'var(--chart-3)',
  descricao,
  sufixo,
}: {
  itens: { rotulo: string; valor: number }[]
  cor?: string
  descricao: string
  sufixo?: string
}) {
  const teto = Math.max(1, ...itens.map((item) => item.valor))
  const total = itens.reduce((soma, item) => soma + item.valor, 0)

  return (
    <Figura descricao={descricao}>
      <ul className="space-y-2.5">
        {itens.map((item) => (
          <li
            key={item.rotulo}
            className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 sm:grid-cols-[9rem_1fr_auto]"
          >
            <span className="truncate text-sm">{item.rotulo}</span>
            <span className="bg-secondary h-2.5 min-w-0 rounded-full">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(2, (item.valor / teto) * 100)}%`, background: cor }}
              />
            </span>
            <span className="text-muted-foreground tabular text-xs">
              {item.valor}
              {sufixo ?? ''}
              {total > 0 && ` · ${porcento(item.valor, total)}%`}
            </span>
          </li>
        ))}
      </ul>
    </Figura>
  )
}

export interface NivelDivergente {
  chave: string
  rotulo: string
  cor: string
}

/**
 * Barra divergente, centrada no neutro.
 *
 * A escala do feedback nao e um conjunto de categorias: e um eixo, de "precisa
 * de ajuda" a "muito bem". Empilhar tudo da esquerda para a direita esconderia
 * exatamente o que se quer ver. Centrando o neutro, uma semana pior aparece
 * como uma barra que escorregou para a esquerda - sem ler nenhum numero.
 *
 * "Sem registro" fica de fora do eixo, escrito a direita: silencio nao e um
 * nivel de bem-estar, e a ausencia de um.
 */
export function BarrasDivergentes({
  linhas,
  negativos,
  neutro,
  positivos,
  ausentes = [],
  descricao,
}: {
  linhas: { rotulo: string; rotuloCurto: string; contagens: Record<string, number> }[]
  /** Do mais negativo para o mais proximo do centro. */
  negativos: NivelDivergente[]
  neutro: NivelDivergente
  /** Do centro para o mais positivo. */
  positivos: NivelDivergente[]
  /** Fora do eixo: silencio nao e um nivel de bem-estar. */
  ausentes?: NivelDivergente[]
  descricao: string
}) {
  const [ativo, setAtivo] = React.useState<number | null>(null)
  const [x, setX] = React.useState(0)
  const [ref, largura] = useLargura<HTMLDivElement>()
  const niveis = [...negativos, neutro, ...positivos]

  const somar = (contagens: Record<string, number>) =>
    niveis.reduce((soma, nivel) => soma + (contagens[nivel.chave] ?? 0), 0)

  const somarAusentes = (contagens: Record<string, number>) =>
    ausentes.reduce((soma, nivel) => soma + (contagens[nivel.chave] ?? 0), 0)

  /**
   * Um so fator de escala para todas as linhas.
   *
   * Cada barra sai do centro para os dois lados, entao a linha mais
   * desequilibrada da semana define o quanto cabe na pista - sem isso ela
   * transbordaria por cima do numero a direita. E o fator precisa ser o mesmo
   * em todas: escalar linha a linha faria semanas diferentes parecerem
   * iguais, que e o oposto do que o grafico existe para mostrar.
   */
  const bracos = linhas.map((linha) => {
    const total = somar(linha.contagens)
    if (total === 0) return { total, esquerda: 50 }
    const antes =
      negativos.reduce((soma, nivel) => soma + (linha.contagens[nivel.chave] ?? 0), 0) +
      (linha.contagens[neutro.chave] ?? 0) / 2
    return { total, esquerda: (antes / total) * 100 }
  })
  const fator =
    50 / Math.max(50, ...bracos.map((braco) => Math.max(braco.esquerda, 100 - braco.esquerda)))

  const legenda: ItemLegenda[] = [...niveis, ...ausentes].map((nivel) => ({
    cor: nivel.cor,
    rotulo: nivel.rotulo,
    valor: linhas.reduce((soma, linha) => soma + (linha.contagens[nivel.chave] ?? 0), 0),
  }))

  return (
    <Figura descricao={descricao} legenda={legenda}>
      <div className="relative" ref={ref} onMouseLeave={() => setAtivo(null)}>
        <ul className="space-y-1.5">
          {linhas.map((linha, indice) => {
            const { total, esquerda } = bracos[indice]!
            let deslocamento = 50 - esquerda * fator

            return (
              <li
                key={linha.rotulo}
                className="grid grid-cols-[3.25rem_1fr_3.5rem] items-center gap-3"
                onMouseMove={(evento) => {
                  setAtivo(indice)
                  setX(evento.clientX - evento.currentTarget.getBoundingClientRect().left)
                }}
              >
                <span className="text-muted-foreground truncate text-xs">{linha.rotuloCurto}</span>

                <span className="bg-secondary relative block h-5 min-w-0 rounded-md">
                  {/* A marca do centro: e ela que da sentido a "escorregou
                      para a esquerda". */}
                  <span className="bg-border absolute inset-y-[-2px] left-1/2 w-px" aria-hidden />
                  {total > 0 &&
                    niveis.map((nivel) => {
                      const valor = linha.contagens[nivel.chave] ?? 0
                      if (valor <= 0) return null
                      const parte = (valor / total) * 100 * fator
                      const esquerda = deslocamento
                      deslocamento += parte
                      return (
                        <span
                          key={nivel.chave}
                          className="absolute inset-y-0 block"
                          style={{
                            left: `${esquerda}%`,
                            width: `calc(${parte}% - 2px)`,
                            background: nivel.cor,
                            opacity: ativo === null || ativo === indice ? 1 : 0.5,
                          }}
                        />
                      )
                    })}
                </span>

                <span className="text-muted-foreground tabular text-right text-xs">
                  {total}
                  {/* O "+N" e o silencio: fica escrito, fora da barra, para
                      nao virar mais um nivel da escala. */}
                  {somarAusentes(linha.contagens) > 0 && (
                    <span className="opacity-70"> +{somarAusentes(linha.contagens)}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>

        {ativo !== null && linhas[ativo] && (
          <Dica
            x={x}
            largura={largura}
            titulo={linhas[ativo].rotulo}
            linhas={[...niveis, ...ausentes]
              .filter((nivel) => (linhas[ativo]!.contagens[nivel.chave] ?? 0) > 0)
              .map((nivel) => ({
                cor: nivel.cor,
                rotulo: nivel.rotulo,
                valor: String(linhas[ativo]!.contagens[nivel.chave] ?? 0),
              }))}
          />
        )}
      </div>
    </Figura>
  )
}
