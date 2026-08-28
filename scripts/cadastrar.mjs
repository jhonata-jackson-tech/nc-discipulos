/**
 * Cadastra (ou completa) um integrante e devolve o link de convite.
 *
 * Existe para o comeco, quando ainda nao ha ninguem logado para usar a tela de
 * Integrantes. Depois que a lideranca tem acesso, o caminho normal e o proprio
 * sistema - este script nao faz nada que a interface nao faca.
 *
 *   node scripts/cadastrar.mjs \
 *     --nome "Fulano de Tal" --email fulano@exemplo.com \
 *     --whatsapp 21999999999 --nascimento 1996-03-21 \
 *     --papel disciple --genero male \
 *     --lider "Nome do Lider" \
 *     --site https://discipulos.exemplo.com.br
 *
 * `--atual "Nome como esta no sistema"` renomeia em vez de duplicar - util
 * para completar alguem que ja veio no seed com o nome curto.
 */
import { adminClient, configurado, encerrar, sha256 } from './lib/local.mjs'
import { randomUUID } from 'node:crypto'

if (!configurado) {
  console.error('Defina DATABASE_URL e JWT_SECRET no .env (veja .env.example).')
  process.exit(1)
}

// ------------------------------------------------------------------ entrada
const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  const chave = process.argv[i]?.replace(/^--/, '')
  if (chave) args[chave] = process.argv[i + 1]
}

const obrigatorio = (campo) => {
  if (!args[campo]) {
    console.error(`Falta --${campo}. Veja o cabeçalho do arquivo para o uso completo.`)
    process.exit(1)
  }
  return args[campo]
}

const nome = obrigatorio('nome')
const email = obrigatorio('email').trim().toLowerCase()
const papel = args.papel ?? 'member'
const genero = args.genero ?? null
const site = (args.site ?? process.env.SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '')

if (!['leader', 'supervisor', 'disciple', 'member'].includes(papel)) {
  console.error(`Papel inválido: ${papel}. Use leader, supervisor, disciple ou member.`)
  process.exit(1)
}
if (genero && !['male', 'female'].includes(genero)) {
  console.error(`Gênero de cuidado inválido: ${genero}. Use male ou female.`)
  process.exit(1)
}

/** Aceita 21999999999, (21) 99999-9999 e 1996-03-21 ou 21/03/1996. */
const telefone = args.whatsapp ? args.whatsapp.replace(/\D/g, '') : null
const nascimento = args.nascimento?.includes('/')
  ? args.nascimento.split('/').reverse().join('-')
  : (args.nascimento ?? null)

const admin = adminClient()
const grupo = await (async () => {
  const { data, error } = await admin.from('groups').select('id, name').order('created_at').limit(1)
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Nenhum GC no banco. Rode as migrations e o seed primeiro.')
  return data[0]
})()

// ----------------------------------------------------------------- cadastro
const procurar = async (valor) => {
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, user_id')
    .eq('full_name', valor)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

let pessoa = (await procurar(args.atual ?? nome)) ?? (args.atual ? await procurar(nome) : null)

const dados = {
  full_name: nome,
  email,
  phone: telefone,
  birth_date: nascimento,
  role: papel,
  care_gender: genero,
  salutation: genero ? (genero === 'male' ? 'irmao' : 'irma') : null,
}

if (pessoa) {
  const { error } = await admin.from('profiles').update(dados).eq('id', pessoa.id)
  if (error) throw new Error(error.message)
  console.log(`→ ${nome}: cadastro atualizado`)
} else {
  const { data, error } = await admin.from('profiles').insert(dados).select('id, user_id').single()
  if (error) throw new Error(error.message)
  pessoa = data
  console.log(`→ ${nome}: cadastro criado`)
}

// Vinculo com o GC: e dele que saem semana, atividades e integrantes.
const { data: vinculo } = await admin
  .from('group_memberships')
  .select('id')
  .eq('group_id', grupo.id)
  .eq('profile_id', pessoa.id)
  .is('left_at', null)

if (!vinculo?.length) {
  const { error } = await admin
    .from('group_memberships')
    .insert({ group_id: grupo.id, profile_id: pessoa.id, role: papel })
  if (error) throw new Error(error.message)
  console.log(`→ ${nome}: vinculado ao ${grupo.name}`)
}

// ----------------------------------------------------------------- discipulado
if (args.lider) {
  const lider = await procurar(args.lider)
  if (!lider) throw new Error(`Líder não encontrado: ${args.lider}`)

  const { data: atual } = await admin
    .from('discipleship_links')
    .select('id, leader_id')
    .eq('disciple_id', pessoa.id)
    .is('ended_on', null)

  if (atual?.[0]?.leader_id !== lider.id) {
    if (atual?.length) {
      await admin
        .from('discipleship_links')
        .update({ ended_on: new Date().toISOString().slice(0, 10) })
        .eq('id', atual[0].id)
    }
    // O banco recusa gêneros diferentes: a regra não depende deste script.
    const { error } = await admin
      .from('discipleship_links')
      .insert({ disciple_id: pessoa.id, leader_id: lider.id })
    if (error) throw new Error(error.message)
    console.log(`→ ${nome}: discipulado de ${lider.full_name}`)
  }
}

// -------------------------------------------------------------------- convite
if (pessoa.user_id) {
  console.log(`\n✓ ${nome} já tem acesso ao sistema. Nada de convite a fazer.\n`)
} else {
  await admin.from('invites').delete().eq('profile_id', pessoa.id).eq('status', 'pending')

  const token = randomUUID().replace(/-/g, '')
  const { error } = await admin
    .from('invites')
    .insert({ profile_id: pessoa.id, email, token_hash: sha256(token) })
  if (error) throw new Error(error.message)

  const link = `${site}/convite?token=${token}&email=${encodeURIComponent(email)}`
  console.log(`\n✓ ${nome}\n  Link de acesso (vale 14 dias, uso único):\n  ${link}\n`)
}

await encerrar()
