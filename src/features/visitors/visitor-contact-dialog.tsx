import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MessageSquare } from 'lucide-react'
import { formatDate, todayISO } from '@/lib/date'
import { channelLabel, gcIntentLabel } from '@/lib/labels'
import type { ContactChannel, GcIntent } from '@/types/database'
import { cn } from '@/lib/utils'
import { useLogVisitorContact, useVisitorContacts, type Visitante } from './use-visitors'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
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

const CANAIS: ContactChannel[] = ['whatsapp', 'call', 'in_person', 'message', 'video', 'other']
const INTENCOES: GcIntent[] = ['vem', 'nao_vem', 'nao_sabe']

const schema = z.object({
  intencao: z.enum(['vem', 'nao_vem', 'nao_sabe']).optional(),
  canal: z.enum(['whatsapp', 'call', 'in_person', 'message', 'video', 'other']),
  quando: z.string().min(1, 'Informe a data do contato.'),
  anotacao: z.string().max(1500, 'Texto muito longo.').optional(),
})

type FormValues = z.infer<typeof schema>

/**
 * O contato da liderança com um visitante — e tudo o que já foi conversado.
 *
 * A pergunta aqui não é a do cuidado semanal ("como ela está"): com quem
 * visitou uma vez ainda não se pergunta isso, e uma resposta chutada entraria
 * na mesma escala que descreve o GC inteiro. A pergunta é outra — ele volta?
 */
export function VisitorContactDialog({
  visitante,
  open,
  onOpenChange,
}: {
  visitante: Visitante | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && visitante && <Corpo visitante={visitante} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Corpo({ visitante, onClose }: { visitante: Visitante; onClose: () => void }) {
  const registrar = useLogVisitorContact()
  const historico = useVisitorContacts(visitante.id)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { canal: 'whatsapp', quando: todayISO(), anotacao: '' },
  })

  const quando = useWatch({ control: form.control, name: 'quando' })

  const onSubmit = form.handleSubmit(async (values) => {
    await registrar.mutateAsync({
      visitorId: visitante.id,
      canal: values.canal,
      intencao: values.intencao ?? null,
      quando: values.quando,
      anotacao: values.anotacao?.trim() || null,
    })
    onClose()
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Falar com {visitante.nome.split(' ')[0]}</DialogTitle>
        <DialogDescription>
          {visitante.contatos === 0
            ? 'Primeiro contato desde a visita.'
            : `${visitante.contatos} conversa(s) até aqui.`}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Ele volta ao GC?">
          <Controller
            control={form.control}
            name="intencao"
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Volta ao GC">
                {INTENCOES.map((opcao) => {
                  const escolhido = field.value === opcao
                  return (
                    <button
                      key={opcao}
                      type="button"
                      role="radio"
                      aria-checked={escolhido}
                      onClick={() => field.onChange(escolhido ? undefined : opcao)}
                      className={cn(
                        'min-h-12 rounded-lg border px-2 py-2 text-sm font-medium transition-colors',
                        escolhido
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-secondary',
                      )}
                    >
                      {gcIntentLabel[opcao]}
                    </button>
                  )
                })}
              </div>
            )}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Por onde falou">
            <Controller
              control={form.control}
              name="canal"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Canal do contato">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANAIS.map((canal) => (
                      <SelectItem key={canal} value={canal}>
                        {channelLabel[canal]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field
            label="Quando"
            htmlFor="contato-quando"
            error={form.formState.errors.quando?.message}
          >
            <DateInput
              id="contato-quando"
              max={todayISO()}
              value={quando}
              {...form.register('quando')}
            />
          </Field>
        </div>

        <Field
          label="Anotação"
          htmlFor="contato-anotacao"
          error={form.formState.errors.anotacao?.message}
        >
          <Textarea
            id="contato-anotacao"
            rows={3}
            placeholder="O que ele disse, o que ficou combinado. Opcional."
            {...form.register('anotacao')}
          />
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Registrar contato
          </Button>
        </DialogFooter>
      </form>

      <section className="border-border space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Conversas anteriores</h3>

        {historico.isLoading && <Skeleton className="h-16 rounded-lg" />}

        {historico.isSuccess && historico.data.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma conversa ainda"
            description="O primeiro contato depois da visita aparece aqui."
          />
        )}

        <ol className="space-y-2">
          {historico.data?.map((contato) => (
            <li key={contato.id} className="border-border rounded-lg border p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{formatDate(contato.quando)}</span>
                <Badge variant="neutral">{channelLabel[contato.canal]}</Badge>
                {contato.intencao && (
                  <Badge variant={contato.intencao === 'vem' ? 'success' : 'outline'}>
                    {gcIntentLabel[contato.intencao]}
                  </Badge>
                )}
              </div>
              {contato.anotacao ? (
                <p className="text-sm text-pretty">{contato.anotacao}</p>
              ) : (
                <p className="text-muted-foreground text-sm">Sem observações.</p>
              )}
              <p className="text-muted-foreground mt-2 text-xs">Registrado por {contato.autor}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
