import { AlertTriangle, CircleCheck, Clock, Eye, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  activityStatusLabel,
  assignmentStatusLabel,
  attentionLabel,
  roleLabelFor,
  weekStatusLabel,
} from '@/lib/labels'
import type {
  ActivityStatus,
  AppRole,
  AssignmentStatus,
  AttentionLevel,
  CareGender,
  CareWeekStatus,
} from '@/types/database'

const ASSIGNMENT_VARIANT = {
  pending: 'neutral',
  contacted: 'success',
  awaiting_reply: 'info',
  follow_up: 'default',
  needs_attention: 'warning',
} as const

const ASSIGNMENT_ICON = {
  pending: Clock,
  contacted: CircleCheck,
  awaiting_reply: MessageCircle,
  follow_up: Eye,
  needs_attention: AlertTriangle,
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const Icon = ASSIGNMENT_ICON[status]
  return (
    <Badge variant={ASSIGNMENT_VARIANT[status]}>
      <Icon aria-hidden />
      {assignmentStatusLabel[status]}
    </Badge>
  )
}

export function AttentionBadge({ level }: { level: AttentionLevel }) {
  if (level === 'normal') return null
  return (
    <Badge variant={level === 'leader_action' ? 'danger' : 'warning'}>
      <AlertTriangle aria-hidden />
      {attentionLabel[level]}
    </Badge>
  )
}

const ROLE_VARIANT = {
  supervisor: 'info',
  leader: 'default',
  disciple: 'outline',
  member: 'neutral',
} as const

export function RoleBadge({ role, gender }: { role: AppRole; gender: CareGender | null }) {
  return <Badge variant={ROLE_VARIANT[role]}>{roleLabelFor(role, gender)}</Badge>
}

export function WeekStatusBadge({ status }: { status: CareWeekStatus }) {
  const variant = status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'neutral'
  return <Badge variant={variant}>{weekStatusLabel[status]}</Badge>
}

const ACTIVITY_VARIANT = {
  todo: 'neutral',
  in_progress: 'info',
  done: 'success',
  cancelled: 'outline',
} as const

export function ActivityStatusBadge({ status }: { status: ActivityStatus }) {
  return <Badge variant={ACTIVITY_VARIANT[status]}>{activityStatusLabel[status]}</Badge>
}
