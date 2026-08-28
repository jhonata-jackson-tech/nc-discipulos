import { Settings2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Sem Supabase configurado o app nao inventa dados: ele explica o que falta.
 */
export function MissingConfig() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <Card className="max-w-lg">
        <CardContent className="p-0">
          <EmptyState
            icon={Settings2}
            title="Falta configurar o Supabase"
            description="Crie um arquivo .env.local na raiz do projeto com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY, e reinicie o servidor. O passo a passo está no README."
          />
          <div className="px-6 pb-6">
            <pre className="bg-secondary text-muted-foreground overflow-x-auto rounded-lg p-4 text-xs">
{`VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
