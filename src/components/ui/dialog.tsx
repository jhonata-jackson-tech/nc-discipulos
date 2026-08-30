import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Diálogo que o botão voltar fecha.
 *
 * Sem isto, no celular o voltar sai da tela em vez de fechar o formulário: a
 * pessoa queria só desistir do cadastro e foi parar em outro lugar. Abrir
 * empilha uma entrada no histórico; fechar por qualquer caminho (X, Esc,
 * salvar) desempilha.
 */
export function Dialog({
  open,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  const empilhado = React.useRef(false)

  React.useEffect(() => {
    if (open && !empilhado.current) {
      empilhado.current = true
      window.history.pushState({ ...window.history.state, dialogoAberto: true }, '')
      return
    }

    // Fechado por dentro (X, Esc, salvou): tira do histórico a entrada que
    // empilhamos, senão o próximo voltar não faria nada visível.
    if (!open && empilhado.current) {
      empilhado.current = false
      if (window.history.state?.dialogoAberto) window.history.back()
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return

    const aoVoltar = () => {
      empilhado.current = false
      onOpenChange?.(false)
    }

    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [open, onOpenChange])

  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />
}
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'bg-card shadow-overlay fixed z-50 flex flex-col gap-4',
        // Só o miolo rola. O cabeçalho e o rodapé ficam fora da rolagem: no
        // celular, ver o título sumir e ter que rolar de volta para achar o
        // botão é o que faz parecer página em vez de aplicativo.
        //
        // Quem rola é o `<form>`, quando ele é o corpo inteiro, ou o
        // `DialogBody`. Sem um dos dois, o conteúdo fica solto: a caixa não
        // sabe onde cortar e estica os filhos até o diálogo virar página.
        '[&>form]:flex [&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col [&>form]:overflow-y-auto [&>form]:overscroll-contain',
        // Celular: folha que sobe. Desktop: caixa centralizada.
        'inset-x-0 bottom-0 max-h-[92dvh] overflow-hidden rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
        'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="text-muted-foreground hover:bg-secondary absolute top-4 right-4 flex size-9 items-center justify-center rounded-md transition-colors"
        aria-label="Fechar"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = 'DialogContent'

/**
 * O miolo do diálogo: a parte que rola.
 *
 * Todo diálogo que não seja um formulário inteiro precisa dele em volta do
 * conteúdo. É o que mantém título e rodapé parados enquanto a lista, o
 * histórico ou o texto longo rolam por baixo — e o que impede que um diálogo
 * mais alto que a tela empurre o botão de confirmar para fora do alcance.
 */
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain',
        className,
      )}
      {...props}
    />
  )
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex shrink-0 flex-col gap-1.5 pr-10', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        // Grudado no fundo da área que rola: o botão de confirmar continua ao
        // alcance do polegar por mais longo que seja o formulário.
        'bg-card sticky bottom-0 z-10 mt-auto pt-3 pb-1',
        className,
      )}
      {...props}
    />
  )
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg leading-tight font-semibold', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'
