import { useQuery } from '@tanstack/react-query'
import { Flame, HeartHandshake, Users } from 'lucide-react'
import { db } from '@/lib/db'
import type { MeuPerfil } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

/**
 * Os números da própria pessoa.
 *
 * Nunca um ranking: comparar pessoas em cuidado pastoral transformaria em
 * competição o que precisa ser constância — e quem está em último lugar numa
 * lista de cuidado é a última pessoa que deveria se sentir assim.
 *
 * Por isso a medida principal é **semanas seguidas** sem deixar ninguém sem
 * contato. Quem cuida de duas pessoas toda semana está fazendo o combinado
 * tanto quanto quem cuida de seis.
 */
export function MeusNumeros() {
  const perfil = useQuery({
    queryKey: ['meu-perfil'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('meu_perfil')
      if (error) throw error
      return data as unknown as MeuPerfil
    },
  })

  if (!perfil.data) return null

  const { grupo, semana, historico } = perfil.data
  const faltam = Math.max(0, semana.total - semana.feitos)

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4 p-4">
        {grupo.nome && (
          <div>
            <p className="font-medium">{grupo.nome}</p>
            {grupo.lideres.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Liderança: {grupo.lideres.join(' e ')}
              </p>
            )}
          </div>
        )}

        {semana.total > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-medium">Sua semana</span>
              <span className="text-muted-foreground text-sm tabular">
                {semana.feitos} de {semana.total}
                {faltam > 0 && ` · faltam ${faltam}`}
              </span>
            </div>
            <Progress value={semana.total ? (semana.feitos / semana.total) * 100 : 0} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 pt-1">
          <Numero
            icone={Flame}
            valor={historico.semanasSeguidas}
            rotulo={historico.semanasSeguidas === 1 ? 'semana seguida' : 'semanas seguidas'}
            destaque
          />
          <Numero
            icone={HeartHandshake}
            valor={historico.cuidadosRegistrados}
            rotulo="cuidados registrados"
          />
          <Numero icone={Users} valor={historico.pessoasCuidadas} rotulo="pessoas cuidadas" />
        </div>

        {historico.semanasSeguidas >= 2 && (
          <p className="text-muted-foreground text-sm text-pretty">
            {historico.semanasSeguidas} semanas seguidas sem deixar ninguém sem contato. É disso
            que o GC vive.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Numero({
  icone: Icone,
  valor,
  rotulo,
  destaque,
}: {
  icone: typeof Flame
  valor: number
  rotulo: string
  destaque?: boolean
}) {
  return (
    <div className="text-center">
      <Icone
        className={`mx-auto mb-1 size-4 ${destaque ? 'text-primary' : 'text-muted-foreground'}`}
        aria-hidden
      />
      <p className="font-display text-2xl font-bold tabular">{valor}</p>
      <p className="text-muted-foreground text-xs text-pretty">{rotulo}</p>
    </div>
  )
}
