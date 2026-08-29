import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * As pecas comuns a todos os graficos do relatorio.
 *
 * Nenhuma biblioteca: os graficos daqui sao SVG e `div`. A troca vale a pena
 * porque o app e instalado no celular de 33 pessoas - uma biblioteca de
 * graficos custaria mais bytes do que todo o resto da tela junta - e porque
 * assim o grafico herda os tokens do tema em vez de trazer uma paleta propria
 * que so combina no claro.
 */

export interface ItemLegenda {
  cor: string
  rotulo: string
  valor?: number | string
}

/**
 * A legenda sempre traz o numero ao lado do nome.
 *
 * Nao e enfeite: os tons mais claros das escalas ficam abaixo de 3:1 contra o
 * fundo - inevitavel, porque "pouco" precisa parecer pouco. O numero escrito e
 * o que garante que a informacao chegue mesmo a quem nao distingue a cor.
 */
export function Legenda({ itens, className }: { itens: ItemLegenda[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {itens.map((item) => (
        <li key={item.rotulo} className="flex items-center gap-1.5 text-xs">
          <span
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: item.cor }}
            aria-hidden
          />
          <span className="text-muted-foreground">{item.rotulo}</span>
          {item.valor !== undefined && <span className="tabular font-medium">{item.valor}</span>}
        </li>
      ))}
    </ul>
  )
}

/**
 * A caixinha que segue o dedo ou o ponteiro.
 *
 * Fica dentro do proprio grafico e presa as bordas: no celular, uma dica que
 * vaza para fora do cartao e uma dica que ninguem le.
 */
export function Dica({
  x,
  largura,
  titulo,
  linhas,
}: {
  x: number
  largura: number
  titulo: string
  linhas: { cor?: string; rotulo: string; valor: string }[]
}) {
  const LARGURA_DICA = 168
  const preso = Math.min(Math.max(x - LARGURA_DICA / 2, 0), Math.max(largura - LARGURA_DICA, 0))

  return (
    <div
      role="status"
      className="bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 rounded-lg border p-2.5 shadow-[var(--shadow-overlay)]"
      style={{ left: preso, width: LARGURA_DICA }}
    >
      <p className="mb-1.5 text-xs font-semibold">{titulo}</p>
      <ul className="space-y-1">
        {linhas.map((linha) => (
          <li key={linha.rotulo} className="flex items-center gap-1.5 text-xs">
            {linha.cor && (
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: linha.cor }}
                aria-hidden
              />
            )}
            <span className="text-muted-foreground min-w-0 flex-1 truncate">{linha.rotulo}</span>
            <span className="tabular font-medium">{linha.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Moldura comum: o grafico, a legenda e a frase que um leitor de tela ouve. */
export function Figura({
  descricao,
  legenda,
  children,
  className,
}: {
  /** O grafico em uma frase - e o que substitui o desenho para quem nao o ve. */
  descricao: string
  legenda?: ItemLegenda[]
  children: React.ReactNode
  className?: string
}) {
  return (
    <figure className={cn('space-y-3', className)}>
      <div className="relative" role="img" aria-label={descricao}>
        {children}
      </div>
      {legenda && legenda.length > 0 && <Legenda itens={legenda} />}
    </figure>
  )
}
