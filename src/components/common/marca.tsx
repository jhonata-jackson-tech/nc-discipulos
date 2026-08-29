import { cn } from '@/lib/utils'

/**
 * A marca do GC.
 *
 * Desenhada como máscara sobre `currentColor`, e não como imagem: um arquivo
 * só serve o tema claro, o escuro e o painel escuro da tela de entrada, sempre
 * com o contraste certo. Decorativa por padrão — o nome "Cuidar GC" costuma
 * estar do lado, e um leitor de tela não precisa ouvir as duas coisas.
 */
export function Marca({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      className={cn('marca block bg-current', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
