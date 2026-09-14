import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Download, Loader2, Minus, Plus, RotateCcw, X } from 'lucide-react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * O talk aberto dentro do app.
 *
 * Antes o PDF abria no leitor do próprio celular: tela preta enquanto baixava
 * tudo, e depois uma tela sem saída óbvia — no app instalado do iPhone, quem
 * não conhece o gesto de voltar fica preso ali. Aqui ele abre por cima da tela
 * do talk, com um "Fechar" grande no alto, e as páginas aparecem aos poucos.
 *
 * O leitor é o pdf.js (o mesmo do Firefox), carregado só quando alguém abre um
 * talk. Ele pede o PDF em pedaços: a primeira página aparece sem esperar os
 * 6 MB inteiros.
 */
export function LeitorDePdf({
  url,
  titulo,
  aberto,
  onFechar,
  urlParaBaixar,
}: {
  url: string | undefined
  titulo: string
  aberto: boolean
  onFechar: () => void
  urlParaBaixar?: string
}) {
  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={(valor) => !valor && onFechar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 flex flex-col bg-neutral-900 text-white"
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-neutral-900/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                className="h-11 gap-1.5 px-3 text-white hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" aria-hidden />
                Fechar
              </Button>
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-center text-sm font-medium">
              {titulo}
            </DialogPrimitive.Title>
            {urlParaBaixar ? (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-11 text-white hover:bg-white/10 hover:text-white"
              >
                <a href={urlParaBaixar} aria-label="Baixar o PDF">
                  <Download className="size-5" aria-hidden />
                </a>
              </Button>
            ) : (
              <span className="size-11" />
            )}
          </header>

          {aberto && url && <Documento key={url} url={url} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const ZOOMS = [1, 1.5, 2, 3]

type Estado =
  | { fase: 'carregando'; fracao: number | null }
  | { fase: 'pronto'; doc: PDFDocumentProxy; proporcao: number }
  | { fase: 'erro' }

function Documento({ url }: { url: string }) {
  const [estado, setEstado] = React.useState<Estado>({ fase: 'carregando', fracao: null })
  const [tentativa, setTentativa] = React.useState(0)
  const [zoom, setZoom] = React.useState(0)
  const [paginaAtual, setPaginaAtual] = React.useState(1)
  const rolagem = React.useRef<HTMLDivElement>(null)
  const [largura, setLargura] = React.useState(0)

  React.useEffect(() => {
    let cancelado = false
    let destruir: (() => void) | undefined

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

        const tarefa = pdfjs.getDocument({
          url,
          // Pedaços de 1 MB: num talk de várias páginas a primeira chega sem
          // esperar o resto; num de página única (o Tema 8 é uma página de
          // 6 MB) são seis pedidos, e não vinte e quatro.
          rangeChunkSize: 1024 * 1024,
          disableAutoFetch: true,
          disableStream: true,
        })
        destruir = () => void tarefa.destroy()

        tarefa.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (!cancelado && total > 0) {
            setEstado((antes) =>
              antes.fase === 'carregando' ? { fase: 'carregando', fracao: loaded / total } : antes,
            )
          }
        }

        const doc = await tarefa.promise
        const primeira = await doc.getPage(1)
        const { width, height } = primeira.getViewport({ scale: 1 })
        if (!cancelado) setEstado({ fase: 'pronto', doc, proporcao: height / width })
      } catch (erro) {
        console.error('[leitor] não abriu o PDF:', erro)
        if (!cancelado) setEstado({ fase: 'erro' })
      }
    })()

    return () => {
      cancelado = true
      destruir?.()
    }
  }, [url, tentativa])

  // A largura da tela decide o tamanho das páginas; girar o celular refaz.
  React.useEffect(() => {
    const elemento = rolagem.current
    if (!elemento) return
    const observador = new ResizeObserver(([entrada]) => {
      setLargura(Math.floor(entrada!.contentRect.width))
    })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  const larguraDaPagina = Math.max(0, largura - 16) * ZOOMS[zoom]!

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={rolagem}
        className="min-h-0 flex-1 overflow-auto overscroll-contain"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        {estado.fase === 'carregando' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Loader2 className="size-8 animate-spin text-white/70" aria-hidden />
            <p className="text-sm text-white/80">Abrindo o talk…</p>
            {estado.fracao !== null && (
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full bg-white/80 transition-[width]"
                  style={{ width: `${Math.max(4, Math.round(estado.fracao * 100))}%` }}
                />
              </div>
            )}
          </div>
        )}

        {estado.fase === 'erro' && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-white/80">
              Não foi possível abrir o talk agora. Verifique a conexão e tente de novo.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setEstado({ fase: 'carregando', fracao: null })
                setTentativa((n) => n + 1)
              }}
            >
              <RotateCcw aria-hidden />
              Tentar de novo
            </Button>
          </div>
        )}

        {estado.fase === 'pronto' && larguraDaPagina > 0 && (
          <div
            className="mx-auto flex flex-col items-center gap-2 px-2 py-2"
            style={{ width: larguraDaPagina + 16 }}
          >
            {Array.from({ length: estado.doc.numPages }, (_, indice) => (
              <Pagina
                key={indice}
                doc={estado.doc}
                numero={indice + 1}
                largura={larguraDaPagina}
                proporcao={estado.proporcao}
                raiz={rolagem}
                aoAparecer={setPaginaAtual}
              />
            ))}
          </div>
        )}
      </div>

      {estado.fase === 'pronto' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-neutral-800/95 px-1.5 py-1 text-sm shadow-lg ring-1 ring-white/10">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 text-white hover:bg-white/10 hover:text-white"
              aria-label="Diminuir"
              disabled={zoom === 0}
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
            >
              <Minus aria-hidden />
            </Button>
            <span className="tabular min-w-20 text-center text-white/90" aria-live="polite">
              {paginaAtual} de {estado.doc.numPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 text-white hover:bg-white/10 hover:text-white"
              aria-label="Aumentar"
              disabled={zoom === ZOOMS.length - 1}
              onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Uma página. Só desenha quando chega perto da tela: um talk de 20 páginas
 * desenhado de uma vez gastaria a memória que o Safari do iPhone não tem.
 */
function Pagina({
  doc,
  numero,
  largura,
  proporcao,
  raiz,
  aoAparecer,
}: {
  doc: PDFDocumentProxy
  numero: number
  largura: number
  proporcao: number
  raiz: React.RefObject<HTMLDivElement | null>
  aoAparecer: (numero: number) => void
}) {
  const caixa = React.useRef<HTMLDivElement>(null)
  const tela = React.useRef<HTMLCanvasElement>(null)
  const [perto, setPerto] = React.useState(numero <= 2)
  const [altura, setAltura] = React.useState(largura * proporcao)
  const [desenhada, setDesenhada] = React.useState(false)

  React.useEffect(() => {
    const elemento = caixa.current
    if (!elemento) return
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) setPerto(true)
          if (entrada.intersectionRatio >= 0.5) aoAparecer(numero)
        }
      },
      { root: raiz.current, rootMargin: '150% 0px', threshold: [0, 0.5] },
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [numero, raiz, aoAparecer])

  React.useEffect(() => {
    if (!perto) return
    let cancelado = false
    let tarefa: ReturnType<PDFPageProxy['render']> | undefined

    ;(async () => {
      const pagina = await doc.getPage(numero)
      if (cancelado || !tela.current) return

      const base = pagina.getViewport({ scale: 1 })
      // Nitidez de tela retina, com teto: o iPhone recusa canvas gigantes e a
      // página simplesmente some.
      const densidade = Math.min(window.devicePixelRatio || 1, 3)
      let escala = (largura / base.width) * densidade
      const pixels = base.width * base.height * escala * escala
      const teto = 16_000_000
      if (pixels > teto) escala *= Math.sqrt(teto / pixels)

      const viewport = pagina.getViewport({ scale: escala })
      const canvas = tela.current
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      setAltura(largura * (base.height / base.width))

      tarefa = pagina.render({ canvas, viewport })
      try {
        await tarefa.promise
        if (!cancelado) setDesenhada(true)
      } catch {
        // Cancelado por troca de zoom ou por fechar: nada a fazer.
      }
    })()

    return () => {
      cancelado = true
      tarefa?.cancel()
    }
  }, [doc, numero, largura, perto])

  return (
    <div
      ref={caixa}
      className="relative overflow-hidden rounded-sm bg-white shadow-md"
      style={{ width: largura, height: altura }}
    >
      {!desenhada && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-neutral-400" aria-hidden />
        </div>
      )}
      <canvas
        ref={tela}
        aria-label={`Página ${numero}`}
        className={cn('block h-full w-full', !desenhada && 'opacity-0')}
      />
    </div>
  )
}
