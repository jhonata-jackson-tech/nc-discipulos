import { Link } from 'react-router-dom'
import { Cake, Mail, Phone, SlidersHorizontal } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { careGenderLabel, comoChamar, roleLabelFor } from '@/lib/labels'
import { formatDate } from '@/lib/date'
import { initials } from '@/lib/utils'
import { PageHeader } from '@/components/common/page-header'
import { MeusNumeros } from './meus-numeros'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * O perfil: só olhar.
 *
 * Antes esta tela era um formulário chamado "Meus dados", e entrar nela para
 * conferir o próprio telefone significava entrar num formulário. Agora ela
 * mostra — quem é, o que a liderança confirmou, e os números da própria
 * constância. Alterar é outro gesto, e mora em Configurações.
 */
export function ProfilePage() {
  const { profile, role } = useSession()

  if (!profile) return null

  const dados = [
    { icone: Mail, rotulo: 'E-mail', valor: profile.email },
    { icone: Phone, rotulo: 'Telefone', valor: profile.phone },
    {
      icone: Cake,
      rotulo: 'Aniversário',
      valor: profile.birth_date ? formatDate(profile.birth_date, 'long') : null,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Perfil"
        description="Como você aparece para o GC."
        actions={
          <Button asChild variant="outline">
            <Link to="/configuracoes?aba=dados">
              <SlidersHorizontal aria-hidden />
              Editar meus dados
            </Link>
          </Button>
        }
      />

      <Card className="max-w-xl">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              {profile.photo_url && <AvatarImage src={profile.photo_url} alt="" />}
              <AvatarFallback className="text-lg">{initials(profile.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <p className="font-display truncate text-lg font-bold">{profile.full_name}</p>
              {/* O apelido só aparece quando diz algo novo: repetir "Jhonata"
                  embaixo de "Jhonata" é ruído. */}
              {comoChamar(profile) !== profile.full_name && (
                <p className="text-muted-foreground text-sm">No GC, {comoChamar(profile)}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {role && <Badge variant="neutral">{roleLabelFor(role, profile.care_gender)}</Badge>}
                {profile.care_gender && (
                  <Badge variant="outline">{careGenderLabel[profile.care_gender]}</Badge>
                )}
              </div>
            </div>
          </div>

          <dl className="divide-border divide-y border-t pt-1">
            {dados.map((linha) => (
              <div key={linha.rotulo} className="flex items-center gap-3 py-2.5">
                <linha.icone className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <dt className="text-muted-foreground w-28 shrink-0 text-sm">{linha.rotulo}</dt>
                <dd className="min-w-0 flex-1 truncate text-sm">
                  {linha.valor ?? (
                    <span className="text-muted-foreground italic">não informado</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <MeusNumeros />
    </div>
  )
}
