import * as React from 'react'
import { AlertOctagon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

interface State {
  error: Error | null
}

/** Ultima rede de protecao: nenhuma falha deixa a tela em branco. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[Cuidar GC] erro nao tratado:', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center p-5">
        <Card className="max-w-md">
          <CardContent className="p-0">
            <EmptyState
              icon={AlertOctagon}
              title="Algo saiu do lugar"
              description="Tivemos um problema inesperado. Recarregue a página; se continuar, avise a liderança."
              action={
                <Button onClick={() => window.location.reload()}>Recarregar</Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }
}
