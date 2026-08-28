import * as React from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { useSession } from '@/features/auth/session-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DemoAccount {
  nome: string
  papel: string
  email: string
  senha: string
}

/**
 * Atalho de avaliação: troca de conta sem passar pelo login.
 *
 * Existe apenas em desenvolvimento e apenas quando `VITE_DEMO_ACCOUNTS` está
 * definido - o `npm run demo` grava essa variável no `.env.local`. Em produção
 * o componente inteiro é removido do bundle, junto com as credenciais.
 */
function readAccounts(): DemoAccount[] {
  if (!import.meta.env.DEV) return []
  const raw = import.meta.env.VITE_DEMO_ACCOUNTS
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DemoAccount[]) : []
  } catch {
    console.warn('[Cuidar GC] VITE_DEMO_ACCOUNTS não é um JSON válido.')
    return []
  }
}

export function DemoRoleSwitcher({ compact = false }: { compact?: boolean }) {
  const accounts = React.useMemo(() => readAccounts(), [])
  const { profile } = useSession()
  const [switching, setSwitching] = React.useState<string | null>(null)

  if (accounts.length === 0) return null

  const trocar = async (account: DemoAccount) => {
    setSwitching(account.email)
    try {
      await supabase.auth.signOut()
      const { error } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: account.senha,
      })
      if (error) throw error

      // Recarrega para começar limpo: cache de dados, rota e permissões.
      window.location.assign('/')
    } catch (error) {
      toast.error(friendlyError(error))
      setSwitching(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon" aria-label="Trocar de perfil (demonstração)">
            <FlaskConical className="size-5" aria-hidden />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full justify-start gap-2">
            <FlaskConical aria-hidden />
            Trocar de perfil
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Ver o sistema como</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {accounts.map((account) => {
          const atual = profile?.full_name === account.nome
          return (
            <DropdownMenuItem
              key={account.email}
              disabled={atual || switching !== null}
              onSelect={(event) => {
                event.preventDefault()
                if (!atual) void trocar(account)
              }}
            >
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium">{account.papel}</span>
                <span className="text-muted-foreground block truncate text-xs">{account.nome}</span>
              </span>
              {switching === account.email && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              {atual && <span className="text-primary text-xs">atual</span>}
            </DropdownMenuItem>
          )
        })}

        <DropdownMenuSeparator />
        <p className={cn('text-muted-foreground px-3 py-2 text-xs')}>
          Atalho de demonstração. Não existe fora do ambiente de desenvolvimento.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
