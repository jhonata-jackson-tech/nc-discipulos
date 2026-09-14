import { cn } from '@/lib/utils'
import { MESES } from './lista'

/** O dia e o mês num quadradinho, como folha de calendário. */
export function DataDoAniversario({
  dia,
  mes,
  destaque,
}: {
  dia: number
  mes: number
  destaque?: boolean
}) {
  return (
    <span
      className={cn(
        'flex size-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none',
        destaque ? 'bg-success/15 text-success' : 'bg-secondary text-foreground',
      )}
    >
      <span className="tabular text-base font-bold">{dia}</span>
      <span className="text-[10px] uppercase">{MESES[mes - 1]!.slice(0, 3)}</span>
    </span>
  )
}
