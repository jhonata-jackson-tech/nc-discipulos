import * as React from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Aniversariante } from '@/types/database'
import { dataValida, MESES } from './lista'
import { useSalvarAniversariante } from './use-aniversariantes'

/** Incluir ou corrigir alguém da lista. Só dia e mês: a lista não guarda ano. */
export function AniversarianteDialog({
  aniversariante,
  open,
  onOpenChange,
}: {
  aniversariante: Aniversariante | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const salvar = useSalvarAniversariante()
  const [nome, setNome] = React.useState(aniversariante?.nome ?? '')
  const [dia, setDia] = React.useState(aniversariante ? String(aniversariante.dia) : '')
  const [mes, setMes] = React.useState(aniversariante ? String(aniversariante.mes) : '')
  const [observacao, setObservacao] = React.useState(aniversariante?.observacao ?? '')

  const dataOk = Boolean(dia && mes) && dataValida(Number(dia), Number(mes))
  const pode = nome.trim().length > 0 && dataOk

  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault()
    if (!pode) return
    salvar.mutate(
      { id: aniversariante?.id, nome, dia: Number(dia), mes: Number(mes), observacao },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {aniversariante ? 'Editar aniversariante' : 'Novo aniversariante'}
          </DialogTitle>
          <DialogDescription>
            No dia, líderes e discípulos recebem um aviso às 8h para lembrar o GC.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Field label="Nome" htmlFor="aniv-nome" required>
            <Input
              id="aniv-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Lethicia Mota"
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Field label="Dia" required>
              <Select value={dia} onValueChange={setDia}>
                <SelectTrigger aria-label="Dia">
                  <SelectValue placeholder="Dia" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Mês"
              required
              error={dia && mes && !dataOk ? 'Esse mês não tem esse dia.' : undefined}
            >
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger aria-label="Mês">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((nomeDoMes, i) => (
                    <SelectItem key={nomeDoMes} value={String(i + 1)}>
                      {nomeDoMes}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Quem é"
            htmlFor="aniv-obs"
            hint="Opcional. Ex.: filha do Diego, esposa do Robson."
          >
            <Input
              id="aniv-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!pode} loading={salvar.isPending}>
              <Save aria-hidden />
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
