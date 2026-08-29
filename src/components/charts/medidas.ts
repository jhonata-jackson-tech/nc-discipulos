import * as React from 'react'

/**
 * As contas dos graficos, longe dos componentes.
 *
 * Arquivo separado de proposito: misturar funcao e componente no mesmo modulo
 * quebra o recarregamento rapido do Vite, e um relatorio que pisca inteiro a
 * cada salvamento e um relatorio dificil de ajustar.
 */

/**
 * Largura real do container, em pixels.
 *
 * Um `viewBox` esticado resolveria o tamanho sem medir nada, mas escalaria o
 * texto junto: no celular os rotulos virariam 6px. Medir custa um
 * `ResizeObserver` e devolve texto no tamanho que foi desenhado.
 */
export function useLargura<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [largura, setLargura] = React.useState(0)

  React.useLayoutEffect(() => {
    const alvo = ref.current
    if (!alvo) return
    const observador = new ResizeObserver(([entrada]) => {
      setLargura(entrada?.contentRect.width ?? 0)
    })
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [])

  return [ref, largura] as const
}

/** `12 de 30 · 40%` sem virar `40.00000001%`. */
export function porcento(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}
