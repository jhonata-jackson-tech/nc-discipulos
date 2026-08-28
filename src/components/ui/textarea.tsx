import * as React from 'react'
import { cn } from '@/lib/utils'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'border-input bg-card placeholder:text-muted-foreground/70 flex min-h-24 w-full rounded-lg border px-3 py-2 text-[15px] shadow-xs transition-colors',
      'focus-visible:border-ring focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-0',
      'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
