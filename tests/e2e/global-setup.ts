import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  adminClient,
  configurado,
  darAcesso,
  encerrar,
  sql,
  removerConta,
  type LocalClient,
} from '../../scripts/lib/local.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const STATE_FILE = resolve(HERE, '.state.json')

/**
 * Prepara um GC de teste completo: lideranca, discipulado, irmaos, uma semana
 * publicada e as atribuicoes que os testes vao exercitar.
 */
export default async function globalSetup() {
  if (!configurado) {
    writeFileSync(STATE_FILE, JSON.stringify({ ready: false }))
    console.warn('\n[e2e] DATABASE_URL/JWT_SECRET ausentes no .env: os testes serão pulados.\n')
    return
  }

  const admin = adminClient()
  await removePreviousRuns(admin)

  const tag = randomUUID().slice(0, 6)

  const { data: group } = await admin
    .from('groups')
    .insert({ name: `GC e2e ${tag}`, setup_completed_at: new Date().toISOString() })
    .select()
    .single()

  const people = {
    leader: { name: `Líder e2e ${tag}`, role: 'leader', gender: 'male' },
    disciple: { name: `Discípulo e2e ${tag}`, role: 'disciple', gender: 'male' },
    peer: { name: `Colega e2e ${tag}`, role: 'disciple', gender: 'male' },
    memberA: { name: `Irmão A e2e ${tag}`, role: 'member', gender: 'male' },
    memberB: { name: `Irmão B e2e ${tag}`, role: 'member', gender: 'male' },
    supervisor: { name: `Supervisor e2e ${tag}`, role: 'supervisor', gender: 'male' },
  } as const

  const accounts: Record<string, { email: string; password: string; profileId: string }> = {}

  for (const [key, person] of Object.entries(people)) {
    const email = `${key}.${tag}@e2e.cuidar.local`
    const password = `E2e-${tag}-senha1`

    const { data: profile, error } = await admin
      .from('profiles')
      .insert({ full_name: person.name, role: person.role, care_gender: person.gender })
      .select()
      .single()
    if (error) throw error

    await admin
      .from('group_memberships')
      .insert({ group_id: group!.id, profile_id: profile.id, role: person.role })

    await darAcesso(admin, profile.id, email, password)

    accounts[key] = { email, password, profileId: profile.id }
  }

  // No mundo dos testes, quem lidera tambem responde pelo sistema: e a marca
  // que libera publicar devocional. Vai pela conexao direta porque um gatilho
  // recusa a escrita da marca vinda da API - inclusive a nossa.
  await marcarComoAdmin(accounts.leader!.profileId)

  // Discipulado fixo: o cuidado do discipulo pertence ao lider.
  await admin.from('discipleship_links').insert({
    disciple_id: accounts.disciple.profileId,
    leader_id: accounts.leader.profileId,
  })

  const { data: week } = await admin
    .from('care_weeks')
    .insert({
      group_id: group!.id,
      starts_on: '2026-08-24',
      ends_on: '2026-08-30',
      seed: `e2e-${tag}`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select()
    .single()

  await admin.from('care_assignments').insert([
    // Cuidado fixo do lider com seu discipulo.
    {
      week_id: week!.id,
      caregiver_id: accounts.leader.profileId,
      cared_for_id: accounts.disciple.profileId,
      origin: 'fixed_disciple',
    },
    // Irmao recebido pelo lider no rodizio.
    {
      week_id: week!.id,
      caregiver_id: accounts.leader.profileId,
      cared_for_id: accounts.memberA.profileId,
      origin: 'rotation',
    },
    // Cuidado do discipulo, usado nos testes de contato e transferencia.
    {
      week_id: week!.id,
      caregiver_id: accounts.disciple.profileId,
      cared_for_id: accounts.memberB.profileId,
      origin: 'rotation',
    },
  ])

  // Rascunho separado, para o teste de publicacao.
  const { data: draft } = await admin
    .from('care_weeks')
    .insert({
      group_id: group!.id,
      starts_on: '2026-08-31',
      ends_on: '2026-09-06',
      seed: `e2e-draft-${tag}`,
      status: 'draft',
      generation_report: { pools: [], warnings: [], extraSlots: [] },
    })
    .select()
    .single()

  await admin.from('care_assignments').insert({
    week_id: draft!.id,
    caregiver_id: accounts.disciple.profileId,
    cared_for_id: accounts.memberB.profileId,
    origin: 'rotation',
  })

  writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        ready: true,
        tag,
        groupId: group!.id,
        weekId: week!.id,
        draftWeekId: draft!.id,
        accounts,
        names: Object.fromEntries(Object.entries(people).map(([k, v]) => [k, v.name])),
      },
      null,
      2,
    ),
  )

  // A conexao direta com o Postgres so existe para apagar contas; sem fechar,
  // o Playwright ficaria esperando um handle aberto.
  await encerrar()
}

/**
 * Cada execucao cria o proprio GC de teste. Limpamos os anteriores para que uma
 * semana antiga nunca seja confundida com a semana desta rodada.
 */
/**
 * O sinal e a escrita precisam ser da mesma transacao, e uma consulta com
 * parametro so aceita um comando - por isso o bloco anonimo, com o
 * identificador conferido antes de entrar nele.
 */
async function marcarComoAdmin(profileId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) throw new Error('identificador inesperado')
  await sql(`do $$ begin
    perform set_config('app.definindo_admin', 'on', true);
    update public.profiles set is_admin = true where id = '${profileId}';
  end $$;`)
}

async function removePreviousRuns(admin: LocalClient) {
  const { data: leftovers } = await admin
    .from('profiles')
    .select('id, user_id')
    .like('full_name', '%e2e %')

  const ids = (leftovers ?? []).map((row) => row.id)

  if (ids.length > 0) {
    const { data: weeks } = await admin.from('care_weeks').select('id')
    for (const week of weeks ?? []) {
      await admin.from('care_assignments').delete().eq('week_id', week.id).in('caregiver_id', ids)
      await admin.from('care_assignments').delete().eq('week_id', week.id).in('cared_for_id', ids)
    }
    await admin.from('supervision_notes').delete().in('supervisor_id', ids)
    await admin.from('supervision_requests').delete().in('requester_id', ids)
    await admin.from('discipleship_links').delete().in('disciple_id', ids)
    await admin.from('activity_assignees').delete().in('profile_id', ids)
    await admin.from('notifications').delete().in('profile_id', ids)
    await admin.from('invites').delete().in('profile_id', ids)
    await admin.from('group_memberships').delete().in('profile_id', ids)
  }

  const { data: groups } = await admin.from('groups').select('id').like('name', 'GC e2e %')
  for (const group of groups ?? []) {
    const { data: weeks } = await admin.from('care_weeks').select('id').eq('group_id', group.id)
    for (const week of weeks ?? []) {
      await admin.from('care_assignments').delete().eq('week_id', week.id)
    }
    await admin.from('care_weeks').delete().eq('group_id', group.id)
    await admin.from('activities').delete().eq('group_id', group.id)
    await admin.from('supervision_requests').delete().eq('group_id', group.id)
    await admin.from('group_memberships').delete().eq('group_id', group.id)
    await admin.from('groups').delete().eq('id', group.id)
  }

  if (ids.length > 0) {
    await admin.from('profiles').delete().in('id', ids)
    for (const row of leftovers ?? []) {
      if (row.user_id) await removerConta(row.user_id)
    }
  }
}

mkdirSync(HERE, { recursive: true })
