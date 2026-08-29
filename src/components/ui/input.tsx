import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      // 🪤 16px no celular (`text-base`) nao e escolha estetica: abaixo disso o
      // Safari do iPhone da zoom sozinho quando o campo recebe foco, e nao
      // desfaz depois. O layout parece quebrado, e a causa fica escondida no
      // tamanho da fonte. No desktop volta para 15px.
      className={cn(
        'border-input bg-card placeholder:text-muted-foreground/70 flex h-11 w-full rounded-lg border px-3 py-2 text-base sm:text-[15px] shadow-xs transition-colors',
        'focus-visible:border-ring focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'aria-invalid:border-destructive aria-invalid:outline-destructive',
        'file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
