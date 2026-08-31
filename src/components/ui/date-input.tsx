import * as React from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Campo de data que fala portugues em qualquer aparelho.
 *
 * O `<input type="date">` nativo escreve a data no idioma **do aparelho**, nao
 * no da pagina: num iPhone configurado em ingles, o encontro de 30/08 aparecia
 * como "30 Aug 2026" no meio de uma tela inteira em portugues. O `lang` do
 * documento nao muda isso, e nao ha CSS que alcance o texto que o sistema
 * desenha ali dentro.
 *
 * Entao o campo nativo continua exatamente onde estava - e ele que abre o
 * calendario do sistema, e e ele que o formulario e o leitor de tela enxergam -
 * so que invisivel, por cima do texto que nos mesmos escrevemos. Tocar em
 * qualquer ponto do campo abre o calendario, como sempre.
 */
export interface DateInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value'
> {
  /** ISO do proprio input: `2026-08-30` ou `2026-08-30T19:30`. */
  value?: string | number | readonly string[]
  type?: 'date' | 'datetime-local'
}

/**
 * Do ISO para o jeito que se escreve data aqui.
 *
 * Sem fuso e sem `Date`: o valor ja vem no calendario de quem digitou, e
 * converter para `Date` so criaria a chance de deslocar um dia.
 */
function comoSeEscreveAqui(valor: string): string {
  const [dia, hora] = valor.split('T')
  const [ano, mes, diaDoMes] = (dia ?? '').split('-')
  if (!ano || !mes || !diaDoMes) return valor

  const data = `${diaDoMes}/${mes}/${ano}`
  return hora ? `${data} ${hora.slice(0, 5)}` : data
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, type = 'date', value, disabled, onClick, ...props }, ref) => {
    const iso = typeof value === 'string' ? value : ''
    const texto = iso ? comoSeEscreveAqui(iso) : ''
    const vazio = type === 'datetime-local' ? 'dd/mm/aaaa --:--' : 'dd/mm/aaaa'

    return (
      <span className={cn('relative block', className)}>
        <input
          ref={ref}
          type={type}
          value={value ?? ''}
          disabled={disabled}
          // No desktop, so o iconezinho do navegador abre o calendario - e o
          // nosso icone e desenhado fora do campo nativo. `showPicker` devolve
          // esse toque ao campo inteiro; onde ele nao existe, resta digitar.
          onClick={(evento) => {
            onClick?.(evento)
            const campo = evento.currentTarget
            if (typeof campo.showPicker !== 'function') return
            try {
              campo.showPicker()
            } catch {
              // Alguns navegadores recusam quando o calendario ja esta aberto.
            }
          }}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />

        {/* O que se ve. `aria-hidden` porque quem le a tela ja ouve o campo
            nativo logo acima - anunciar a data duas vezes seria pior. */}
        <span
          aria-hidden
          className={cn(
            'border-input bg-card flex h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-base shadow-xs transition-colors sm:text-[15px]',
            'peer-focus-visible:border-ring peer-focus-visible:outline-ring peer-focus-visible:outline-2',
            'peer-aria-invalid:border-destructive peer-aria-invalid:outline-destructive',
            disabled && 'opacity-60',
          )}
        >
          <span className={cn('truncate', !texto && 'text-muted-foreground/70')}>
            {texto || vazio}
          </span>
          <CalendarDays className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </span>
      </span>
    )
  },
)
DateInput.displayName = 'DateInput'
