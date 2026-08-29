import * as React from 'react'
import { Dica, Figura, type ItemLegenda } from './base'
import { useLargura } from './medidas'

const MARGEM = { topo: 10, direita: 8, base: 22, esquerda: 30 }
/** Respiro entre os pedacos de uma pilha: sem ele dois tons viram um borrao. */
const FOLGA = 2
const CANTO = 4

export interface PontoEmpilhado {
  /** O que a dica mostra: "18 a 24 de agosto". */
  rotulo: string
  /** O que cabe embaixo da coluna: "18/8". */
  rotuloCurto: string
  segmentos: Record<string, number>
}

export interface Serie {
  chave: string
  rotulo: string
  cor: string
}

/**
 * Colunas empilhadas ao longo do tempo.
 *
 * Parte-e-todo semana a semana: cada coluna e uma semana inteira, e os
 * pedacos dizem em que ela se dividiu. E a forma certa quando a pergunta e
 * "de tudo o que foi combinado, quanto aconteceu?" - a altura responde o
 * combinado e o pedaco responde o feito, sem precisar de dois eixos.
 */
export function ColunasEmpilhadas({
  pontos,
  series,
  descricao,
  altura = 180,
}: {
  pontos: PontoEmpilhado[]
  series: Serie[]
  descricao: string
  altura?: number
}) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [ativo, setAtivo] = React.useState<number | null>(null)

  const totais = pontos.map((ponto) =>
    series.reduce((soma, serie) => soma + (ponto.segmentos[serie.chave] ?? 0), 0),
  )
  const teto = Math.max(1, ...totais)

  const legenda: ItemLegenda[] = series.map((serie) => ({
    cor: serie.cor,
    rotulo: serie.rotulo,
    valor: pontos.reduce((soma, ponto) => soma + (ponto.segmentos[serie.chave] ?? 0), 0),
  }))

  const areaLargura = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita)
  const areaAltura = altura - MARGEM.topo - MARGEM.base
  const passo = pontos.length > 0 ? areaLargura / pontos.length : 0
  const barra = Math.min(38, Math.max(6, passo * 0.62))

  return (
    <Figura descricao={descricao} legenda={legenda}>
      <div ref={ref} className="relative w-full">
        {largura > 0 && (
          <svg
            width={largura}
            height={altura}
            onMouseLeave={() => setAtivo(null)}
            className="block touch-none"
          >
            {/* A malha e recessiva de proposito: ela serve para conferir uma
                altura, nao para ser lida. */}
            {[0, 0.5, 1].map((fracao) => {
              const y = MARGEM.topo + areaAltura * fracao
              return (
                <g key={fracao}>
                  <line
                    x1={MARGEM.esquerda}
                    x2={largura - MARGEM.direita}
                    y1={y}
                    y2={y}
                    stroke="var(--chart-grid)"
                    strokeWidth={1}
                  />
                  <text
                    x={MARGEM.esquerda - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-muted-foreground tabular text-[10px]"
                  >
                    {Math.round(teto * (1 - fracao))}
                  </text>
                </g>
              )
            })}

            {pontos.map((ponto, indice) => {
              const centro = MARGEM.esquerda + passo * indice + passo / 2
              const x = centro - barra / 2
              let base = MARGEM.topo + areaAltura
              const total = totais[indice] ?? 0

              return (
                <g
                  key={ponto.rotulo}
                  onMouseEnter={() => setAtivo(indice)}
                  onFocus={() => setAtivo(indice)}
                  tabIndex={0}
                  className="focus-visible:outline-ring outline-none focus-visible:outline-2"
                >
                  {/* Alvo generoso: no dedo, a coluna sozinha e estreita
                      demais para acertar. */}
                  <rect
                    x={MARGEM.esquerda + passo * indice}
                    y={MARGEM.topo}
                    width={passo}
                    height={areaAltura}
                    fill="transparent"
                  />

                  {series.map((serie, ordem) => {
                    const valor = ponto.segmentos[serie.chave] ?? 0
                    if (valor <= 0) return null
                    const alturaSegmento = (valor / teto) * areaAltura
                    base -= alturaSegmento
                    const ultimo = ordem === series.length - 1 || total === valor
                    return (
                      <rect
                        key={serie.chave}
                        x={x}
                        y={base}
                        width={barra}
                        height={Math.max(1, alturaSegmento - FOLGA)}
                        rx={ultimo ? CANTO : 1}
                        fill={serie.cor}
                        opacity={ativo === null || ativo === indice ? 1 : 0.45}
                      />
                    )
                  })}

                  {total === 0 && (
                    <line
                      x1={x}
                      x2={x + barra}
                      y1={MARGEM.topo + areaAltura}
                      y2={MARGEM.topo + areaAltura}
                      stroke="var(--chart-grid)"
                      strokeWidth={2}
                    />
                  )}

                  <text
                    x={centro}
                    y={altura - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {ponto.rotuloCurto}
                  </text>
                </g>
              )
            })}
          </svg>
        )}

        {ativo !== null && pontos[ativo] && (
          <Dica
            x={MARGEM.esquerda + passo * ativo + passo / 2}
            largura={largura}
            titulo={pontos[ativo].rotulo}
            linhas={series.map((serie) => ({
              cor: serie.cor,
              rotulo: serie.rotulo,
              valor: String(pontos[ativo]!.segmentos[serie.chave] ?? 0),
            }))}
          />
        )}
      </div>
    </Figura>
  )
}

export interface PontoLinha {
  rotulo: string
  rotuloCurto: string
  valor: number
}

/**
 * Uma linha, uma pergunta.
 *
 * Serie unica de proposito: quando o assunto e "isso esta subindo ou
 * descendo?", uma segunda linha com outra escala so atrapalha. Duas medidas
 * diferentes pedem dois graficos, nunca dois eixos.
 */
export function LinhaTendencia({
  pontos,
  cor,
  descricao,
  sufixo = '',
  teto = 100,
  altura = 150,
}: {
  pontos: PontoLinha[]
  cor: string
  descricao: string
  sufixo?: string
  teto?: number
  altura?: number
}) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [ativo, setAtivo] = React.useState<number | null>(null)

  // "100%" nao cabe nos 30px do eixo padrao: a coluna da esquerda cresce com
  // o tamanho do maior rotulo, senao o topo da escala vira "00%".
  const eixo = MARGEM.esquerda + `${teto}${sufixo}`.length * 2
  const areaLargura = Math.max(0, largura - eixo - MARGEM.direita)
  const areaAltura = altura - MARGEM.topo - MARGEM.base
  const passo = pontos.length > 1 ? areaLargura / (pontos.length - 1) : 0
  const emX = (indice: number) =>
    pontos.length > 1 ? eixo + passo * indice : eixo + areaLargura / 2
  const emY = (valor: number) =>
    MARGEM.topo + areaAltura - (Math.min(valor, teto) / teto) * areaAltura

  const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${emX(i)},${emY(p.valor)}`).join(' ')
  const area =
    pontos.length > 0
      ? `${caminho} L${emX(pontos.length - 1)},${MARGEM.topo + areaAltura} L${emX(0)},${
          MARGEM.topo + areaAltura
        } Z`
      : ''

  return (
    <Figura descricao={descricao}>
      <div ref={ref} className="relative w-full">
        {largura > 0 && pontos.length > 0 && (
          <svg
            width={largura}
            height={altura}
            className="block touch-none"
            onMouseLeave={() => setAtivo(null)}
            onMouseMove={(evento) => {
              const caixa = evento.currentTarget.getBoundingClientRect()
              const dentro = evento.clientX - caixa.left - eixo
              const indice = passo > 0 ? Math.round(dentro / passo) : 0
              setAtivo(Math.min(pontos.length - 1, Math.max(0, indice)))
            }}
          >
            {[0, 0.5, 1].map((fracao) => {
              const y = MARGEM.topo + areaAltura * fracao
              return (
                <g key={fracao}>
                  <line
                    x1={eixo}
                    x2={largura - MARGEM.direita}
                    y1={y}
                    y2={y}
                    stroke="var(--chart-grid)"
                    strokeWidth={1}
                  />
                  <text
                    x={eixo - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-muted-foreground tabular text-[10px]"
                  >
                    {Math.round(teto * (1 - fracao))}
                    {sufixo}
                  </text>
                </g>
              )
            })}

            <path d={area} fill={cor} opacity={0.14} />
            <path
              d={caminho}
              fill="none"
              stroke={cor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {ativo !== null && (
              <line
                x1={emX(ativo)}
                x2={emX(ativo)}
                y1={MARGEM.topo}
                y2={MARGEM.topo + areaAltura}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
            )}

            {pontos.map((ponto, indice) => (
              <circle
                key={ponto.rotulo}
                cx={emX(indice)}
                cy={emY(ponto.valor)}
                r={ativo === indice ? 5 : 3.5}
                fill={cor}
                /* O anel da superficie separa o marcador da linha por baixo. */
                stroke="var(--card)"
                strokeWidth={2}
              />
            ))}

            {pontos.map((ponto, indice) =>
              // Rotulo direto so onde ele decide alguma coisa: a ultima
              // semana. Numero em todo ponto vira ruido, nao informacao.
              indice === pontos.length - 1 ? (
                <text
                  key={`rotulo-${ponto.rotulo}`}
                  x={emX(indice)}
                  /* Perto do teto o rotulo desce: acima ele encostaria no
                     proprio marcador, e "97%" sobre a bolinha nao se le. */
                  y={
                    emY(ponto.valor) < MARGEM.topo + 20
                      ? emY(ponto.valor) + 17
                      : emY(ponto.valor) - 10
                  }
                  textAnchor="end"
                  className="fill-foreground tabular text-[11px] font-semibold"
                >
                  {ponto.valor}
                  {sufixo}
                </text>
              ) : null,
            )}

            {pontos.map((ponto, indice) =>
              indice === 0 || indice === pontos.length - 1 ? (
                <text
                  key={`eixo-${ponto.rotulo}`}
                  x={emX(indice)}
                  y={altura - 6}
                  textAnchor={indice === 0 ? 'start' : 'end'}
                  className="fill-muted-foreground text-[10px]"
                >
                  {ponto.rotuloCurto}
                </text>
              ) : null,
            )}
          </svg>
        )}

        {ativo !== null && pontos[ativo] && (
          <Dica
            x={emX(ativo)}
            largura={largura}
            titulo={pontos[ativo].rotulo}
            linhas={[
              {
                cor,
                rotulo: descricao.split(',')[0] ?? '',
                valor: `${pontos[ativo].valor}${sufixo}`,
              },
            ]}
          />
        )}
      </div>
    </Figura>
  )
}
