import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Flame, TrendingUp } from 'lucide-react'
import { db } from '@/lib/db'
import { formatWeekRange } from '@/lib/date'
import { gcIntentLabel, wellBeingLabel } from '@/lib/labels'
import type { GcIntent, WellBeing } from '@/types/database'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Relatorio {
  semanas: {
    inicio: string
    fim: string
    situacao: string
    combinados: number
    feitos: number
    semContato: number
    precisamDaLideranca: number
  }[]
  comoEstao: Partial<Record<WellBeing | 'sem_registro', number>>
  presenca: Partial<Record<GcIntent | 'sem_resposta', number>>
  cuidadores: {
    id: string
    nome: string
    papel: string
    semanasSeguidas: number
    registrosNoPeriodo: number
  }[]
  semContatoHaMais: { id: string; nome: string; ultimoContato: string | null }[]
  geradoEm: string
}

const PERIODOS = [4, 8, 12] as const

/**
 * O relatório do GC, para liderança e supervisão.
 *
 * Ele não inventa dado: junta o que o registro de contato já produz. E não traz
 * ranking de pessoas — a medida de quem cuida é constância, não volume. Um
 * pódio aqui transformaria cuidado pastoral em competição, e quem ficasse em
 * último seria justamente quem mais precisa de apoio.
 */
export function ReportsPage() {
  const [semanas, setSemanas] = React.useState<number>(8)

  const relatorio = useQuery({
    queryKey: ['relatorio', semanas],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('relatorio_gc', { p_semanas: semanas })
      if (error) throw error
      return data as unknown as Relatorio
    },
  })

  const dados = relatorio.data

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relatórios"
        description="Como o GC está indo, pelas semanas que já passaram."
      />

      <Tabs value={String(semanas)} onValueChange={(v) => setSemanas(Number(v))}>
        <TabsList>
          {PERIODOS.map((p) => (
            <TabsTrigger key={p} value={String(p)}>
              {p} semanas
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {relatorio.isLoading && <CardListSkeleton rows={3} />}
      {relatorio.isError && (
        <ErrorState error={relatorio.error} onRetry={() => relatorio.refetch()} />
      )}

      {dados && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Semana a semana</CardTitle>
              <CardDescription>Combinado, feito, e quem ficou sem contato.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dados.semanas.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Nenhuma semana publicada ainda. O relatório se enche sozinho a partir daqui.
                </p>
              )}

              {dados.semanas.map((semana) => {
                const proporcao = semana.combinados
                  ? (semana.feitos / semana.combinados) * 100
                  : 0
                return (
                  <div key={semana.inicio}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {formatWeekRange(semana.inicio, semana.fim)}
                      </span>
                      <span className="text-muted-foreground text-sm tabular">
                        {semana.feitos} de {semana.combinados}
                        {semana.semContato > 0 && ` · ${semana.semContato} sem contato`}
                      </span>
                    </div>
                    <Progress value={proporcao} />
                    {semana.precisamDaLideranca > 0 && (
                      <p className="text-destructive mt-1 flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        {semana.precisamDaLideranca} pediram a liderança
                      </p>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Como o GC esteve</CardTitle>
                <CardDescription>Pelo que os cuidadores registraram no período.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(dados.comoEstao).length === 0 && (
                  <p className="text-muted-foreground text-sm">Ainda sem registros no período.</p>
                )}
                {Object.entries(dados.comoEstao).map(([nivel, quantos]) => (
                  <div key={nivel} className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {nivel === 'sem_registro'
                        ? 'Sem registro'
                        : wellBeingLabel[nivel as WellBeing]}
                    </span>
                    <Badge variant="neutral">{quantos}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Presença desta semana</CardTitle>
                <CardDescription>O que as pessoas disseram sobre vir ao GC.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(dados.presenca).length === 0 && (
                  <p className="text-muted-foreground text-sm">Ainda sem respostas nesta semana.</p>
                )}
                {Object.entries(dados.presenca).map(([intencao, quantos]) => (
                  <div key={intencao} className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {intencao === 'sem_resposta'
                        ? 'Não perguntado'
                        : gcIntentLabel[intencao as GcIntent]}
                    </span>
                    <Badge variant="neutral">{quantos}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quem cuida</CardTitle>
              <CardDescription>
                Semanas seguidas sem deixar ninguém sem contato — constância, não volume.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {dados.cuidadores.map((pessoa) => (
                <div key={pessoa.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{pessoa.nome}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground text-xs tabular">
                      {pessoa.registrosNoPeriodo} registro(s)
                    </span>
                    {pessoa.semanasSeguidas > 0 && (
                      <Badge variant="success" className="gap-1">
                        <Flame className="size-3" aria-hidden />
                        {pessoa.semanasSeguidas}
                      </Badge>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Há mais tempo sem contato</CardTitle>
              <CardDescription>
                Duas semanas ou mais. É a lista que existe para ninguém ficar de fora.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dados.semContatoHaMais.length === 0 ? (
                <p className="flex items-center gap-2 text-sm">
                  <TrendingUp className="text-success size-4" aria-hidden />
                  Ninguém está há mais de duas semanas sem contato.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {dados.semContatoHaMais.map((pessoa) => (
                    <li key={pessoa.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{pessoa.nome}</span>
                      <span className="text-muted-foreground text-xs">
                        {pessoa.ultimoContato ? `desde ${pessoa.ultimoContato}` : 'nunca'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
