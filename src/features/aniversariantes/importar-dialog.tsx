import * as React from 'react'
import { ClipboardPaste } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Aniversariante } from '@/types/database'
import { chaveDoAniversariante, lerLista, MESES } from './lista'
import { useImportarAniversariantes } from './use-aniversariantes'

/**
 * Colar a lista do WhatsApp.
 *
 * A prévia vem antes de gravar: quantos são novos, quantos já estavam, e as
 * linhas que não deu para entender — escritas, para a pessoa corrigir no texto
 * em vez de descobrir depois que alguém ficou de fora.
 */
export function ImportarDialog({
  open,
  onOpenChange,
  existentes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existentes: Aniversariante[]
}) {
  const importar = useImportarAniversariantes()
  const [texto, setTexto] = React.useState('')

  const leitura = React.useMemo(() => lerLista(texto), [texto])
  const jaNaLista = React.useMemo(
    () => new Set(existentes.map(chaveDoAniversariante)),
    [existentes],
  )

  // A mesma pessoa repetida no próprio texto também entra uma vez só.
  const vistos = new Set<string>()
  const novos = leitura.lidos.filter((a) => {
    const chave = chaveDoAniversariante(a)
    if (jaNaLista.has(chave) || vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
  const repetidos = leitura.lidos.length - novos.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Colar a lista de aniversariantes</DialogTitle>
          <DialogDescription>
            Cole o texto como ele está no WhatsApp: o mês numa linha e “- dia: nome” embaixo. Quem
            já está na lista não entra de novo.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(evento) => {
            evento.preventDefault()
            importar.mutate(novos, { onSuccess: () => onOpenChange(false) })
          }}
        >
          <Field label="Lista" htmlFor="lista-colada">
            <Textarea
              id="lista-colada"
              rows={10}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={'*Janeiro*\n- 2: Patrícia\n- 14: David'}
            />
          </Field>

          {texto.trim() && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{novos.length} novo(s)</Badge>
                {repetidos > 0 && <Badge variant="neutral">{repetidos} já na lista</Badge>}
                {leitura.ignoradas.length > 0 && (
                  <Badge variant="warning">
                    {leitura.ignoradas.length} linha(s) não entendida(s)
                  </Badge>
                )}
              </div>

              {novos.length > 0 && (
                <ul className="text-muted-foreground max-h-40 space-y-0.5 overflow-y-auto text-sm">
                  {novos.map((a) => (
                    <li key={chaveDoAniversariante(a)}>
                      <span className="tabular">
                        {String(a.dia).padStart(2, '0')}/{String(a.mes).padStart(2, '0')}
                      </span>{' '}
                      · <span className="text-foreground">{a.nome}</span>{' '}
                      <span className="text-xs">({MESES[a.mes - 1]})</span>
                    </li>
                  ))}
                </ul>
              )}

              {leitura.ignoradas.length > 0 && (
                <div className="text-sm">
                  <p className="text-warning-foreground font-medium">Não entendi estas linhas:</p>
                  <ul className="text-muted-foreground list-inside list-disc">
                    {leitura.ignoradas.map((linha, i) => (
                      <li key={i}>{linha}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={novos.length === 0} loading={importar.isPending}>
              <ClipboardPaste aria-hidden />
              {novos.length > 0 ? `Incluir ${novos.length}` : 'Incluir'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
