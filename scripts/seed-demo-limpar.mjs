/**
 * Desfaz o `npm run demo`: apaga tudo o que a demonstração criou e devolve os
 * integrantes ao estado do seed - sem gênero de cuidado confirmado, sem
 * discipulado e sem acesso.
 *
 *   node scripts/seed-demo-limpar.mjs
 */
import { adminClient, configurado, encerrar, removerConta } from './lib/local.mjs'

if (!configurado) {
  console.error('Defina DATABASE_URL e JWT_SECRET no .env (veja .env.example).')
  process.exit(1)
}

const admin = adminClient()

const { data: grupo, error } = await admin
  .from('groups')
  .select('id')
  .eq('name', 'GC Novos Comecos')
  .single()
if (error) throw error

const { data: vinculos } = await admin
  .from('group_memberships')
  .select('profile_id')
  .eq('group_id', grupo.id)
const ids = vinculos.map((v) => v.profile_id)

console.log('→ apagando semanas, cuidados e contatos')
const { data: semanas } = await admin.from('care_weeks').select('id').eq('group_id', grupo.id)
for (const semana of semanas ?? []) {
  const { data: cuidados } = await admin
    .from('care_assignments')
    .select('id')
    .eq('week_id', semana.id)
  for (const cuidado of cuidados ?? []) {
    await admin.from('transfer_requests').delete().eq('assignment_id', cuidado.id)
    await admin.from('contact_logs').delete().eq('assignment_id', cuidado.id)
  }
  await admin.from('care_assignments').delete().eq('week_id', semana.id)
}
await admin.from('care_weeks').delete().eq('group_id', grupo.id)

console.log('→ apagando visitantes e as chamadas do GC')
// As conversas com o visitante e as marcas da chamada saem por cascata.
await admin.from('visitors').delete().eq('group_id', grupo.id)
await admin.from('gc_meetings').delete().eq('group_id', grupo.id)

console.log('→ apagando atividades, supervisão e avisos')
const { data: atividades } = await admin.from('activities').select('id').eq('group_id', grupo.id)
for (const atividade of atividades ?? []) {
  await admin.from('activity_assignees').delete().eq('activity_id', atividade.id)
}
await admin.from('activities').delete().eq('group_id', grupo.id)

const { data: solicitacoes } = await admin
  .from('supervision_requests')
  .select('id')
  .eq('group_id', grupo.id)
for (const solicitacao of solicitacoes ?? []) {
  await admin.from('supervision_notes').delete().eq('request_id', solicitacao.id)
}
await admin.from('supervision_requests').delete().eq('group_id', grupo.id)

await admin.from('notifications').delete().in('profile_id', ids)
await admin.from('audit_logs').delete().in('actor_id', ids)

console.log('→ removendo acessos, discipulado e dados de demonstração')
await admin.from('discipleship_links').delete().in('disciple_id', ids)
await admin.from('invites').delete().in('profile_id', ids)
await admin.from('member_notes').delete().in('profile_id', ids)
await admin.from('pairing_restrictions').delete().eq('group_id', grupo.id)

const { data: pessoas } = await admin.from('profiles').select('id, user_id').in('id', ids)

await admin
  .from('profiles')
  .update({
    care_gender: null,
    salutation: null,
    birth_date: null,
    phone: null,
    email: null,
    user_id: null,
  })
  .in('id', ids)

for (const pessoa of pessoas ?? []) {
  if (pessoa.user_id) await removerConta(pessoa.user_id)
}

await admin.from('groups').update({ setup_completed_at: null }).eq('id', grupo.id)

await encerrar()

console.log('\n✓ banco devolvido ao estado do seed.')
console.log('Remova a linha VITE_DEMO_ACCOUNTS do .env.local para esconder o seletor de perfil.\n')
