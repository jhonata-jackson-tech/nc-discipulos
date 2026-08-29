import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Marca } from '@/components/common/marca'

/**
 * Tela de entrada: no desktop, duas colunas com uma palavra acolhedora ao lado
 * do formulario; no celular, apenas o formulario.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    // O documento nao rola (veja `index.css`), entao esta tela cuida da
    // propria rolagem - em telefone pequeno o formulario passa da altura.
    <div className="h-full overflow-x-hidden overflow-y-auto lg:grid lg:grid-cols-2">
      <aside className="bg-brand-panel text-brand-panel-foreground relative hidden flex-col justify-between p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand-panel-foreground/15 flex size-10 items-center justify-center rounded-lg">
            <Marca className="size-5" />
          </span>
          <span className="font-display text-lg font-bold">Cuidar GC</span>
        </div>

        <div className="max-w-md space-y-4">
          <p className="font-display text-3xl leading-tight font-bold text-balance">
            Cuidar de perto, sem que ninguém fique de fora.
          </p>
          <p className="text-brand-panel-foreground/80 text-pretty">
            Aqui você acompanha quem precisa de um contato nesta semana, registra como foi e avisa a
            liderança quando alguém precisa de mais atenção.
          </p>
        </div>

        <p className="text-brand-panel-foreground/60 text-xs">
          Acesso restrito aos integrantes do Grupo de Crescimento.
        </p>
      </aside>

      <main className="relative flex min-h-full flex-col justify-center px-5 py-10 sm:px-10">
        <div className="safe-top absolute top-3 right-3">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-sm">
          <div className="mb-7 lg:hidden">
            <span className="bg-primary text-primary-foreground mb-4 flex size-11 items-center justify-center rounded-xl">
              <Marca className="size-6" />
            </span>
          </div>

          <div className="mb-6 space-y-1.5">
            <h1 className="font-display text-2xl font-bold">{title}</h1>
            {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
          </div>

          {children}

          {footer && <div className="mt-6 text-sm">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
