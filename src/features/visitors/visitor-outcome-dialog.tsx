import * as React from 'react'
import { UserPlus } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCloseVisitor, usePromoteVisitor, type Visitante } from './use-visitors'

export type Desfecho = 'promover' | 'encerrar'

/**
 * O fim do acompanhamento — dos dois jeitos que ele acaba.
 *
 * As duas saídas moram no mesmo lugar porque são a mesma decisão vista de dois
 * ângulos: ou a pessoa fica, ou a liderança para de procurá-la. O que muda é
 * o que cada uma exige — a primeira, um papel; a segunda, um motivo escrito.
 */
export function VisitorOutcomeDialog({
  visitante,
  desfecho,
  open,
  onOpenChange,
}: {
  visitante: Visitante | null
  desfecho: Desfecho
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* O corpo só existe enquanto o diálogo está aberto: assim a escolha
            do papel e o motivo escrito nascem em branco a cada abertura, sem
            um efeito para limpá-los depois. */}
        {open && visitante && (
          <Corpo visitante={visitante} desfecho={desfecho} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Corpo({
  visitante,
  desfecho,
  onClose,
}: {
  visitante: Visitante
  desfecho: Desfecho
  onClose: () => void
}) {
  const promover = usePromoteVisitor()
  const encerrar = useCloseVisitor()

  const [papel, setPapel] = React.useState<'member' | 'disciple'>('member')
  const [motivo, setMotivo] = React.useState('')
  const [erro, setErro] = React.useState<string | null>(null)

  const confirmar = async () => {
    if (desfecho === 'promover') {
      await promover.mutateAsync({ visitorId: visitante.id, papel })
    } else {
      if (!motivo.trim()) {
        setErro('Diga o motivo: daqui a três meses ninguém lembra.')
        return
      }
      await encerrar.mutateAsync({ visitorId: visitante.id, motivo: motivo.trim() })
    }
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {desfecho === 'promover'
            ? `${visitante.nome} entra no GC`
            : `Encerrar o acompanhamento de ${visitante.nome}`}
        </DialogTitle>
        <DialogDescription>
          {desfecho === 'promover'
            ? 'O histórico de visitante fica guardado e ligado ao novo cadastro.'
            : 'O cadastro e as conversas continuam aqui — o que para é a procura.'}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        {desfecho === 'promover' ? (
          <div className="space-y-4">
            <Field label="Entra como" required>
              <RadioGroup
                value={papel}
                onValueChange={(valor) => setPapel(valor as 'member' | 'disciple')}
                className="grid gap-2"
              >
                <label className="border-input hover:bg-secondary flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="member" id="papel-member" className="mt-0.5" />
                  <span>
                    <Label htmlFor="papel-member" className="cursor-pointer">
                      Irmão/Irmã
                    </Label>
                    <span className="text-muted-foreground block text-xs text-pretty">
                      Passa a ser cuidado no rodízio da semana, como o restante do GC.
                    </span>
                  </span>
                </label>
                <label className="border-input hover:bg-secondary flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="disciple" id="papel-disciple" className="mt-0.5" />
                  <span>
                    <Label htmlFor="papel-disciple" className="cursor-pointer">
                      Discípulo
                    </Label>
                    <span className="text-muted-foreground block text-xs text-pretty">
                      Além de ser cuidado, também cuida. Vincule a um líder em Integrantes.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </Field>

            {!visitante.generoDeCuidado && (
              <Alert variant="warning">
                <UserPlus aria-hidden />
                <AlertDescription>
                  O gênero de cuidado dele ainda não foi confirmado. Sem isso a distribuição da
                  semana fica bloqueada — confirme em Integrantes logo depois.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <Field
            label="Por quê?"
            htmlFor="motivo-do-encerramento"
            required
            error={erro ?? undefined}
          >
            <Textarea
              id="motivo-do-encerramento"
              rows={3}
              autoFocus
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                setErro(null)
              }}
              placeholder="Encaminhamos para o GC do bairro dele. / Pediu para não ser mais procurado."
            />
          </Field>
        )}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant={desfecho === 'encerrar' ? 'destructive' : 'default'}
          loading={promover.isPending || encerrar.isPending}
          onClick={confirmar}
        >
          {desfecho === 'promover' ? 'Colocar no GC' : 'Encerrar'}
        </Button>
      </DialogFooter>
    </>
  )
}
