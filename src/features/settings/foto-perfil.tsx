import * as React from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { prepararFoto } from '@/lib/foto'
import { friendlyError } from '@/lib/errors'
import { initials } from '@/lib/utils'
import { useUpdateMember } from '@/features/members/use-members'
import type { Profile } from '@/types/database'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

/**
 * Foto de perfil.
 *
 * O navegador reduz a imagem para 128px antes de enviar: uma foto de celular
 * tem 3 MB, e ninguém deveria pagar 4G disso para ver um avatar de 40px numa
 * lista. O que sai daqui tem cerca de 10 KB.
 *
 * Sem foto ficam as iniciais, nunca um boneco genérico — num grupo pequeno, a
 * inicial já identifica, e um ícone de pessoa anônima faz o oposto do que este
 * produto existe para fazer.
 */
export function FotoPerfil({ profile }: { profile: Profile }) {
  const update = useUpdateMember()
  const entrada = React.useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = React.useState(false)

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setOcupado(true)
    try {
      const foto = await prepararFoto(arquivo)
      await update.mutateAsync({ id: profile.id, photo_url: foto })
    } catch (erro) {
      toast.error(friendlyError(erro))
    } finally {
      setOcupado(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {profile.photo_url && <AvatarImage src={profile.photo_url} alt="" />}
        <AvatarFallback className="text-lg">{initials(profile.full_name)}</AvatarFallback>
      </Avatar>

      <div className="flex flex-wrap gap-2">
        {/* `accept="image/*"` deixa o celular oferecer câmera ou galeria — sem
            `capture`, que forçaria a câmera e tiraria a escolha. */}
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          className="sr-only"
          id="foto"
          onChange={(evento) => void escolher(evento.target.files?.[0])}
        />
        {/* `asChild` com `loading` não combina: o botão embrulharia o rótulo
            num fragmento, e o Slot não tem onde pôr a classe. O indicador de
            trabalho fica no ícone. */}
        <Button asChild variant="outline" size="sm">
          <label htmlFor="foto" className="cursor-pointer" aria-busy={ocupado || undefined}>
            {ocupado ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Camera aria-hidden />
            )}
            {profile.photo_url ? 'Trocar foto' : 'Adicionar foto'}
          </label>
        </Button>

        {profile.photo_url && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update.mutate({ id: profile.id, photo_url: null })}
          >
            <Trash2 aria-hidden />
            Remover
          </Button>
        )}
      </div>
    </div>
  )
}
