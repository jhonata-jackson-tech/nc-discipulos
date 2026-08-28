/**
 * Verificacao ponta a ponta da geracao semanal.
 *
 * Cria um GC de teste com o mesmo formato do GC real (2 lideres, 6 discipulos,
 * 23 irmaos), pede a geracao ao servidor com o token de um lider e confere o
 * resultado gravado no banco.
 *
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
 *   node scripts/verify-generation.mjs
 */
import { randomUUID } from 'node:crypto'
import {
  adminClient,
  configurado,
  darAcesso,
  encerrar,
  gerarSemana,
  removerConta,
} from './lib/local.mjs'

if (!configurado) {
  console.error('Defina DATABASE_URL e JWT_SECRET no .env (veja .env.example).')
  process.exit(1)
}

const admin = adminClient()
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
const { sessao } = await darAcesso(admin, leaderM.id, email, password)

let body
try {
  body = await gerarSemana(sessao.access_token, { groupId: group.id, startsOn: '2026-09-07' })
} catch (falha) {
  fail(`o servidor recusou a geracao: ${falha.message}`)
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
  if (user.user_id) await removerConta(user.user_id)
}
await encerrar()

if (process.exitCode) {
  console.error('\n✗ a geracao nao respeitou as regras.')
} else {
  console.log('✓ geracao correta: dois pools independentes, carga equilibrada e discipulado fixo.')
}
