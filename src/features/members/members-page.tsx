import * as React from 'react'
import {
  AlertCircle,
  Link2,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import {
  useDiscipleshipLinks,
  useMembers,
  useSetDiscipleLeader,
  useSetMemberStatus,
} from './use-members'
import { MemberDialog } from './member-dialog'
import { InviteDialog } from './invite-dialog'
import { formatDate } from '@/lib/date'
import { careGenderShort, memberStatusLabel, roleLabel } from '@/lib/labels'
import type { AppRole, MemberStatus, Profile } from '@/types/database'
import { PageHeader } from '@/components/common/page-header'
import { RoleBadge } from '@/components/common/badges'
import { Person } from '@/components/common/person'
import { CardListSkeleton, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const ROLE_FILTERS: (AppRole | 'all')[] = ['all', 'leader', 'disciple', 'member', 'supervisor']
const STATUS_FILTERS: (MemberStatus | 'all')[] = ['all', 'active', 'inactive']

export function MembersPage() {
  const { isLeader } = useSession()
  const members = useMembers()
  const links = useDiscipleshipLinks()
  const setStatus = useSetMemberStatus()
  const setLeader = useSetDiscipleLeader()

  const [search, setSearch] = React.useState('')
  const [role, setRole] = React.useState<AppRole | 'all'>('all')
  const [statusFilter, setStatusFilter] = React.useState<MemberStatus | 'all'>('active')
  const [editing, setEditing] = React.useState<Profile | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [inviting, setInviting] = React.useState<Profile | null>(null)
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const leaderOf = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const link of links.data ?? []) map.set(link.disciple_id, link.leader_id)
    return map
  }, [links.data])

  const leaders = (members.data ?? []).filter(
    (member) => member.role === 'leader' && member.status === 'active',
  )

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return (members.data ?? []).filter((member) => {
      if (role !== 'all' && member.role !== role) return false
      if (statusFilter !== 'all' && member.status !== statusFilter) return false
      if (!term) return true
      return (
        member.full_name.toLowerCase().includes(term) ||
        (member.email ?? '').toLowerCase().includes(term)
      )
    })
  }, [members.data, search, role, statusFilter])

  const pendingGender = (members.data ?? []).filter(
    (member) => member.status === 'active' && member.care_gender === null,
  )

  const openEdit = (member: Profile | null) => {
    setEditing(member)
    setEditOpen(true)
  }

  const openInvite = (member: Profile) => {
    setInviting(member)
    setInviteOpen(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrantes"
        description="Quem faz parte do GC, com papéis, acesso e discipulado."
        actions={
          isLeader ? (
            <Button onClick={() => openEdit(null)}>
              <Plus aria-hidden />
              Novo integrante
            </Button>
          ) : undefined
        }
      />

      {pendingGender.length > 0 && (
        <Card className="border-warning/35">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="text-warning-foreground mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">
                {pendingGender.length} integrante(s) sem gênero de cuidado confirmado
              </p>
              <p className="text-muted-foreground">
                A distribuição fica bloqueada até que todos estejam confirmados.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou e-mail"
              aria-label="Buscar integrante"
              className="pl-9"
            />
          </div>

          <Select value={role} onValueChange={(value) => setRole(value as AppRole | 'all')}>
            <SelectTrigger aria-label="Papel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_FILTERS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'all' ? 'Todos os papéis' : roleLabel[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as MemberStatus | 'all')}
          >
            <SelectTrigger aria-label="Situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'all' ? 'Ativos e inativos' : memberStatusLabel[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {members.isLoading && <CardListSkeleton rows={5} />}
      {members.isError && <ErrorState error={members.error} onRetry={() => members.refetch()} />}

      {members.isSuccess && filtered.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="Nenhum integrante encontrado"
              description="Ajuste a busca ou os filtros para ver outras pessoas."
            />
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------ cartoes no celular */}
      <div className="grid gap-3 md:grid-cols-2 lg:hidden">
        {filtered.map((member) => (
          // `min-w-0` no cartao: item de grid tem largura minima automatica, e
          // um e-mail comprido (que nao quebra) esticaria a coluna alem da tela.
          <Card key={member.id} className="min-w-0 p-4">
            <div className="flex items-start gap-3">
              <Person
                name={member.full_name}
                detail={member.email ?? 'Sem e-mail cadastrado'}
                className="min-w-0 flex-1"
              />
              {isLeader && (
                <MemberActions
                  member={member}
                  onEdit={() => openEdit(member)}
                  onInvite={() => openInvite(member)}
                  onToggleStatus={() =>
                    setStatus.mutate({
                      profileId: member.id,
                      status: member.status === 'active' ? 'inactive' : 'active',
                    })
                  }
                />
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <RoleBadge role={member.role} gender={member.care_gender} />
              {member.care_gender ? (
                <Badge variant="outline">{careGenderShort[member.care_gender]}</Badge>
              ) : (
                <Badge variant="warning">Gênero pendente</Badge>
              )}
              {member.status === 'inactive' && <Badge variant="neutral">Inativo</Badge>}
              {member.user_id ? (
                <Badge variant="success">Com acesso</Badge>
              ) : (
                <Badge variant="outline">Sem acesso</Badge>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* -------------------------------------------------- tabela no desktop */}
      {filtered.length > 0 && (
        <Card className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integrante</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Cuidado</TableHead>
                <TableHead>Discipulado</TableHead>
                <TableHead>Aniversário</TableHead>
                <TableHead>Acesso</TableHead>
                {isLeader && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => (
                <TableRow key={member.id} className={member.status === 'inactive' ? 'opacity-60' : ''}>
                  <TableCell>
                    <Person name={member.full_name} size="sm" detail={member.email ?? undefined} />
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={member.role} gender={member.care_gender} />
                  </TableCell>
                  <TableCell>
                    {member.care_gender ? (
                      <Badge variant="outline">{careGenderShort[member.care_gender]}</Badge>
                    ) : (
                      <Badge variant="warning">Pendente</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {member.role === 'disciple' && isLeader ? (
                      <Select
                        value={leaderOf.get(member.id) ?? ''}
                        onValueChange={(value) =>
                          setLeader.mutate({ discipleId: member.id, leaderId: value })
                        }
                      >
                        <SelectTrigger
                          className="h-9 w-44 text-xs"
                          aria-label={`Líder primário de ${member.full_name}`}
                        >
                          <SelectValue placeholder="Definir líder" />
                        </SelectTrigger>
                        <SelectContent>
                          {leaders
                            .filter(
                              (leader) =>
                                !member.care_gender || leader.care_gender === member.care_gender,
                            )
                            .map((leader) => (
                              <SelectItem key={leader.id} value={leader.id}>
                                {leader.full_name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {member.birth_date ? formatDate(member.birth_date) : '—'}
                  </TableCell>
                  <TableCell>
                    {member.user_id ? (
                      <Badge variant="success">Ativo</Badge>
                    ) : (
                      <Badge variant="outline">Sem acesso</Badge>
                    )}
                  </TableCell>
                  {isLeader && (
                    <TableCell>
                      <div className="flex justify-end">
                        <MemberActions
                          member={member}
                          onEdit={() => openEdit(member)}
                          onInvite={() => openInvite(member)}
                          onToggleStatus={() =>
                            setStatus.mutate({
                              profileId: member.id,
                              status: member.status === 'active' ? 'inactive' : 'active',
                            })
                          }
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <MemberDialog member={editing} open={editOpen} onOpenChange={setEditOpen} />
      <InviteDialog member={inviting} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}

function MemberActions({
  member,
  onEdit,
  onInvite,
  onToggleStatus,
}: {
  member: Profile
  onEdit: () => void
  onInvite: () => void
  onToggleStatus: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${member.full_name}`}>
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden />
          Editar dados
        </DropdownMenuItem>
        {!member.user_id && (
          <DropdownMenuItem onSelect={onInvite}>
            {member.email ? <Link2 aria-hidden /> : <Mail aria-hidden />}
            Convidar para o sistema
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive={member.status === 'active'} onSelect={onToggleStatus}>
          {member.status === 'active' ? <UserX aria-hidden /> : <UserCheck aria-hidden />}
          {member.status === 'active' ? 'Desativar' : 'Reativar'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
