import { Link } from 'react-router-dom'
import { Cake, ChevronRight, PartyPopper } from 'lucide-react'
import { todayISO } from '@/lib/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataDoAniversario } from './data-do-aniversario'
import { diasAte, quando } from './lista'
import { useAniversariantes } from './use-aniversariantes'

/**
 * O aniversariante do dia, no início do app.
 *
 * Hoje vem em destaque, com o nome grande: é o lembrete que faz alguém mandar
 * a mensagem. Sem aniversário hoje, mostra só a semana que vem — e some quando
 * não há ninguém, para não ocupar a tela com um cartão vazio.
 */
export function AniversariantesDoDia() {
  const lista = useAniversariantes()
  const hoje = todayISO()

  const comDias = (lista.data ?? []).map((a) => ({ ...a, dias: diasAte(a.dia, a.mes, hoje) }))
  const deHoje = comDias.filter((a) => a.dias === 0)
  const daSemana = comDias
    .filter((a) => a.dias > 0 && a.dias <= 7)
    .sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome))

  if (deHoje.length === 0 && daSemana.length === 0) return null

  return (
    <Card className={deHoje.length > 0 ? 'border-success/40 bg-success/5' : undefined}>
      {deHoje.length > 0 && (
        <CardContent className="flex items-center gap-3 p-4">
          <span className="bg-success/15 text-success flex size-11 shrink-0 items-center justify-center rounded-full">
            <PartyPopper className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs font-medium">Aniversário hoje</p>
            <p className="font-display text-lg leading-snug font-semibold text-pretty">
              {deHoje.map((a) => a.nome).join(', ')}
            </p>
            {deHoje.some((a) => a.observacao) && (
              <p className="text-muted-foreground text-xs">
                {deHoje
                  .filter((a) => a.observacao)
                  .map((a) => `${a.nome}: ${a.observacao}`)
                  .join(' · ')}
              </p>
            )}
          </div>
        </CardContent>
      )}

      {daSemana.length > 0 && (
        <>
          <CardHeader className={deHoje.length > 0 ? 'pt-0 pb-2' : 'pb-2'}>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cake className="text-primary size-[18px]" aria-hidden />
              Nos próximos dias
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-border divide-y">
              {daSemana.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <DataDoAniversario dia={a.dia} mes={a.mes} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.nome}</span>
                  <Badge variant={a.dias === 1 ? 'info' : 'neutral'}>{quando(a.dias)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </>
      )}

      <CardContent className="pt-0 pb-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/aniversariantes">
            Ver todos
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
