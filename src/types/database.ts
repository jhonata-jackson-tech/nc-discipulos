/**
 * Tipos do banco.
 *
 * Escritos a mao para o app nascer tipado sem depender de um banco no ar.
 * Sao a fonte de verdade dos tipos do frontend: ao mudar o schema, ajuste
 * este arquivo junto com a migration.
 */
export type AppRole = 'supervisor' | 'leader' | 'disciple' | 'member'
export type CareGender = 'male' | 'female'
export type MemberStatus = 'active' | 'inactive'
export type Salutation = 'irmao' | 'irma'

export type CareWeekStatus = 'draft' | 'published' | 'closed'
export type AssignmentStatus =
  'pending' | 'contacted' | 'awaiting_reply' | 'follow_up' | 'needs_attention'
export type AssignmentOrigin = 'fixed_disciple' | 'rotation' | 'manual' | 'transfer'
export type AttentionLevel = 'normal' | 'watch' | 'leader_action'

/**
 * Como a pessoa está nesta semana.
 *
 * A escala evita "bem/mal": diante dessa dupla, quem responde tende a ser
 * gentil em vez de preciso. `sem_resposta` não é ausência de dado - silêncio
 * repetido é justamente o que a liderança precisa enxergar cedo.
 */
export type WellBeing =
  'sem_resposta' | 'precisa_ajuda' | 'pra_baixo' | 'seguindo' | 'bem' | 'muito_bem'

export type GcIntent = 'vem' | 'nao_vem' | 'nao_sabe'

/**
 * Por onde o visitante chegou.
 *
 * Os dois primeiros são os caminhos que existem hoje: ou a pessoa aparece na
 * sala, ou o GC Center manda o contato para a liderança.
 */
export type VisitorOrigin = 'organico' | 'gc_center' | 'convite' | 'outro'

/**
 * Onde o acompanhamento do visitante parou.
 *
 * `acompanhando` é o único estado aberto — os outros dois são desfechos, e
 * todo visitante acaba em um deles.
 */
export type VisitorStatus = 'acompanhando' | 'integrado' | 'encerrado'

/**
 * Como a pessoa esteve no encontro do GC.
 *
 * `justificado` separa quem avisou de quem sumiu: três faltas de quem está
 * viajando não são três faltas de quem está se afastando.
 */
export type AttendanceMark = 'presente' | 'justificado' | 'ausente'
export type ContactChannel = 'whatsapp' | 'call' | 'in_person' | 'message' | 'video' | 'other'
export type TransferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export type ActivityType = 'talk' | 'snack' | 'dynamic' | 'birthdays' | 'other'
/**
 * A única resposta que importa numa atividade: quem foi indicado topou?
 *
 * Substitui a antiga situação ("a fazer", "em andamento"), que descrevia a
 * atividade e não o combinado - a liderança indicava alguém e ficava sem saber
 * se a pessoa viu, se pode, se topou.
 */
export type ActivityResponse = 'pendente' | 'aceita' | 'recusada'

export type ActivityStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'

export type SupervisionStatus = 'requested' | 'seen' | 'scheduled' | 'done' | 'cancelled'
export type SupervisionUrgency = 'low' | 'normal' | 'high'

export type NotificationType =
  | 'devotional'
  | 'week_published'
  | 'assignment_new'
  | 'activity_assigned'
  | 'activity_due'
  | 'transfer_requested'
  | 'transfer_accepted'
  | 'transfer_declined'
  | 'supervision_updated'
  | 'general'

export interface Profile {
  id: string
  user_id: string | null
  full_name: string
  /** Como a pessoa quer ser chamada. Vazio: usa o primeiro nome. */
  display_name: string | null
  photo_url: string | null
  email: string | null
  phone: string | null
  birth_date: string | null
  salutation: Salutation | null
  care_gender: CareGender | null
  care_gender_confirmed_at: string | null
  role: AppRole
  status: MemberStatus
  /**
   * Responde pelo sistema: publica devocional e concede a marca a outra
   * pessoa. Não é um papel - é uma marca sobre o papel que a pessoa já tem,
   * porque nem todo líder manda aviso para 33 celulares.
   */
  is_admin: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  name: string
  description: string | null
  timezone: string
  week_starts_on: number
  /** Dia do encontro do GC (0 = domingo; 4 = quinta). */
  meeting_weekday: number
  setup_completed_at: string | null
}

export interface DiscipleshipLink {
  id: string
  disciple_id: string
  leader_id: string
  started_on: string
  ended_on: string | null
}

export interface CareWeek {
  id: string
  group_id: string
  starts_on: string
  ends_on: string
  status: CareWeekStatus
  seed: string
  generation_report: GenerationReport | null
  generated_at: string | null
  published_at: string | null
  closed_at: string | null
  notes: string | null
}

export interface GenerationReport {
  pools: PoolReportRow[]
  warnings: string[]
  extraSlots: string[]
}

export interface PoolReportRow {
  gender: CareGender
  caregiverCount: number
  caredForCount: number
  baseLoad: number
  extraSlotCount: number
  loads: { caregiverId: string; fullName: string; fixed: number; rotation: number; total: number }[]
  repeatedPairs: {
    caregiverId: string
    caredForId: string
    timesUsed: number
    lastUsedOn: string | null
  }[]
  unassigned: string[]
  warnings: string[]
}

export interface CareAssignment {
  id: string
  week_id: string
  caregiver_id: string
  cared_for_id: string
  origin: AssignmentOrigin
  status: AssignmentStatus
  attention_level: AttentionLevel
  previous_caregiver_id: string | null
  transferred_at: string | null
  last_contact_at: string | null
  created_at: string
}

export interface ContactLog {
  id: string
  assignment_id: string
  author_id: string
  contacted_on: string
  channel: ContactChannel
  got_reply: boolean
  feedback: string | null
  attention_level: AttentionLevel
  well_being: WellBeing | null
  coming_to_gc: GcIntent | null
  created_at: string
}

export interface TransferRequest {
  id: string
  assignment_id: string
  requester_id: string
  recipient_id: string
  reason: string
  status: TransferStatus
  response_note: string | null
  responded_at: string | null
  created_at: string
}

export interface Activity {
  id: string
  group_id: string
  week_id: string | null
  type: ActivityType
  title: string
  description: string | null
  due_at: string | null
  status: ActivityStatus
  notes: string | null
  is_recurring: boolean
  completed_at: string | null
  created_at: string
}

export interface SupervisionRequest {
  id: string
  group_id: string
  requester_id: string
  supervisor_id: string | null
  confidential_to_supervisors: boolean
  subject: string
  message: string
  urgency: SupervisionUrgency
  suggested_times: string | null
  status: SupervisionStatus
  seen_at: string | null
  scheduled_for: string | null
  closed_at: string | null
  created_at: string
}

export interface SupervisionNote {
  id: string
  request_id: string
  supervisor_id: string
  note: string
  created_at: string
}

export interface AppNotification {
  id: string
  profile_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface PairingRestriction {
  id: string
  group_id: string
  profile_a: string
  profile_b: string
  reason: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  reason: string | null
  before: unknown
  after: unknown
  created_at: string
}

export interface WeekSummary {
  total: number
  pending: number
  contacted: number
  awaitingReply: number
  followUp: number
  needsAttention: number
  leaderAction: number
  watch: number
  byCaregiver: {
    caregiverId: string
    name: string
    careGender: CareGender
    total: number
    done: number
  }[]
}

/** Números do próprio esforço, para a tela de perfil. Nunca um ranking. */
export interface MeuPerfil {
  grupo: { nome: string | null; lideres: string[] }
  semana: { feitos: number; total: number }
  historico: {
    cuidadosRegistrados: number
    pessoasCuidadas: number
    semanasSeguidas: number
  }
}

/**
 * Quem assina um devocional.
 *
 * Não é um integrante do GC: o pastor não está no cadastro, e não deveria
 * precisar estar para o texto dele aparecer aqui.
 */
export interface DevotionalAuthor {
  id: string
  name: string
  title: string | null
  photo_url: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/** Quem alcança um devocional. Escolhido a cada publicação. */
export type DevotionalAudience = 'todos' | 'lideranca_discipulos' | 'lideranca'
export type DevotionalStatus = 'draft' | 'published'

/** O que a lista mostra. Sem o corpo e sem o retrato - os dois pesam. */
export interface DevotionalCard {
  id: string
  titulo: string
  resumo: string
  alcance: DevotionalAudience
  situacao: DevotionalStatus
  publicadoEm: string | null
  autorId: string
  assinatura: string
  amens: number
  euAmem: boolean
}

export interface Devotional extends Omit<DevotionalCard, 'resumo'> {
  corpo: string
}
