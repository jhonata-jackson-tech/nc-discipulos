import * as React from 'react'
import { BellRing, Share } from 'lucide-react'
import { toast } from 'sonner'
import { desligarPush, estadoPush, ligarPush, type EstadoPush } from './push'
import { friendlyError } from '@/lib/errors'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * Liga e desliga o aviso fora do app, neste aparelho.
 *
 * A escolha e por aparelho, nao por conta: quem usa o celular e o computador
 * decide em cada um. E o card so aparece quando ha o que decidir - sem
 * suporte ou sem chaves configuradas no servidor, ele some em vez de mostrar
 * um botao que nao faz nada.
 */
export function PushCard() {
  const [estado, setEstado] = React.useState<EstadoPush | null>(null)
  const [ocupado, setOcupado] = React.useState(false)

  React.useEffect(() => {
    let ativo = true
    estadoPush()
      .then((atual) => ativo && setEstado(atual))
      .catch(() => ativo && setEstado('indisponivel'))
    return () => {
      ativo = false
    }
  }, [])

  if (estado === null || estado === 'sem-suporte' || estado === 'indisponivel') return null

  if (estado === 'precisa-instalar') {
    return (
      <Alert variant="info">
        <Share aria-hidden />
        <AlertDescription>
          Para receber avisos no iPhone, instale o Cuidar GC na tela de início: toque em{' '}
          <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
        </AlertDescription>
      </Alert>
    )
  }

  const alternar = async (ligar: boolean) => {
    setOcupado(true)
    try {
      const proximo = ligar ? await ligarPush() : await desligarPush()
      setEstado(proximo)
      if (proximo === 'ligado') toast.success('Avisos ligados neste aparelho.')
      if (proximo === 'desligado' && !ligar) toast.success('Avisos desligados neste aparelho.')
    } catch (erro) {
      toast.error(friendlyError(erro))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Card className="p-4">
      <CardContent className="p-0">
        <div className="flex items-start gap-3">
          <span className="bg-primary-soft text-accent-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
            <BellRing className="size-4" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <label htmlFor="push" className="font-medium">
              Avisar neste aparelho
            </label>
            <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
              {estado === 'bloqueado'
                ? 'As notificações estão bloqueadas nas configurações do navegador para este site. Libere por lá para voltar a receber.'
                : 'Você recebe um aviso quando a semana é publicada ou alguém precisa de você. Por segurança, o aviso não mostra nomes — o conteúdo fica dentro do app.'}
            </p>
          </div>

          <Switch
            id="push"
            checked={estado === 'ligado'}
            disabled={ocupado || estado === 'bloqueado'}
            onCheckedChange={alternar}
            aria-label="Avisar neste aparelho"
          />
        </div>
      </CardContent>
    </Card>
  )
}
