import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

export function NotFoundPage() {
  return (
    <Card>
      <CardContent className="p-0">
        <EmptyState
          icon={Compass}
          title="Página não encontrada"
          description="O endereço que você abriu não existe ou foi movido."
          action={
            <Button asChild>
              <Link to="/">Voltar para minha semana</Link>
            </Button>
          }
        />
      </CardContent>
    </Card>
  )
}
