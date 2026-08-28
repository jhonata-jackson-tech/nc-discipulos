import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { friendlyError } from '@/lib/errors'

export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index}>
          <CardContent className="flex items-center gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function StatsSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: tiles }).map((_, index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card className="border-destructive/25">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="bg-destructive/10 text-destructive flex size-11 items-center justify-center rounded-full">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Não conseguimos carregar esta parte</p>
          <p className="text-muted-foreground text-sm">{friendlyError(error)}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden />
            Tentar de novo
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
