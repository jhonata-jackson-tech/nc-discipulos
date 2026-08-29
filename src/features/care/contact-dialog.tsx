import * as React from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronDown, Info } from 'lucide-react'
import { todayISO } from '@/lib/date'
import {
  FEEDBACK_PRIVACY_HINT,
  channelLabel,
  comoChamar,
  gcIntentLabel,
  wellBeingHint,
  wellBeingLabel,
} from '@/lib/labels'
import type { ContactChannel, GcIntent, WellBeing } from '@/types/database'
import { useLogContact, type AssignmentWithPeople } from './use-care'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CHANNELS: ContactChannel[] = ['whatsapp', 'call', 'in_person', 'message', 'video', 'other']

/** Do pior para o melhor: a ordem ajuda a escolher sem ler tudo. */
const ESCALA: WellBeing[] = [
  'sem_resposta',
  'precisa_ajuda',
  'pra_baixo',
  'seguindo',
  'bem',
  'muito_bem',
]

const PRESENCA: GcIntent[] = ['vem', 'nao_vem', 'nao_sabe']

const schema = z.object({
  wellBeing: z.enum(['sem_resposta', 'precisa_ajuda', 'pra_baixo', 'seguindo', 'bem', 'muito_bem'], {
    message: 'Diga como a pessoa está.',
  }),
  comingToGc: z.enum(['vem', 'nao_vem', 'nao_sabe']).optional(),
  channel: z.enum(['whatsapp', 'call', 'in_person', 'message', 'video', 'other']),
  contactedOn: z.string().min(1, 'Informe a data do contato.'),
  feedback: z.string().max(1500, 'Texto muito longo.').optional(),
})

type FormValues = z.infer<typeof schema>

/**
 * Registro do contato da semana.
 *
 * Três toques: como a pessoa está, se vem ao GC, e salvar. O nível de atenção
 * sai da primeira resposta - não é uma segunda pergunta. O resto (canal, data,
 * uma anotação) fica recolhido, para quem precisar.
 *
 * O feedback nunca aparece para a pessoa cuidada.
 */
export function ContactDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: AssignmentWithPeople | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && assignment && (
          <ContactBody assignment={assignment} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ContactBody({
  assignment,
  onClose,
}: {
  assignment: AssignmentWithPeople
  onClose: () => void
}) {
  const log = useLogContact()
  const [detalhes, setDetalhes] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      channel: 'whatsapp',
      contactedOn: todayISO(),
      feedback: '',
    },
  })

  const wellBeing = useWatch({ control: form.control, name: 'wellBeing' })

  const onSubmit = form.handleSubmit(async (values) => {
    await log.mutateAsync({
      assignmentId: assignment.id,
      channel: values.channel,
      wellBeing: values.wellBeing,
      comingToGc: values.comingToGc ?? null,
      contactedOn: values.contactedOn,
      feedback: values.feedback?.trim() || null,
    })
    onClose()
  })

  const primeiroNome = comoChamar(assignment.cared_for)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Como foi com {primeiroNome}?</DialogTitle>
        <DialogDescription>Dois toques e está registrado.</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field
          label={`Como ${primeiroNome} está nesta semana`}
          required
          error={form.formState.errors.wellBeing?.message}
        >
          <Controller
            control={form.control}
            name="wellBeing"
            render={({ field }) => (
              <div className="grid gap-2" role="radiogroup" aria-label="Como a pessoa está">
                {ESCALA.map((nivel) => {
                  const escolhido = field.value === nivel
                  return (
                    <button
                      key={nivel}
                      type="button"
                      role="radio"
                      aria-checked={escolhido}
                      onClick={() => field.onChange(nivel)}
                      className={cn(
                        'flex min-h-12 items-baseline gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        escolhido
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-secondary',
                      )}
                    >
                      <span className="font-medium">{wellBeingLabel[nivel]}</span>
                      <span
                        className={cn(
                          'text-xs',
                          escolhido ? 'text-primary-foreground/70' : 'text-muted-foreground',
                        )}
                      >
                        {wellBeingHint[nivel]}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          />
        </Field>

        <Field label="Ela vem ao GC nesta semana?">
          <Controller
            control={form.control}
            name="comingToGc"
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Vem ao GC">
                {PRESENCA.map((opcao) => {
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

        {wellBeing === 'precisa_ajuda' && (
          <Alert variant="warning">
            <Info aria-hidden />
            <AlertDescription>
              A liderança recebe um aviso agora. Se for urgente, fale direto com um líder.
            </AlertDescription>
          </Alert>
        )}

        {/* O que quase nunca muda fica recolhido: WhatsApp e hoje acertam a
            grande maioria dos registros, e cada campo a menos na tela é um
            registro a mais que acontece. */}
        <div className="border-border rounded-lg border">
          <button
            type="button"
            onClick={() => setDetalhes((v) => !v)}
            className="flex min-h-12 w-full items-center justify-between px-3 py-2 text-sm font-medium"
            aria-expanded={detalhes}
          >
            Detalhes e anotação
            <ChevronDown
              className={cn('size-4 transition-transform', detalhes && 'rotate-180')}
              aria-hidden
            />
          </button>

          {detalhes && (
            <div className="space-y-4 border-t p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Por onde falou">
                  <Controller
                    control={form.control}
                    name="channel"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Canal do contato">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CHANNELS.map((channel) => (
                            <SelectItem key={channel} value={channel}>
                              {channelLabel[channel]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                <Field label="Quando" error={form.formState.errors.contactedOn?.message}>
                  <Input type="date" max={todayISO()} {...form.register('contactedOn')} />
                </Field>
              </div>

              <Field
                label="Anotação"
                hint={FEEDBACK_PRIVACY_HINT}
                error={form.formState.errors.feedback?.message}
              >
                <Textarea
                  rows={3}
                  placeholder="Algo que a liderança precise saber. Opcional."
                  {...form.register('feedback')}
                />
              </Field>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Registrar contato
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
