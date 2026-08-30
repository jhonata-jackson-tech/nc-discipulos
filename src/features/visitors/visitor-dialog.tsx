import * as React from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { todayISO } from '@/lib/date'
import { careGenderLabel, visitorOriginLabel } from '@/lib/labels'
import type { CareGender, VisitorOrigin } from '@/types/database'
import { useActiveMembers } from '@/features/members/use-members'
import { useSaveVisitor, type Visitante } from './use-visitors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

const ORIGENS: VisitorOrigin[] = ['organico', 'gc_center', 'convite', 'outro']

const schema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.'),
  telefone: z.string().optional(),
  email: z.union([z.email('E-mail inválido.'), z.literal('')]),
  nascimento: z.string().optional(),
  generoDeCuidado: z.union([z.enum(['male', 'female']), z.literal('')]),
  origem: z.enum(['organico', 'gc_center', 'convite', 'outro']),
  convidadoPor: z.string().optional(),
  primeiraVisita: z.string().min(1, 'Informe quando ele visitou.'),
  anotacao: z.string().max(1500, 'Texto muito longo.').optional(),
})

type FormValues = z.infer<typeof schema>

/**
 * O cadastro do visitante.
 *
 * Só o nome é obrigatório. Alguém que apareceu hoje na sala raramente deixa
 * telefone, aniversário e gênero de uma vez — e um formulário que exige tudo
 * isso na porta é um formulário que ninguém preenche, o que devolve a
 * liderança ao WhatsApp de onde ela veio.
 */
export function VisitorDialog({
  visitante,
  open,
  onOpenChange,
}: {
  visitante: Visitante | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const salvar = useSaveVisitor()
  const membros = useActiveMembers()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: '',
      telefone: '',
      email: '',
      nascimento: '',
      generoDeCuidado: '',
      origem: 'organico',
      convidadoPor: '',
      primeiraVisita: todayISO(),
      anotacao: '',
    },
  })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      nome: visitante?.nome ?? '',
      telefone: visitante?.telefone ?? '',
      email: visitante?.email ?? '',
      nascimento: visitante?.nascimento ?? '',
      generoDeCuidado: visitante?.generoDeCuidado ?? '',
      origem: visitante?.origem ?? 'organico',
      convidadoPor: '',
      primeiraVisita: visitante?.primeiraVisita ?? todayISO(),
      anotacao: visitante?.anotacao ?? '',
    })
  }, [open, visitante, form])

  const origem = useWatch({ control: form.control, name: 'origem' })

  const onSubmit = form.handleSubmit(async (values) => {
    await salvar.mutateAsync({
      id: visitante?.id ?? null,
      nome: values.nome,
      telefone: values.telefone || null,
      email: values.email || null,
      nascimento: values.nascimento || null,
      generoDeCuidado: (values.generoDeCuidado || null) as CareGender | null,
      origem: values.origem,
      convidadoPor: values.convidadoPor || null,
      primeiraVisita: values.primeiraVisita,
      anotacao: values.anotacao?.trim() || null,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{visitante ? 'Editar visitante' : 'Novo visitante'}</DialogTitle>
          <DialogDescription>
            Ele não entra no rodízio de cuidado — quem acompanha é a liderança, aqui mesmo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            label="Nome"
            htmlFor="visitante-nome"
            required
            error={form.formState.errors.nome?.message}
          >
            <Input id="visitante-nome" {...form.register('nome')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefone" htmlFor="visitante-telefone">
              <Input
                id="visitante-telefone"
                type="tel"
                inputMode="tel"
                {...form.register('telefone')}
              />
            </Field>

            <Field
              label="Quando visitou"
              htmlFor="visitante-visita"
              required
              error={form.formState.errors.primeiraVisita?.message}
            >
              <Input
                id="visitante-visita"
                type="date"
                max={todayISO()}
                {...form.register('primeiraVisita')}
              />
            </Field>
          </div>

          <Field label="Como chegou até nós" required>
            <Controller
              control={form.control}
              name="origem"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Como chegou">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGENS.map((opcao) => (
                      <SelectItem key={opcao} value={opcao}>
                        {visitorOriginLabel[opcao]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {/* Quem trouxe só é perguntado quando alguém trouxe: é o nome que a
              liderança vai usar para pedir ajuda no acompanhamento. */}
          {origem === 'convite' && (
            <Field label="Quem convidou">
              <Controller
                control={form.control}
                name="convidadoPor"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Quem convidou">
                      <SelectValue placeholder="Escolha um integrante" />
                    </SelectTrigger>
                    <SelectContent>
                      {(membros.data ?? []).map((pessoa) => (
                        <SelectItem key={pessoa.id} value={pessoa.id}>
                          {pessoa.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="E-mail"
              htmlFor="visitante-email"
              error={form.formState.errors.email?.message}
            >
              <Input id="visitante-email" type="email" {...form.register('email')} />
            </Field>

            <Field label="Aniversário" htmlFor="visitante-nascimento">
              <Input id="visitante-nascimento" type="date" {...form.register('nascimento')} />
            </Field>
          </div>

          <Field
            label="Gênero de cuidado"
            hint="Opcional agora. Se estiver preenchido, já vai junto quando ele entrar no GC."
          >
            <Controller
              control={form.control}
              name="generoDeCuidado"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {(['male', 'female'] as CareGender[]).map((genero) => (
                    <label
                      key={genero}
                      className="border-input hover:bg-secondary flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                    >
                      <RadioGroupItem value={genero} id={`visitante-genero-${genero}`} />
                      <Label htmlFor={`visitante-genero-${genero}`} className="cursor-pointer">
                        {careGenderLabel[genero]}
                      </Label>
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </Field>

          <Field
            label="Anotação"
            htmlFor="visitante-anotacao"
            hint="O que ajuda a acolher: como chegou, o que contou, com quem ele já fala."
            error={form.formState.errors.anotacao?.message}
          >
            <Textarea id="visitante-anotacao" rows={3} {...form.register('anotacao')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {visitante ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
