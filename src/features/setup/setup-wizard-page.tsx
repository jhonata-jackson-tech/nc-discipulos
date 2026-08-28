import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Users, Venus, Mars } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from '@/features/auth/session-context'
import {
  useActiveMembers,
  useConfirmCareGenders,
  useDiscipleshipLinks,
  useSetDiscipleLeader,
} from '@/features/members/use-members'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { careGenderLabel, roleLabel } from '@/lib/labels'
import { cn, initials } from '@/lib/utils'
import type { CareGender, Profile } from '@/types/database'
import { PageHeader } from '@/components/common/page-header'
import { CardListSkeleton } from '@/components/common/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Assistente de primeiro acesso da lideranca.
 *
 * Duas etapas obrigatorias antes da primeira distribuicao: confirmar o genero
 * de cuidado de todos os integrantes ativos e vincular cada discipulo a um
 * lider do mesmo genero. Nada disso e inferido pelo nome.
 */
export function SetupWizardPage() {
  const navigate = useNavigate()
  const { group, refresh } = useSession()
  const members = useActiveMembers()
  const links = useDiscipleshipLinks()
  const confirmGenders = useConfirmCareGenders()
  const setLeader = useSetDiscipleLeader()

  const [step, setStep] = React.useState<1 | 2>(1)
  // Guardamos apenas o que a lideranca marcou nesta sessao; o valor efetivo e
  // derivado, com o que ja estava salvo no cadastro como base.
  const [overrides, setOverrides] = React.useState<Record<string, CareGender>>({})
  const [finishing, setFinishing] = React.useState(false)

  const participants = React.useMemo(
    () => (members.data ?? []).filter((member) => ['leader', 'disciple', 'member'].includes(member.role)),
    [members.data],
  )

  const choiceFor = (member: Profile): CareGender | null =>
    overrides[member.id] ?? member.care_gender

  const confirmedCount = participants.filter((member) => choiceFor(member)).length
  const allConfirmed = participants.length > 0 && confirmedCount === participants.length

  const disciples = participants.filter((member) => member.role === 'disciple')
  const leaders = participants.filter((member) => member.role === 'leader')
  const leaderOf = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const link of links.data ?? []) map.set(link.disciple_id, link.leader_id)
    return map
  }, [links.data])

  const allLinked = disciples.every((disciple) => leaderOf.has(disciple.id))

  const saveGenders = async () => {
    const entries = participants
      .filter((member) => overrides[member.id] && overrides[member.id] !== member.care_gender)
      .map((member) => ({ id: member.id, careGender: overrides[member.id] }))

    if (entries.length > 0) await confirmGenders.mutateAsync(entries)
    setStep(2)
  }

  const finish = async () => {
    if (!group) return
    setFinishing(true)
    const { error } = await supabase.rpc('complete_group_setup', { p_group_id: group.id })
    setFinishing(false)

    if (error) {
      toast.error(friendlyError(error))
      return
    }

    toast.success('Configuração concluída. Você já pode gerar a primeira semana.')
    await refresh()
    navigate('/distribuicao')
  }

  if (members.isLoading) return <CardListSkeleton rows={5} />

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Primeiros passos"
        description="Duas confirmações rápidas antes da primeira distribuição do GC."
      />

      <div className="flex items-center gap-3">
        <StepBadge active={step === 1} done={step > 1} number={1} label="Gênero de cuidado" />
        <div className="bg-border h-px flex-1" />
        <StepBadge active={step === 2} done={false} number={2} label="Discipulado" />
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Confirme o gênero de cuidado</CardTitle>
            <CardDescription>
              Homem cuida somente de homem e mulher somente de mulher. Confirme cada pessoa com a
              liderança — o sistema nunca deduz isso pelo nome.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confirmados</span>
                <span className="tabular font-medium">
                  {confirmedCount} de {participants.length}
                </span>
              </div>
              <Progress
                value={participants.length ? (confirmedCount / participants.length) * 100 : 0}
                aria-label="Progresso das confirmações"
              />
            </div>

            <ul className="divide-border divide-y">
              {participants.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar className="size-9">
                    <AvatarFallback>{initials(member.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{member.full_name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {roleLabel[member.role]}
                    </span>
                  </span>

                  <div className="flex gap-2">
                    <GenderButton
                      gender="male"
                      selected={choiceFor(member) === 'male'}
                      onSelect={() => setOverrides((c) => ({ ...c, [member.id]: 'male' }))}
                      personName={member.full_name}
                    />
                    <GenderButton
                      gender="female"
                      selected={choiceFor(member) === 'female'}
                      onSelect={() => setOverrides((c) => ({ ...c, [member.id]: 'female' }))}
                      personName={member.full_name}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex justify-end">
              <Button onClick={saveGenders} disabled={!allConfirmed} loading={confirmGenders.isPending}>
                Continuar
                <ArrowRight aria-hidden />
              </Button>
            </div>

            {!allConfirmed && (
              <p className="text-muted-foreground text-right text-sm">
                Faltam {participants.length - confirmedCount} confirmação(ões).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Vincule cada discípulo ao líder primário</CardTitle>
            <CardDescription>
              Só aparecem líderes do mesmo gênero de cuidado. Esses cuidados são fixos e contam na
              carga semanal do líder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {disciples.length === 0 ? (
              <Alert variant="info">
                <Users aria-hidden />
                <AlertDescription>
                  Nenhum discípulo cadastrado ainda. Você pode seguir e configurar depois.
                </AlertDescription>
              </Alert>
            ) : (
              <ul className="divide-border divide-y">
                {disciples.map((disciple) => (
                  <li key={disciple.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{disciple.full_name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {disciple.care_gender ? careGenderLabel[disciple.care_gender] : ''}
                      </span>
                    </span>

                    <Select
                      value={leaderOf.get(disciple.id) ?? ''}
                      onValueChange={(value) =>
                        setLeader.mutate({ discipleId: disciple.id, leaderId: value })
                      }
                    >
                      <SelectTrigger
                        className="w-52"
                        aria-label={`Líder primário de ${disciple.full_name}`}
                      >
                        <SelectValue placeholder="Escolher líder" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaders
                          .filter((leader) => leader.care_gender === disciple.care_gender)
                          .map((leader) => (
                            <SelectItem key={leader.id} value={leader.id}>
                              {leader.full_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}

            {!allLinked && disciples.length > 0 && (
              <Alert variant="warning">
                <AlertTitle>Alguns discípulos ainda estão sem líder</AlertTitle>
                <AlertDescription>
                  Você pode concluir assim mesmo — eles entram no rodízio comum até serem vinculados.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft aria-hidden />
                Voltar
              </Button>
              <Button onClick={finish} loading={finishing}>
                <CheckCircle2 aria-hidden />
                Concluir configuração
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StepBadge({
  number,
  label,
  active,
  done,
}: {
  number: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-full text-sm font-semibold',
          done && 'bg-success/15 text-success',
          active && !done && 'bg-primary text-primary-foreground',
          !active && !done && 'bg-secondary text-muted-foreground',
        )}
      >
        {done ? <CheckCircle2 className="size-4" aria-hidden /> : number}
      </span>
      <span className={cn('text-sm', active ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
    </div>
  )
}

function GenderButton({
  gender,
  selected,
  onSelect,
  personName,
}: {
  gender: CareGender
  selected: boolean
  onSelect: () => void
  personName: string
}) {
  const Icon = gender === 'male' ? Mars : Venus
  return (
    <Button
      type="button"
      variant={selected ? 'default' : 'outline'}
      size="sm"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${personName}: ${careGenderLabel[gender]}`}
    >
      <Icon aria-hidden />
      {gender === 'male' ? 'Homens' : 'Mulheres'}
    </Button>
  )
}
