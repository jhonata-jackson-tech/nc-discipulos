import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn, initials } from '@/lib/utils'

interface PersonProps {
  name: string
  detail?: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
  /** Foto da pessoa. Sem ela, ficam as iniciais - nunca um boneco genérico. */
  photo?: string | null
}

export function Person({ name, detail, className, size = 'md', photo }: PersonProps) {
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <Avatar className={size === 'sm' ? 'size-8' : 'size-10'}>
        {photo && <AvatarImage src={photo} alt="" />}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 leading-tight">
        <span className={cn('block truncate font-medium', size === 'sm' && 'text-sm')}>{name}</span>
        {detail && <span className="text-muted-foreground block truncate text-xs">{detail}</span>}
      </span>
    </span>
  )
}
