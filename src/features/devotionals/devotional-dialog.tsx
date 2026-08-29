import * as React from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, Save } from 'lucide-react'
import { devotionalAudienceLabel } from '@/lib/labels'
import type { DevotionalAudience } from '@/types/database'
import { useAuthors, useDevotional, useSaveDevotional } from './use-devotionals'
import { lerDevocional, tempoDeLeitura } from './texto'
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

const ALCANCES: DevotionalAudience[] = ['todos', 'lideranca_discipulos', 'lideranca']

const schema = z.object({
  authorId: z.string().min(1, 'Escolha quem assina.'),
  titulo: z.string().trim().min(3, 'Dê um título ao devocional.'),
  corpo: z.string().trim().min(10, 'Cole o texto do devocional.'),
  alcance: z.enum(['todos', 'lideranca_discipulos', 'lideranca']),
})

type Valores = z.infer<typeof schema>

/**
 * Escrever é um gesto; publicar é outro.
 *
 * Aqui só se salva rascunho. O aviso sai na tela de leitura, atrás de uma
 * confirmação que diz o que vai acontecer — porque um push alcança dezenas de
 * celulares e não tem como voltar atrás.
 */
export function DevotionalDialog({
  devotionalId,
  open,
  onOpenChange,
}: {
  devotionalId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const autores = useAuthors()
  const existente = useDevotional(open && devotionalId ? devotionalId : undefined)
  const salvar = useSaveDevotional()
  const [conferindo, setConferindo] = React.useState(false)

  const ativos = (autores.data ?? []).filter(
    (autor) => autor.active || autor.id === existente.data?.autorId,
  )

  const form = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { authorId: '', titulo: '', corpo: '', alcance: 'todos' },
  })

  // A chave em quem monta este diálogo já remonta o formulário a cada alvo:
  // aqui só cuidamos de preencher os campos quando o texto chega.
  React.useEffect(() => {
    if (!open) return

    if (!devotionalId) {
      form.reset({
        authorId: ativos[0]?.id ?? '',
        titulo: '',
        corpo: '',
        alcance: 'todos',
      })
      return
    }

    // O corpo não vem na lista - é buscado aqui, e o formulário só nasce
    // quando ele chega. Sem isso, salvar uma edição apagaria o texto.
    if (existente.data) {
      form.reset({
        authorId: existente.data.autorId,
        titulo: existente.data.titulo,
        corpo: existente.data.corpo,
        alcance: existente.data.alcance,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, devotionalId, existente.data])

  const corpo = useWatch({ control: form.control, name: 'corpo' })
  const carregando = Boolean(devotionalId) && existente.isLoading

  const enviar = form.handleSubmit(async (valores) => {
    await salvar.mutateAsync({
      id: devotionalId,
      authorId: valores.authorId,
      titulo: valores.titulo,
      corpo: valores.corpo,
      alcance: valores.alcance,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{devotionalId ? 'Editar devocional' : 'Novo devocional'}</DialogTitle>
          <DialogDescription>
            Cole o texto como ele chegou. Linha em branco separa parágrafos, e{' '}
            <code className="text-foreground">*asteriscos*</code> viram negrito — igual ao WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <p className="text-muted-foreground py-6 text-sm">Carregando o texto…</p>
        ) : (
          <form onSubmit={enviar} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quem assina" required error={form.formState.errors.authorId?.message}>
                <Controller
                  control={form.control}
                  name="authorId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Quem assina">
                        <SelectValue placeholder="Escolha o autor" />
                      </SelectTrigger>
                      <SelectContent>
                        {ativos.map((autor) => (
                          <SelectItem key={autor.id} value={autor.id}>
                            {[autor.title, autor.name].filter(Boolean).join(' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field label="Quem recebe" required hint="Decide quem vê e quem é avisado.">
                <Controller
                  control={form.control}
                  name="alcance"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Quem recebe">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALCANCES.map((alcance) => (
                          <SelectItem key={alcance} value={alcance}>
                            {devotionalAudienceLabel[alcance]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field
              label="Título"
              htmlFor="titulo"
              required
              hint="É o que aparece embaixo do aviso, na tela de bloqueio."
              error={form.formState.errors.titulo?.message}
            >
              <Input
                id="titulo"
                placeholder="Ex.: A fidelidade que não faz barulho"
                {...form.register('titulo')}
              />
            </Field>

            <Field
              label="Texto"
              htmlFor="corpo"
              required
              hint={
                corpo?.trim()
                  ? `${lerDevocional(corpo).length} parágrafo(s) · ${tempoDeLeitura(corpo)} min de leitura`
                  : undefined
              }
              error={form.formState.errors.corpo?.message}
            >
              <Textarea id="corpo" rows={12} className="font-sans" {...form.register('corpo')} />
            </Field>

            {conferindo && corpo?.trim() && (
              <div className="bg-secondary/50 max-h-72 space-y-3 overflow-y-auto rounded-lg border p-4 text-[15px] leading-relaxed">
                {lerDevocional(corpo).map((paragrafo, indice) => (
                  <p key={indice} className="text-pretty">
                    {paragrafo.map((linha, ordem) => (
                      <span key={ordem}>
                        {ordem > 0 && <br />}
                        {linha.map((trecho, posicao) => (
                          <span
                            key={posicao}
                            className={[
                              trecho.forte ? 'font-semibold' : '',
                              trecho.enfase ? 'italic' : '',
                            ].join(' ')}
                          >
                            {trecho.texto}
                          </span>
                        ))}
                      </span>
                    ))}
                  </p>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConferindo((antes) => !antes)}
                disabled={!corpo?.trim()}
              >
                <Eye aria-hidden />
                {conferindo ? 'Esconder' : 'Conferir'}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={salvar.isPending}>
                <Save aria-hidden />
                Salvar rascunho
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
