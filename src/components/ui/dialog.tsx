import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
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
        // Só os campos rolam. O formulário vira a área de rolagem e o
        // cabeçalho fica de fora dela: no celular, ver o título sumir e ter
        // que rolar de volta para achar o botão é o que faz parecer página em
        // vez de aplicativo.
        '[&>form]:flex [&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col [&>form]:overflow-y-auto [&>form]:overscroll-contain',
        // Celular: folha que sobe. Desktop: caixa centralizada.
        'inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
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
