import { useQuery } from '@tanstack/react-query'
import { Flame } from 'lucide-react'
import { db } from '@/lib/db'
import type { MeuPerfil } from '@/types/database'

/**
 * Semanas seguidas sem deixar ninguém sem contato.
 *
 * A única medida "de jogo" que este produto tem — e de propósito.
 *
 * Pontuar volume de cuidado transformaria pessoas em números: quem cuida de
 * seis irmãos ganharia de quem cuida de dois, ainda que os dois estejam
 * fazendo exatamente o combinado. Pior: premiar registro incentiva registrar,
 * não cuidar. Constância não tem esse defeito — ninguém consegue "fazer mais"
 * do que aparecer toda semana, e é isso que sustenta um GC.
 *
 * Aparece só quando há sequência: começar do zero toda semana desanima, e um
 * contador em branco não é neutro — cobra.
 */
export function Constancia() {
  const perfil = useQuery({
    queryKey: ['meu-perfil'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('meu_perfil')
      if (error) throw error
      return data as unknown as MeuPerfil
    },
  })

  const semanas = perfil.data?.historico.semanasSeguidas ?? 0
  if (semanas < 1) return null

  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      <Flame className="text-primary size-4" aria-hidden />
      {semanas === 1
        ? 'Uma semana seguida sem deixar ninguém sem contato.'
        : `${semanas} semanas seguidas sem deixar ninguém sem contato.`}
    </p>
  )
}
