import * as React from 'react'
import { Cake, ClipboardPaste, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { todayISO } from '@/lib/date'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Aniversariante } from '@/types/database'
import { AniversarianteDialog } from './aniversariante-dialog'
import { ImportarDialog } from './importar-dialog'
import { DataDoAniversario } from './data-do-aniversario'
import { diasAte, MESES, quando } from './lista'
import { useAniversariantes, useApagarAniversariante } from './use-aniversariantes'

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * A lista de aniversariantes do GC.
 *
 * Abre no mês de agora, e não em janeiro: quem entra aqui quer saber quem vem
 * por aí. Líderes, supervisores e discípulos cuidam da lista; os outros veem.
 */
export function AniversariantesPage() {
  const { role } = useSession()
  const cuida = role === 'leader' || role === 'supervisor' || role === 'disciple'
  const lista = useAniversariantes()
  const apagar = useApagarAniversariante()

  const [busca, setBusca] = React.useState('')
  const [editando, setEditando] = React.useState<{ item: Aniversariante | null } | null>(null)
  const [colando, setColando] = React.useState(false)

  const hoje = todayISO()
  const mesAtual = Number(hoje.slice(5, 7))
  const todos = lista.data ?? []

  const filtrados = busca.trim()
    ? todos.filter((a) =>
        semAcento(`${a.nome} ${a.observacao ?? ''}`).includes(semAcento(busca.trim())),
      )
    : todos

  const proximos = todos
    .map((a) => ({ ...a, dias: diasAte(a.dia, a.mes, hoje) }))
    .filter((a) => a.dias <= 30)
    .sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome))

  // Do mês de agora até o anterior, dando a volta no ano.
  const ordemDosMeses = Array.from({ length: 12 }, (_, i) => ((mesAtual - 1 + i) % 12) + 1)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aniversariantes"
        description="No dia, líderes e discípulos recebem um aviso às 8h para lembrar o GC."
        actions={
          cuida ? (
            <>
              <Button variant="outline" onClick={() => setColando(true)}>
                <ClipboardPaste aria-hidden />
                Colar lista
              </Button>
              <Button onClick={() => setEditando({ item: null })}>
                <Plus aria-hidden />
                Novo
              </Button>
            </>
          ) : undefined
        }
      />

      {lista.isLoading && <CardListSkeleton rows={3} />}
      {lista.isError && <ErrorState error={lista.error} onRetry={() => lista.refetch()} />}

      {lista.isSuccess && todos.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Cake}
              title="A lista está vazia"
              description={
                cuida
                  ? 'Cole a lista que circula no WhatsApp e confira antes de incluir.'
                  : 'Quando a liderança montar a lista, os aniversários aparecem aqui.'
              }
              action={
                cuida ? (
                  <Button onClick={() => setColando(true)}>
                    <ClipboardPaste aria-hidden />
                    Colar lista
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {proximos.length > 0 && !busca && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="text-primary size-[18px]" aria-hidden />
              Próximos 30 dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y">
              {proximos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <DataDoAniversario dia={a.dia} mes={a.mes} destaque={a.dias === 0} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.nome}</p>
                    {a.observacao && (
                      <p className="text-muted-foreground truncate text-xs">{a.observacao}</p>
                    )}
                  </div>
                  <Badge variant={a.dias === 0 ? 'success' : a.dias <= 7 ? 'info' : 'neutral'}>
                    {quando(a.dias)}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {todos.length > 0 && (
        <section aria-labelledby="lista-completa" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="lista-completa" className="font-display text-lg font-semibold">
              Lista completa · {todos.length}
            </h2>
            <div className="relative w-full sm:w-64">
              <Search
                className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nome"
                className="pl-9"
                aria-label="Buscar aniversariante"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {ordemDosMeses.map((mes) => {
              const doMes = filtrados.filter((a) => a.mes === mes)
              if (busca && doMes.length === 0) return null
              return (
                <Card key={mes}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>
                        {MESES[mes - 1]}
                        {mes === mesAtual && (
                          <span className="text-muted-foreground ml-2 text-xs font-normal">
                            este mês
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {doMes.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {doMes.length === 0 ? (
                      <p className="text-muted-foreground text-sm">Ninguém neste mês.</p>
                    ) : (
                      <ul className="divide-border divide-y">
                        {doMes.map((a) => (
                          <li key={a.id} className="flex items-center gap-3 py-1.5">
                            <span className="tabular text-muted-foreground w-6 text-sm">
                              {String(a.dia).padStart(2, '0')}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{a.nome}</p>
                              {a.observacao && (
                                <p className="text-muted-foreground truncate text-xs">
                                  {a.observacao}
                                </p>
                              )}
                            </div>
                            {cuida && (
                              <span className="flex shrink-0 items-center">
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Editar ${a.nome}`}
                                  onClick={() => setEditando({ item: a })}
                                >
                                  <Pencil aria-hidden />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      className="text-destructive"
                                      aria-label={`Remover ${a.nome}`}
                                    >
                                      <Trash2 aria-hidden />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogTitle>Remover {a.nome}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      O aniversário de {String(a.dia).padStart(2, '0')}/
                                      {String(a.mes).padStart(2, '0')} sai da lista e deixa de gerar
                                      aviso.
                                    </AlertDialogDescription>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => apagar.mutate(a.id)}>
                                        Remover
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {cuida && editando && (
        <AniversarianteDialog
          key={editando.item?.id ?? 'novo'}
          aniversariante={editando.item}
          open
          onOpenChange={(aberto) => !aberto && setEditando(null)}
        />
      )}
      {cuida && colando && <ImportarDialog open onOpenChange={setColando} existentes={todos} />}
    </div>
  )
}
