import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FileText, ImagePlus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from '@/features/auth/session-context'
import { formatDate, weekdayName } from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TalkCard } from '@/types/database'
import {
  lerNomeDoPdf,
  linkDoSpotify,
  linkDoYoutube,
  playlistDoYoutubeIncompleta,
  proximoDiaDeGc,
  tamanhoLegivel,
} from './talk-texto'
import {
  apagarArquivo,
  arquivoUrl,
  enviarArquivo,
  prepararArte,
  useChaveDeArquivos,
  useSalvarTalk,
  useTalk,
} from './use-talks'

const PDF_MAXIMO = 25 * 1024 * 1024

const schema = z.object({
  numero: z.string().trim().regex(/^\d*$/, 'Só o número do tema.'),
  tema: z.string().trim().min(3, 'Qual é o tema do talk?'),
  serie: z.string().trim(),
  semanaDe: z.string().min(10, 'Para qual GC é este talk?'),
  spotifyUrl: z
    .string()
    .trim()
    .refine((v) => !v || linkDoSpotify(v), 'Cole o link do Spotify (open.spotify.com/…).'),
  youtubeUrl: z
    .string()
    .trim()
    .refine((v) => !v || linkDoYoutube(v), 'Cole o link do YouTube (youtube.com/…).'),
  mensagem: z.string().trim(),
})

type Valores = z.infer<typeof schema>

/**
 * O talk da semana, do jeito que ele chega: um PDF, uma arte e duas playlists.
 *
 * Escolher o PDF já preenche o tema — o nome do arquivo que a igreja manda traz
 * "TEMA 8 - ALEGRIA COMO…", e digitar de novo o que já está escrito é o tipo
 * de atrito que faz alguém desistir de subir o material. Salvar não avisa
 * ninguém: publicar é outro gesto, na tela do talk.
 */
export function TalkDialog({
  talkId,
  open,
  onOpenChange,
  ultimo,
  onSalvo,
}: {
  talkId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** O talk mais recente: a série costuma ser a mesma por semanas. */
  ultimo?: TalkCard
  onSalvo: (id: string) => void
}) {
  const { group } = useSession()
  const queryClient = useQueryClient()
  const existente = useTalk(open && talkId ? talkId : undefined)
  const salvar = useSalvarTalk()
  const chave = useChaveDeArquivos(open && Boolean(talkId))

  const [pdf, setPdf] = React.useState<File | null>(null)
  const [arte, setArte] = React.useState<File | null>(null)
  const [removerArte, setRemoverArte] = React.useState(false)
  const [etapa, setEtapa] = React.useState<string | null>(null)
  const [previa, setPrevia] = React.useState<string | null>(null)
  // Se o talk novo foi salvo e só o arquivo falhou, a segunda tentativa
  // continua o mesmo talk em vez de criar outro igual.
  const [criadoId, setCriadoId] = React.useState<string | null>(null)

  const diaDoGc = group?.meeting_weekday ?? 4

  const form = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: {
      numero: '',
      tema: '',
      serie: ultimo?.serie ?? '',
      semanaDe: proximoDiaDeGc(diaDoGc),
      spotifyUrl: '',
      youtubeUrl: '',
      mensagem: '',
    },
  })

  // Quem monta este diálogo troca a chave a cada alvo: aqui só esperamos o
  // talk existente chegar para preencher.
  React.useEffect(() => {
    if (!existente.data) return
    const t = existente.data
    form.reset({
      numero: t.numero ? String(t.numero) : '',
      tema: t.tema,
      serie: t.serie ?? '',
      semanaDe: t.semanaDe,
      spotifyUrl: t.spotifyUrl ?? '',
      youtubeUrl: t.youtubeUrl ?? '',
      mensagem: t.mensagem ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existente.data])

  // A prévia nasce no toque que escolhe a arte, e o endereço temporário é
  // devolvido quando ela é trocada ou quando o diálogo fecha.
  const trocarArte = (arquivo: File | null) => {
    setArte(arquivo)
    setPrevia(arquivo ? URL.createObjectURL(arquivo) : null)
  }
  React.useEffect(
    () => () => {
      if (previa) URL.revokeObjectURL(previa)
    },
    [previa],
  )

  const semanaDe = useWatch({ control: form.control, name: 'semanaDe' })
  const youtubeUrl = useWatch({ control: form.control, name: 'youtubeUrl' })

  const escolherPdf = (arquivo: File | undefined) => {
    if (!arquivo) return
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Escolha o talk em PDF.')
      return
    }
    if (arquivo.size > PDF_MAXIMO) {
      toast.error('O PDF passa de 25 MB. Peça uma versão menor.')
      return
    }
    setPdf(arquivo)

    const lido = lerNomeDoPdf(arquivo.name)
    if (lido.tema && !form.getValues('tema').trim()) {
      form.setValue('tema', lido.tema, { shouldValidate: true })
      if (lido.numero && !form.getValues('numero')) form.setValue('numero', String(lido.numero))
    }
  }

  const atual = existente.data
  const pdfAtual = atual?.arquivos.pdf
  const arteAtual = atual?.arquivos.arte && !removerArte ? atual.arquivos.arte : null
  const carregando = Boolean(talkId) && existente.isLoading
  const enviando = salvar.isPending || etapa !== null

  const enviar = form.handleSubmit(async (valores) => {
    // Erro ao salvar o texto já vira aviso pelo tratamento geral das mutações;
    // daqui só sai o aviso de arquivo.
    let salvou = false
    try {
      const id = await salvar.mutateAsync({
        id: talkId ?? criadoId,
        numero: valores.numero ? Number(valores.numero) : null,
        tema: valores.tema,
        serie: valores.serie,
        semanaDe: valores.semanaDe,
        mensagem: valores.mensagem,
        spotifyUrl: valores.spotifyUrl,
        youtubeUrl: valores.youtubeUrl,
      })
      salvou = true
      if (!talkId) setCriadoId(id)

      if (pdf) {
        setEtapa(`Enviando o PDF (${tamanhoLegivel(pdf.size)})…`)
        // Alguns celulares entregam PDF sem tipo; o servidor confere os bytes.
        const corpo = pdf.type ? pdf : new Blob([pdf], { type: 'application/pdf' })
        await enviarArquivo(id, 'pdf', corpo, pdf.name)
      }

      if (arte) {
        setEtapa('Preparando a arte…')
        const preparada = await prepararArte(arte)
        setEtapa('Enviando a arte…')
        await enviarArquivo(id, 'arte', preparada.arte, arte.name.replace(/\.\w+$/, '.jpg'))
        await enviarArquivo(id, 'capa', preparada.capa)
      } else if (removerArte && atual?.arquivos.arte) {
        await apagarArquivo(id, 'arte')
      }

      queryClient.invalidateQueries({ queryKey: ['talks'] })
      queryClient.invalidateQueries({ queryKey: ['talk', id] })
      toast.success(talkId ? 'Talk atualizado.' : 'Rascunho salvo. Confira e publique.')
      onSalvo(id)
    } catch (erro) {
      // O talk pode ter sido salvo e só o arquivo ter falhado: a mensagem diz
      // o que falhou, e o rascunho continua lá para tentar de novo.
      if (salvou) toast.error(friendlyError(erro))
    } finally {
      setEtapa(null)
    }
  })

  return (
    <Dialog open={open} onOpenChange={(aberto) => !enviando && onOpenChange(aberto)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{talkId ? 'Editar talk' : 'Novo talk'}</DialogTitle>
          <DialogDescription>
            O material que a igreja mandou para o GC. Só líderes, supervisores e discípulos veem — e
            ninguém é avisado até você publicar.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <p className="text-muted-foreground py-6 text-sm">Carregando o talk…</p>
        ) : (
          <form onSubmit={enviar} className="space-y-4" noValidate>
            {/* ------------------------------------------------ o PDF */}
            <Field
              label="PDF do talk"
              hint={
                pdf
                  ? `${pdf.name} · ${tamanhoLegivel(pdf.size)}`
                  : pdfAtual
                    ? `Atual: ${pdfAtual.nome ?? 'talk.pdf'} · ${tamanhoLegivel(pdfAtual.tamanho)}`
                    : 'Obrigatório para publicar. Escolher o arquivo já preenche o tema.'
              }
            >
              <label className="border-input hover:border-primary/50 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors">
                <FileText className="text-primary size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {pdf ? pdf.name : pdfAtual ? 'Trocar o PDF' : 'Escolher o PDF'}
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(evento) => {
                    escolherPdf(evento.target.files?.[0])
                    evento.target.value = ''
                  }}
                />
              </label>
            </Field>

            <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
              <Field
                label="Tema nº"
                htmlFor="talk-numero"
                error={form.formState.errors.numero?.message}
              >
                <Input
                  id="talk-numero"
                  inputMode="numeric"
                  placeholder="8"
                  {...form.register('numero')}
                />
              </Field>
              <Field
                label="Tema"
                htmlFor="talk-tema"
                required
                error={form.formState.errors.tema?.message}
              >
                <Input
                  id="talk-tema"
                  placeholder="Alegria como combustível da perseverança"
                  {...form.register('tema')}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Série"
                htmlFor="talk-serie"
                hint="Ex.: Série 3 · Alegria — a moeda do Reino"
              >
                <Input id="talk-serie" {...form.register('serie')} />
              </Field>
              <Field
                label="Para o GC de"
                htmlFor="talk-semana"
                required
                hint={
                  semanaDe?.length === 10
                    ? `${weekdayName(semanaDe)}, ${formatDate(semanaDe, 'long')}`
                    : undefined
                }
                error={form.formState.errors.semanaDe?.message}
              >
                <Controller
                  control={form.control}
                  name="semanaDe"
                  render={({ field }) => (
                    <DateInput id="talk-semana" value={field.value} onChange={field.onChange} />
                  )}
                />
              </Field>
            </div>

            {/* ------------------------------------------------ a arte */}
            <Field
              label="Arte"
              hint="A capa do talk no app. Dá para compartilhar no status depois."
            >
              <div className="flex items-center gap-3">
                {(previa || (arteAtual && chave.data && atual)) && (
                  <img
                    src={
                      previa ??
                      arquivoUrl(
                        atual!.id,
                        'capa',
                        chave.data!,
                        atual!.arquivos.capa?.versao ?? arteAtual!.versao,
                      )
                    }
                    alt=""
                    className="bg-secondary h-24 w-14 shrink-0 rounded-md object-cover"
                  />
                )}
                <label className="border-input hover:border-primary/50 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors">
                  <ImagePlus className="text-primary size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {arte ? arte.name : arteAtual ? 'Trocar a arte' : 'Escolher a arte'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(evento) => {
                      const arquivo = evento.target.files?.[0]
                      if (arquivo) {
                        trocarArte(arquivo)
                        setRemoverArte(false)
                      }
                      evento.target.value = ''
                    }}
                  />
                </label>
                {(arte || arteAtual) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Tirar a arte"
                    onClick={() => {
                      trocarArte(null)
                      if (atual?.arquivos.arte) setRemoverArte(true)
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </div>
            </Field>

            {/* ---------------------------------------------- playlists */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Playlist no Spotify"
                htmlFor="talk-spotify"
                error={form.formState.errors.spotifyUrl?.message}
              >
                <Input
                  id="talk-spotify"
                  type="url"
                  inputMode="url"
                  placeholder="https://open.spotify.com/playlist/…"
                  {...form.register('spotifyUrl')}
                />
              </Field>
              <Field
                label="Playlist no YouTube"
                htmlFor="talk-youtube"
                error={form.formState.errors.youtubeUrl?.message}
                hint={
                  youtubeUrl && playlistDoYoutubeIncompleta(youtubeUrl)
                    ? '⚠️ Este link parece cortado — confira se ele abre a playlist.'
                    : undefined
                }
              >
                <Input
                  id="talk-youtube"
                  type="url"
                  inputMode="url"
                  placeholder="https://youtube.com/playlist?list=…"
                  {...form.register('youtubeUrl')}
                />
              </Field>
            </div>

            <Field
              label="Recado para quem conduz"
              htmlFor="talk-mensagem"
              hint="Opcional. Ex.: a dinâmica fica para o fim; atenção à pergunta 3."
            >
              <Textarea id="talk-mensagem" rows={3} {...form.register('mensagem')} />
            </Field>

            <DialogFooter>
              {etapa && (
                <p className="text-muted-foreground mr-auto self-center text-xs">{etapa}</p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={enviando}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={enviando}>
                <Save aria-hidden />
                {talkId ? 'Salvar' : 'Salvar rascunho'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
