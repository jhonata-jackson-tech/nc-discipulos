import * as React from 'react'
import { Camera, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { prepararFoto } from '@/lib/foto'
import { friendlyError } from '@/lib/errors'
import { initials } from '@/lib/utils'
import type { DevotionalAuthor } from '@/types/database'
import { useAuthors, useSaveAuthor } from './use-devotionals'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** O retrato aparece a 48px no cabeçalho do texto: 128px ficaria borrado. */
const LADO_RETRATO = 192

/**
 * Quem pode assinar um devocional.
 *
 * Hoje é o pastor. Amanhã pode ser outra pessoa, e não deveria ser preciso
 * mexer no código para isso — por isso autor é uma entidade própria, e não um
 * integrante do GC (o pastor não está no cadastro, e não precisa estar).
 */
export function AuthorsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const autores = useAuthors()
  const [editando, setEditando] = React.useState<DevotionalAuthor | 'novo' | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quem assina os devocionais</DialogTitle>
          <DialogDescription>
            O nome e o retrato que aparecem no texto — e no aviso: “Pastor Felipe Mendes te mandou
            uma mensagem”.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {editando ? (
            <AuthorForm
              autor={editando === 'novo' ? null : editando}
              onPronto={() => setEditando(null)}
            />
          ) : (
            <div className="space-y-2">
              <ul className="divide-border divide-y">
                {(autores.data ?? []).map((autor) => (
                  <li key={autor.id} className="flex items-center gap-3 py-2.5">
                    <Avatar className="size-10">
                      {autor.photo_url && <AvatarImage src={autor.photo_url} alt="" />}
                      <AvatarFallback>{initials(autor.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-medium">
                        {[autor.title, autor.name].filter(Boolean).join(' ')}
                      </span>
                      {!autor.active && (
                        <span className="text-muted-foreground block text-xs">
                          não aparece mais na lista
                        </span>
                      )}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setEditando(autor)}>
                      Editar
                    </Button>
                  </li>
                ))}
              </ul>

              <Button variant="outline" onClick={() => setEditando('novo')}>
                <Plus aria-hidden />
                Novo autor
              </Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function AuthorForm({ autor, onPronto }: { autor: DevotionalAuthor | null; onPronto: () => void }) {
  const salvar = useSaveAuthor()
  const entrada = React.useRef<HTMLInputElement>(null)
  const [nome, setNome] = React.useState(autor?.name ?? '')
  const [titulo, setTitulo] = React.useState(autor?.title ?? '')
  const [ativo, setAtivo] = React.useState(autor?.active ?? true)
  // `undefined` = não mexeu; `''` = apagar; string = trocar.
  const [foto, setFoto] = React.useState<string | undefined>(undefined)
  const [ocupado, setOcupado] = React.useState(false)

  const retratoAtual = foto === undefined ? (autor?.photo_url ?? null) : foto || null

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setOcupado(true)
    try {
      setFoto(await prepararFoto(arquivo, LADO_RETRATO))
    } catch (erro) {
      toast.error(friendlyError(erro))
    } finally {
      setOcupado(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const enviar = async () => {
    await salvar.mutateAsync({
      id: autor?.id ?? null,
      name: nome,
      title: titulo,
      photoUrl: foto,
      active: ativo,
    })
    onPronto()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {retratoAtual && <AvatarImage src={retratoAtual} alt="" />}
          <AvatarFallback className="text-lg">{initials(nome || '?')}</AvatarFallback>
        </Avatar>

        <div className="flex flex-wrap gap-2">
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            className="sr-only"
            id="foto-autor"
            onChange={(evento) => void escolher(evento.target.files?.[0])}
          />
          <Button asChild variant="outline" size="sm" disabled={ocupado}>
            <label htmlFor="foto-autor" className="cursor-pointer">
              {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
              {retratoAtual ? 'Trocar retrato' : 'Adicionar retrato'}
            </label>
          </Button>
          {retratoAtual && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setFoto('')}
            >
              <Trash2 aria-hidden />
              Remover
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Como chamar" htmlFor="titulo-autor" hint="Pastor, Pastora…">
          <Input
            id="titulo-autor"
            value={titulo}
            onChange={(evento) => setTitulo(evento.target.value)}
            placeholder="Pastor"
          />
        </Field>

        <Field label="Nome" htmlFor="nome-autor" required>
          <Input
            id="nome-autor"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Felipe Mendes"
          />
        </Field>
      </div>

      {autor && (
        <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <Label htmlFor="autor-ativo" className="cursor-pointer">
              Continua na lista
            </Label>
            <p className="text-muted-foreground text-xs text-pretty">
              Desligado, ele some das opções — mas os devocionais que já assinou continuam
              assinados.
            </p>
          </div>
          <Switch id="autor-ativo" checked={ativo} onCheckedChange={setAtivo} />
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onPronto}>
          Voltar
        </Button>
        <Button onClick={enviar} loading={salvar.isPending} disabled={nome.trim().length < 2}>
          Salvar autor
        </Button>
      </DialogFooter>
    </div>
  )
}
