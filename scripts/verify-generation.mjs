/**
 * Verificacao ponta a ponta da geracao semanal.
 *
 * Cria um GC de teste com o mesmo formato do GC real (2 lideres, 6 discipulos,
 * 23 irmaos), chama a Edge Function `generate-week` com o token de um lider e
 * confere o resultado gravado no banco.
 *
 *   npx supabase start
 *   npx supabase functions serve generate-week
 *   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-generation.mjs
 */
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANON || !SERVICE) {
  console.error('Defina SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY (veja `npx supabase status`).')
  process.exit(1)
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const tag = randomUUID().slice(0, 6)

function fail(message) {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

const { data: group, error: groupError } = await admin
  .from('groups')
  .insert({ name: `GC de verificacao ${tag}` })
  .select()
  .single()
if (groupError) throw groupError

async function person(name, role, careGender) {
  const { data, error } = await admin
    .from('profiles')
    .insert({ full_name: `${name} ${tag}`, role, care_gender: careGender })
    .select()
    .single()
  if (error) throw error
  await admin.from('group_memberships').insert({ group_id: group.id, profile_id: data.id, role })
  return data
}

const leaderM = await person('Lider', 'leader', 'male')
const leaderF = await person('Lider', 'leader', 'female')

const disciplesM = []
for (let i = 0; i < 3; i++) disciplesM.push(await person(`Discipulo ${i}`, 'disciple', 'male'))
const disciplesF = []
for (let i = 0; i < 3; i++) disciplesF.push(await person(`Discipula ${i}`, 'disciple', 'female'))

for (let i = 0; i < 12; i++) await person(`Irmao ${i}`, 'member', 'male')
for (let i = 0; i < 11; i++) await person(`Irma ${i}`, 'member', 'female')
await person('Supervisor', 'supervisor', 'male')

for (const disciple of disciplesM) {
  await admin.from('discipleship_links').insert({ disciple_id: disciple.id, leader_id: leaderM.id })
}
for (const disciple of disciplesF) {
  await admin.from('discipleship_links').insert({ disciple_id: disciple.id, leader_id: leaderF.id })
}

// Conta de lider criada pelo fluxo real de convite.
const email = `lider.${tag}@verificacao.local`
const password = `Verificacao-${tag}-1`
const token = randomUUID().replace(/-/g, '')
await admin.from('invites').insert({ profile_id: leaderM.id, email, token_hash: sha256(token) })

const anon = createClient(URL, ANON, { auth: { persistSession: false } })
const { error: signUpError } = await anon.auth.signUp({
  email,
  password,
  options: { data: { invite_token: token } },
})
if (signUpError) throw signUpError

const { data: auth } = await anon.auth.signInWithPassword({ email, password })

const response = await fetch(`${URL}/functions/v1/generate-week`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${auth.session.access_token}`,
    apikey: ANON,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ groupId: group.id, startsOn: '2026-09-07' }),
})

const body = await response.json()
if (!response.ok) {
  fail(`a Edge Function respondeu ${response.status}: ${JSON.stringify(body)}`)
  process.exit(1)
}

const { data: rows } = await admin
  .from('care_assignments')
  .select(
    `caregiver:profiles!care_assignments_caregiver_id_fkey(full_name, care_gender),
     cared_for:profiles!care_assignments_cared_for_id_fkey(full_name, care_gender)`,
  )
  .eq('week_id', body.weekId)

const cross = rows.filter((row) => row.caregiver.care_gender !== row.cared_for.care_gender)
const caredFor = rows.map((row) => row.cared_for.full_name)

const loads = {}
for (const row of rows) {
  const key = `${row.caregiver.full_name} (${row.caregiver.care_gender})`
  loads[key] = (loads[key] ?? 0) + 1
}

console.log(`\n29 pessoas cuidadas, 8 cuidadores — semana ${body.weekId}\n`)
console.table(loads)

if (rows.length !== 29) fail(`esperava 29 cuidados, encontrei ${rows.length}`)
if (cross.length !== 0) fail(`${cross.length} cuidado(s) entre generos diferentes`)
if (new Set(caredFor).size !== caredFor.length) fail('alguem foi cuidado duas vezes na mesma semana')

for (const pool of body.pools) {
  if (pool.caredForCount === 0) continue
  const totals = pool.loads.map((load) => load.total)
  const spread = Math.max(...totals) - Math.min(...totals)
  if (spread > 1) fail(`carga desequilibrada no pool ${pool.gender} (diferenca de ${spread})`)
}

const fixed = rows.filter(
  (row) =>
    row.caregiver.full_name.startsWith('Lider') && row.cared_for.full_name.startsWith('Discipul'),
)
if (fixed.length !== 6) fail(`esperava 6 cuidados fixos de discipulado, encontrei ${fixed.length}`)

// Limpeza.
await admin.from('care_assignments').delete().eq('week_id', body.weekId)
await admin.from('care_weeks').delete().eq('group_id', group.id)
const { data: created } = await admin
  .from('group_memberships')
  .select('profile_id')
  .eq('group_id', group.id)
const ids = created.map((row) => row.profile_id)
await admin.from('discipleship_links').delete().in('disciple_id', ids)
await admin.from('invites').delete().in('profile_id', ids)
await admin.from('group_memberships').delete().eq('group_id', group.id)
const { data: users } = await admin.from('profiles').select('user_id').in('id', ids)
await admin.from('profiles').delete().in('id', ids)
await admin.from('groups').delete().eq('id', group.id)
for (const user of users ?? []) {
  if (user.user_id) await admin.auth.admin.deleteUser(user.user_id)
}

if (process.exitCode) {
  console.error('\n✗ a geracao nao respeitou as regras.')
} else {
  console.log('✓ geracao correta: dois pools independentes, carga equilibrada e discipulado fixo.')
}
