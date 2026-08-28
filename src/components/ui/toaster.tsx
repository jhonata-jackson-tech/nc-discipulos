import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset={16}
      duration={4500}
      toastOptions={{
        classNames: {
          toast:
            'group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-overlay',
          title: 'font-medium',
          description: 'text-muted-foreground text-sm',
          actionButton: 'bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs',
          error: 'border-destructive/25',
          success: 'border-success/25',
        },
      }}
    />
  )
}
