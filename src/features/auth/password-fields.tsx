import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PASSWORD_RULES } from './password-rules'

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="space-y-1" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value)
        return (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-1.5 text-xs',
              ok ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}
