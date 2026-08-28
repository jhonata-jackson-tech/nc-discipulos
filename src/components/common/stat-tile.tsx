import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

interface StatTileProps {
  label: string
  value: number | string
  icon?: LucideIcon
  tone?: 'default' | 'warning' | 'danger' | 'success'
  hint?: string
}

const TONE = {
  default: 'bg-primary-soft text-accent-foreground',
  warning: 'bg-warning/18 text-warning-foreground',
  danger: 'bg-destructive/12 text-destructive',
  success: 'bg-success/12 text-success',
}

export function StatTile({ label, value, icon: Icon, tone = 'default', hint }: StatTileProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="tabular font-display text-2xl leading-none font-bold">{value}</p>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
            <Icon className="size-[18px]" aria-hidden />
          </span>
        )}
      </div>
    </Card>
  )
}
