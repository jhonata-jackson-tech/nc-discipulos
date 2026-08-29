/**
 * Vocabulario do produto em portugues.
 *
 * Linguagem pastoral, simples e respeitosa: "Irmao/Irma" no lugar de "membro",
 * "precisa de atencao" no lugar de codigos tecnicos.
 */
import type {
  ActivityStatus,
  ActivityType,
  AppRole,
  AssignmentOrigin,
  AssignmentStatus,
  AttentionLevel,
  CareGender,
  CareWeekStatus,
  ContactChannel,
  MemberStatus,
  SupervisionStatus,
  SupervisionUrgency,
  TransferStatus,
  WellBeing,
  GcIntent,
} from '@/types/database'

export const roleLabel: Record<AppRole, string> = {
  supervisor: 'Supervisor',
  leader: 'Líder',
  disciple: 'Discípulo',
  member: 'Irmão/Irmã',
}

export const roleLabelFor = (role: AppRole, gender: CareGender | null): string => {
  if (!gender) return roleLabel[role]
  const female: Record<AppRole, string> = {
    supervisor: 'Supervisora',
    leader: 'Líder',
    disciple: 'Discípula',
    member: 'Irmã',
  }
  const male: Record<AppRole, string> = {
    supervisor: 'Supervisor',
    leader: 'Líder',
    disciple: 'Discípulo',
    member: 'Irmão',
  }
  return gender === 'female' ? female[role] : male[role]
}

export const careGenderLabel: Record<CareGender, string> = {
  male: 'Cuidado entre homens',
  female: 'Cuidado entre mulheres',
}

export const careGenderShort: Record<CareGender, string> = {
  male: 'Homens',
  female: 'Mulheres',
}

export const memberStatusLabel: Record<MemberStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
}

export const weekStatusLabel: Record<CareWeekStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicada',
  closed: 'Encerrada',
}

export const assignmentStatusLabel: Record<AssignmentStatus, string> = {
  pending: 'Pendente',
  contacted: 'Contato realizado',
  awaiting_reply: 'Aguardando retorno',
  follow_up: 'Acompanhamento',
  needs_attention: 'Precisa de atenção',
}

export const assignmentOriginLabel: Record<AssignmentOrigin, string> = {
  fixed_disciple: 'Discipulado',
  rotation: 'Rodízio da semana',
  manual: 'Ajuste da liderança',
  transfer: 'Recebido por transferência',
}

export const attentionLabel: Record<AttentionLevel, string> = {
  normal: 'Tudo bem',
  watch: 'Observar',
  leader_action: 'Liderança precisa agir',
}

export const wellBeingLabel: Record<WellBeing, string> = {
  sem_resposta: 'Não respondeu',
  precisa_ajuda: 'Precisa de ajuda',
  pra_baixo: 'Meio pra baixo',
  seguindo: 'Seguindo',
  bem: 'Bem',
  muito_bem: 'Muito bem',
}

/** Uma palavra a mais, para quem está registrando não hesitar. */
export const wellBeingHint: Record<WellBeing, string> = {
  sem_resposta: 'Falei, mas não obtive retorno',
  precisa_ajuda: 'Passando por algo difícil agora',
  pra_baixo: 'Não está bem, mas segue',
  seguindo: 'Levando a vida, sem novidade',
  bem: 'Tranquila',
  muito_bem: 'Animada, com boas notícias',
}

export const gcIntentLabel: Record<GcIntent, string> = {
  vem: 'Vem ao GC',
  nao_vem: 'Não vem',
  nao_sabe: 'Ainda não sabe',
}

export const channelLabel: Record<ContactChannel, string> = {
  whatsapp: 'WhatsApp',
  call: 'Ligação',
  in_person: 'Pessoalmente',
  message: 'Mensagem',
  video: 'Chamada de vídeo',
  other: 'Outro',
}

export const transferStatusLabel: Record<TransferStatus, string> = {
  pending: 'Aguardando resposta',
  accepted: 'Aceita',
  declined: 'Recusada',
  cancelled: 'Cancelada',
}

export const activityTypeLabel: Record<ActivityType, string> = {
  talk: 'Talk',
  snack: 'Lanche',
  dynamic: 'Dinâmica',
  birthdays: 'Aniversariantes',
  other: 'Outro',
}

export const activityStatusLabel: Record<ActivityStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Concluída',
  cancelled: 'Cancelada',
}

export const supervisionStatusLabel: Record<SupervisionStatus, string> = {
  requested: 'Solicitado',
  seen: 'Visualizado',
  scheduled: 'Agendado',
  done: 'Concluído',
  cancelled: 'Cancelado',
}

export const urgencyLabel: Record<SupervisionUrgency, string> = {
  low: 'Posso esperar',
  normal: 'Normal',
  high: 'Urgente',
}

/** Aviso fixo dos campos de feedback. */
export const FEEDBACK_PRIVACY_HINT =
  'Escreva o suficiente para cuidar bem. Não registre confissões, diagnósticos, ' +
  'documentos ou detalhes íntimos.'
