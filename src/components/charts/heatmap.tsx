import * as React from 'react'
import { Dica, Figura } from './base'
import { useLargura } from './medidas'

export interface LinhaMapa {
  id: string
  nome: string
  /** Um selo curto no fim da linha - por exemplo, semanas seguidas. */
  selo?: React.ReactNode
  celulas: { rotulo: string; total: number; feitos: number }[]
}

/**
 * Um quadradinho por pessoa, por semana.
 *
 * A pergunta que este mapa responde nao e "quem fez mais" - e "quem esta
 * segurando o combinado, e desde quando". Por isso a celula mostra a semana
 * daquela pessoa, e nao um acumulado: quem cuida de duas pessoas toda semana
 * fica tao cheio quanto quem cuida de seis, que e exatamente a verdade.
 *
 * Sem combinado na semana a celula fica vazia, com contorno - "nao teve" e
 * diferente de "teve e nao fez", e um mapa que confunde as duas coisas
 * acusaria gente inocente.
 */
export function MapaConstancia({ linhas, descricao }: { linhas: LinhaMapa[]; descricao: string }) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [ativo, setAtivo] = React.useState<{ linha: number; celula: number } | null>(null)
  const [x, setX] = React.useState(0)

  const colunas = linhas[0]?.celulas.length ?? 0

  return (
    <Figura
      descricao={descricao}
      legenda={[
        { cor: 'var(--chart-5)', rotulo: 'Semana inteira' },
        { cor: 'var(--chart-3)', rotulo: 'Boa parte' },
        { cor: 'var(--chart-1)', rotulo: 'Começou' },
        { cor: 'var(--chart-grid)', rotulo: 'Ninguém contatado' },
      ]}
    >
      <div ref={ref} className="relative" onMouseLeave={() => setAtivo(null)}>
        <ul className="space-y-1">
          {linhas.map((linha, indiceLinha) => (
            <li
              key={linha.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(6rem,10rem)_auto]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm">{linha.nome}</span>
                {linha.selo}
              </span>

              <span
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}
              >
                {linha.celulas.map((celula, indiceCelula) => (
                  <span
                    key={celula.rotulo}
                    className="h-5 w-full min-w-2 rounded-[3px]"
                    style={{
                      background: corDaCelula(celula),
                      boxShadow:
                        celula.total === 0 ? 'inset 0 0 0 1px var(--chart-grid)' : undefined,
                      opacity: !ativo || ativo.linha === indiceLinha ? 1 : 0.5,
                    }}
                    onMouseMove={(evento) => {
                      setAtivo({ linha: indiceLinha, celula: indiceCelula })
                      setX(evento.clientX - (ref.current?.getBoundingClientRect().left ?? 0))
                    }}
                  />
                ))}
              </span>
            </li>
          ))}
        </ul>

        {ativo && linhas[ativo.linha]?.celulas[ativo.celula] && (
          <Dica
            x={x}
            largura={largura}
            titulo={linhas[ativo.linha]!.nome}
            linhas={[
              {
                rotulo: linhas[ativo.linha]!.celulas[ativo.celula]!.rotulo,
                valor: `${linhas[ativo.linha]!.celulas[ativo.celula]!.feitos} de ${
                  linhas[ativo.linha]!.celulas[ativo.celula]!.total
                }`,
              },
            ]}
          />
        )}
      </div>
    </Figura>
  )
}

function corDaCelula({ total, feitos }: { total: number; feitos: number }): string {
  if (total === 0) return 'transparent'
  const parte = feitos / total
  if (parte >= 1) return 'var(--chart-5)'
  if (parte >= 0.5) return 'var(--chart-3)'
  if (parte > 0) return 'var(--chart-1)'
  return 'var(--chart-grid)'
}
