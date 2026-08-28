import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-xl font-bold sm:text-2xl">{title}</h1>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
      {/* No celular as acoes ganham a linha inteira; a partir de `sm` voltam
          para o canto direito do titulo. */}
      {actions && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">{actions}</div>
      )}
    </div>
  )
}
