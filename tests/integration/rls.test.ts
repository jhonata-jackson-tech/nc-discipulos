// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
import { REST_URL, criarConta, type LocalClient } from '../../scripts/lib/local.mjs'
import { adminClient, cleanup, createUser, encerrar, hasBackend, type TestUser } from './helpers'

/**
 * Testes de permissao contra o banco real.
 *
 * Eles existem porque a interface nao e a fonte de verdade: qualquer regra que
 * importe precisa se sustentar mesmo quando alguem chama a API diretamente.
 *
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
 *   npm run test:integration
 */
describe.skipIf(!hasBackend)('permissoes e regras no banco', () => {
  let admin: LocalClient
  let groupId: string
  let leader: TestUser
  let leaderFemale: TestUser
  let disciple: TestUser
  let member: TestUser
  let otherMember: TestUser
  let femaleMember: TestUser
  let supervisor: TestUser
  let weekId: string
  let assignmentId: string
  const created: string[] = []

  beforeAll(async () => {
    admin = adminClient()

    const { data: group, error } = await admin
      .from('groups')
      .insert({ name: `GC de teste ${randomUUID().slice(0, 6)}` })
      .select()
      .single()
    if (error) throw error
    groupId = group.id

    leader = await createUser(admin, { fullName: 'Líder', role: 'leader', careGender: 'male' })
    leaderFemale = await createUser(admin, {
      fullName: 'Líder mulher',
      role: 'leader',
      careGender: 'female',
    })
    disciple = await createUser(admin, {
      fullName: 'Discípulo',
      role: 'disciple',
      careGender: 'male',
    })
    member = await createUser(admin, { fullName: 'Irmão', role: 'member', careGender: 'male' })
    otherMember = await createUser(admin, {
      fullName: 'Outro irmão',
      role: 'member',
      careGender: 'male',
    })
    femaleMember = await createUser(admin, {
      fullName: 'Irmã',
      role: 'member',
      careGender: 'female',
    })
    supervisor = await createUser(admin, {
      fullName: 'Supervisor',
      role: 'supervisor',
      careGender: 'male',
    })

    created.push(
      leader.profileId,
      leaderFemale.profileId,
      disciple.profileId,
      member.profileId,
      otherMember.profileId,
      femaleMember.profileId,
      supervisor.profileId,
    )

    const { data: week, error: weekError } = await admin
      .from('care_weeks')
      .insert({
        group_id: groupId,
        starts_on: '2026-08-24',
        ends_on: '2026-08-30',
        seed: 'teste',
        status: 'draft',
      })
      .select()
      .single()
    if (weekError) throw weekError
    weekId = week.id

    const { data: assignment, error: assignmentError } = await admin
      .from('care_assignments')
      .insert({ week_id: weekId, caregiver_id: disciple.profileId, cared_for_id: member.profileId })
      .select()
      .single()
    if (assignmentError) throw assignmentError
    assignmentId = assignment.id
  }, 60_000)

  afterAll(async () => {
    if (hasBackend) {
      await cleanup(admin, created, groupId)
      await encerrar()
    }
  }, 60_000)

  // ------------------------------------------------------------------ acesso
  it('recusa cadastro sem convite valido', async () => {
    await expect(
      criarConta({
        email: `intruso.${randomUUID().slice(0, 6)}@teste.cuidar.local`,
        password: 'Senha-forte-123',
        inviteToken: randomUUID().replace(/-/g, ''),
      }),
    ).rejects.toThrow()
  })

  it('nao expoe nada ao visitante nao autenticado', async () => {
    // Sem token, o PostgREST assume `anon` - que nao le nada do dominio.
    const client = new PostgrestClient(REST_URL)
    const { data, error } = await client.from('profiles').select('*')
    expect(data ?? []).toHaveLength(0)
    expect(error === null || error.code === '42501').toBe(true)
  })

  // ------------------------------------------------------- feedback sensivel
  it('mantem o feedback longe de quem nao cuida daquela pessoa', async () => {
    await admin.from('contact_logs').insert({
      assignment_id: assignmentId,
      author_id: disciple.profileId,
      channel: 'whatsapp',
      feedback: 'anotacao reservada do cuidado',
      attention_level: 'watch',
    })

    const asMember = await member.client.from('contact_logs').select('*')
    expect(asMember.data ?? []).toHaveLength(0)

    const asCaregiver = await disciple.client.from('contact_logs').select('*')
    expect((asCaregiver.data ?? []).length).toBeGreaterThan(0)

    const asLeader = await leader.client.from('contact_logs').select('*')
    expect((asLeader.data ?? []).length).toBeGreaterThan(0)
  })

  it('esconde da pessoa cuidada o registro do proprio acompanhamento', async () => {
    const { data } = await member.client.from('care_assignments').select('*')
    expect(data ?? []).toHaveLength(0)
  })

  it('deixa o lider enxergar a operacao inteira do GC', async () => {
    const { data } = await leader.client.from('care_assignments').select('*').eq('week_id', weekId)
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  // ------------------------------------------------------- regra de genero
  it('impede que um cuidado atravesse generos diferentes', async () => {
    const { error } = await admin.from('care_assignments').insert({
      week_id: weekId,
      caregiver_id: disciple.profileId,
      cared_for_id: femaleMember.profileId,
    })
    expect(error?.message).toMatch(/mesmo genero de cuidado/i)
  })

  it('recusa transferir um cuidado para alguem de outro genero', async () => {
    const { error } = await disciple.client.rpc('request_transfer', {
      p_assignment_id: assignmentId,
      p_recipient_id: leaderFemale.profileId,
      p_reason: 'teste de regra',
    })
    expect(error?.message).toMatch(/mesmo genero de cuidado/i)
  })

  it('recusa vincular discipulado entre generos diferentes', async () => {
    const { error } = await leader.client.rpc('set_disciple_leader', {
      p_disciple_id: disciple.profileId,
      p_leader_id: leaderFemale.profileId,
    })
    expect(error?.message).toMatch(/mesmo genero de cuidado/i)
  })

  it('nao permite que alguem cuide de si mesmo', async () => {
    const { error } = await admin.from('care_assignments').insert({
      week_id: weekId,
      caregiver_id: disciple.profileId,
      cared_for_id: disciple.profileId,
    })
    expect(error).not.toBeNull()
  })

  it('garante uma unica atribuicao por pessoa cuidada na semana', async () => {
    const { error } = await admin.from('care_assignments').insert({
      week_id: weekId,
      caregiver_id: leader.profileId,
      cared_for_id: member.profileId,
    })
    expect(error?.message).toMatch(/duplicate key|assignment_unique_cared_for/i)
  })

  // -------------------------------------------------------------- contatos
  it('so aceita registro de contato de quem esta responsavel', async () => {
    const intruder = await otherMember.client.rpc('log_contact', {
      p_assignment_id: assignmentId,
      p_channel: 'whatsapp',
      p_well_being: 'bem',
      p_contacted_on: '2026-08-25',
    })
    expect(intruder.error).not.toBeNull()

    const caregiver = await disciple.client.rpc('log_contact', {
      p_assignment_id: assignmentId,
      p_channel: 'call',
      p_well_being: 'bem',
      p_coming_to_gc: 'vem',
      p_feedback: 'conversa boa',
      p_contacted_on: '2026-08-25',
    })
    expect(caregiver.error).toBeNull()
  })

  it('deriva o nivel de atencao de como a pessoa esta', async () => {
    const { data: alvo } = await admin
      .from('care_assignments')
      .insert({
        week_id: weekId,
        caregiver_id: disciple.profileId,
        cared_for_id: otherMember.profileId,
        origin: 'rotation',
      })
      .select()
      .single()

    // "Precisa de ajuda" tem que acender o alerta da lideranca sozinho - sem
    // uma segunda pergunta a quem esta registrando.
    const { error } = await disciple.client.rpc('log_contact', {
      p_assignment_id: alvo!.id,
      p_channel: 'whatsapp',
      p_well_being: 'precisa_ajuda',
    })
    expect(error).toBeNull()

    const { data: depois } = await admin
      .from('care_assignments')
      .select('attention_level, status')
      .eq('id', alvo!.id)
      .single()
    expect(depois!.attention_level).toBe('leader_action')

    // Sem resposta nao e cuidado concluido: continua aguardando.
    await disciple.client.rpc('log_contact', {
      p_assignment_id: alvo!.id,
      p_channel: 'whatsapp',
      p_well_being: 'sem_resposta',
    })
    const { data: semResposta } = await admin
      .from('care_assignments')
      .select('attention_level, status')
      .eq('id', alvo!.id)
      .single()
    expect(semResposta!.status).toBe('awaiting_reply')
    expect(semResposta!.attention_level).toBe('watch')
  })

  it('permite ao lider registrar o cuidado dos proprios discipulos', async () => {
    const { data: own } = await admin
      .from('care_assignments')
      .insert({
        week_id: weekId,
        caregiver_id: leader.profileId,
        cared_for_id: disciple.profileId,
        origin: 'fixed_disciple',
      })
      .select()
      .single()

    const { error } = await leader.client.rpc('log_contact', {
      p_assignment_id: own!.id,
      p_channel: 'in_person',
      p_well_being: 'seguindo',
      p_feedback: 'acompanhamento do discipulado',
      p_contacted_on: '2026-08-25',
    })
    expect(error).toBeNull()
  })

  // --------------------------------------------------------- transferencias
  it('so muda o responsavel depois do aceite', async () => {
    const { data: requestId, error } = await disciple.client.rpc('request_transfer', {
      p_assignment_id: assignmentId,
      p_recipient_id: leader.profileId,
      p_reason: 'estarei viajando',
    })
    expect(error).toBeNull()

    const pending = await admin
      .from('care_assignments')
      .select('caregiver_id')
      .eq('id', assignmentId)
      .single()
    expect(pending.data!.caregiver_id).toBe(disciple.profileId)

    // Quem nao recebeu o pedido nao pode responder por ele.
    const wrongResponder = await otherMember.client.rpc('respond_transfer', {
      p_request_id: requestId,
      p_accept: true,
    })
    expect(wrongResponder.error).not.toBeNull()

    const accepted = await leader.client.rpc('respond_transfer', {
      p_request_id: requestId,
      p_accept: true,
    })
    expect(accepted.error).toBeNull()

    const after = await admin
      .from('care_assignments')
      .select('caregiver_id, previous_caregiver_id')
      .eq('id', assignmentId)
      .single()
    expect(after.data!.caregiver_id).toBe(leader.profileId)
    expect(after.data!.previous_caregiver_id).toBe(disciple.profileId)
  })

  // --------------------------------------------------------- papel de lider
  it('reserva publicacao e reorganizacao aos lideres', async () => {
    const byDisciple = await disciple.client.rpc('publish_care_week', { p_week_id: weekId })
    expect(byDisciple.error?.message).toMatch(/lider/i)

    const reassign = await disciple.client.rpc('reassign_care', {
      p_assignment_id: assignmentId,
      p_new_caregiver_id: disciple.profileId,
      p_reason: 'tentativa',
    })
    expect(reassign.error?.message).toMatch(/lider/i)

    const byLeader = await leader.client.rpc('publish_care_week', { p_week_id: weekId })
    expect(byLeader.error).toBeNull()
  })

  it('exige justificativa na reorganizacao do lider', async () => {
    const { error } = await leader.client.rpc('reassign_care', {
      p_assignment_id: assignmentId,
      p_new_caregiver_id: disciple.profileId,
      p_reason: '   ',
    })
    expect(error?.message).toMatch(/justificativa/i)
  })

  it('nao deixa um irmao mudar o proprio papel', async () => {
    await member.client.from('profiles').update({ role: 'leader' }).eq('id', member.profileId)

    const { data } = await admin.from('profiles').select('role').eq('id', member.profileId).single()
    expect(data!.role).toBe('member')
  })

  // ------------------------------------------------------ supervisao reservada
  it('mantem a conversa reservada invisivel para a lideranca do GC', async () => {
    const { error } = await disciple.client.from('supervision_requests').insert({
      group_id: groupId,
      requester_id: disciple.profileId,
      subject: 'Assunto reservado',
      message: 'Preciso conversar em particular.',
      confidential_to_supervisors: true,
    })
    expect(error).toBeNull()

    const asLeader = await leader.client
      .from('supervision_requests')
      .select('*')
      .eq('subject', 'Assunto reservado')
    expect(asLeader.data ?? []).toHaveLength(0)

    // Nem em contagem: a linha simplesmente nao existe para o lider.
    const count = await leader.client
      .from('supervision_requests')
      .select('*', { count: 'exact', head: true })
      .eq('confidential_to_supervisors', true)
    expect(count.count ?? 0).toBe(0)

    const asSupervisor = await supervisor.client
      .from('supervision_requests')
      .select('*')
      .eq('subject', 'Assunto reservado')
    expect((asSupervisor.data ?? []).length).toBe(1)

    const asRequester = await disciple.client
      .from('supervision_requests')
      .select('*')
      .eq('subject', 'Assunto reservado')
    expect((asRequester.data ?? []).length).toBe(1)
  })

  it('guarda as anotacoes do supervisor apenas para supervisores', async () => {
    const { data: request } = await supervisor.client
      .from('supervision_requests')
      .select('id')
      .eq('subject', 'Assunto reservado')
      .single()

    const { error } = await supervisor.client.from('supervision_notes').insert({
      request_id: request!.id,
      supervisor_id: supervisor.profileId,
      note: 'anotacao privada',
    })
    expect(error).toBeNull()

    const asLeader = await leader.client.from('supervision_notes').select('*')
    expect(asLeader.data ?? []).toHaveLength(0)

    const asRequester = await disciple.client.from('supervision_notes').select('*')
    expect(asRequester.data ?? []).toHaveLength(0)
  })

  it('impede que um irmao peca conversa com a supervisao', async () => {
    const { error } = await member.client.from('supervision_requests').insert({
      group_id: groupId,
      requester_id: member.profileId,
      subject: 'Tentativa',
      message: 'Mensagem de teste do fluxo.',
    })
    expect(error).not.toBeNull()
  })
})
