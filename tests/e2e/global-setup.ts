import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const STATE_FILE = resolve(HERE, '.state.json')

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/**
 * Prepara um GC de teste completo: lideranca, discipulado, irmaos, uma semana
 * publicada e as atribuicoes que os testes vao exercitar.
 */
export default async function globalSetup() {
  if (!ANON_KEY || !SERVICE_ROLE_KEY) {
    writeFileSync(STATE_FILE, JSON.stringify({ ready: false }))
    console.warn(
      '\n[e2e] SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY ausentes: os testes serão pulados.\n',
    )
    return
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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

    const token = randomUUID().replace(/-/g, '')
    await admin.from('invites').insert({ profile_id: profile.id, email, token_hash: sha256(token) })

    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: signUpError } = await anon.auth.signUp({
      email,
      password,
      options: { data: { invite_token: token } },
    })
    if (signUpError) throw signUpError

    accounts[key] = { email, password, profileId: profile.id }
  }

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
}

/**
 * Cada execucao cria o proprio GC de teste. Limpamos os anteriores para que uma
 * semana antiga nunca seja confundida com a semana desta rodada.
 */
async function removePreviousRuns(admin: SupabaseClient) {
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
      if (row.user_id) await admin.auth.admin.deleteUser(row.user_id)
    }
  }
}

mkdirSync(HERE, { recursive: true })
