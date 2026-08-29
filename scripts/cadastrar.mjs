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
 *     --papel disciple \
 *     --lider "Nome do Lider" \
 *     --site https://discipulos.exemplo.com.br \
 *     --senha SenhaProvisoria
 *
 * Com `--senha`, a conta ja nasce criada com ela e a troca obrigatoria no
 * primeiro acesso. Sem, o retorno e o link de convite. \
 *     --senha SenhaProvisoria
 *
 * Com `--senha`, a conta ja nasce criada com ela e a troca obrigatoria no
 * primeiro acesso. Sem, o retorno e o link de convite.
 *
 * `--atual "Nome como esta no sistema"` renomeia em vez de duplicar - util
 * para completar alguem que ja veio no seed com o nome curto.
 *
 * Genero de cuidado nao entra aqui: e um ato deliberado da lideranca, pessoa a
 * pessoa, no assistente de primeiros passos.
 */
import { adminClient, configurado, encerrar } from './lib/local.mjs'
import { cadastrar, grupoPadrao } from './lib/cadastro.mjs'

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
const site = (args.site ?? process.env.SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const senhaProvisoria = args.senha ?? null

if (senhaProvisoria && senhaProvisoria.length < 8) {
  console.error('A senha provisória precisa ter pelo menos 8 caracteres.')
  process.exit(1)
}

if (!['leader', 'supervisor', 'disciple', 'member'].includes(papel)) {
  console.error(`Papel inválido: ${papel}. Use leader, supervisor, disciple ou member.`)
  process.exit(1)
}
const admin = adminClient()
const grupo = await grupoPadrao(admin)

const resultado = await cadastrar(admin, grupo, {
  atual: args.atual,
  nome,
  email,
  whatsapp: args.whatsapp,
  nascimento: args.nascimento,
  papel,
  site,
  senhaProvisoria,
})

console.log(`→ ${resultado.nome}: ${resultado.acao}`)

// O discipulado e um ato da lideranca e tem lugar proprio no assistente, mas
// quando o vinculo ja e conhecido daqui, poupa uma volta.
if (args.lider) {
  const { data: lideres } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('full_name', args.lider)
    .is('deleted_at', null)
  const lider = lideres?.[0]
  if (!lider) throw new Error(`Líder não encontrado: ${args.lider}`)

  const { data: pessoas } = await admin
    .from('profiles')
    .select('id')
    .eq('full_name', nome)
    .is('deleted_at', null)

  const { data: atual } = await admin
    .from('discipleship_links')
    .select('id, leader_id')
    .eq('disciple_id', pessoas[0].id)
    .is('ended_on', null)

  if (atual?.[0]?.leader_id !== lider.id) {
    if (atual?.length) {
      await admin
        .from('discipleship_links')
        .update({ ended_on: new Date().toISOString().slice(0, 10) })
        .eq('id', atual[0].id)
    }
    // O banco recusa gêneros diferentes e exige os dois confirmados.
    const { error } = await admin
      .from('discipleship_links')
      .insert({ disciple_id: pessoas[0].id, leader_id: lider.id })
    if (error) throw new Error(error.message)
    console.log(`→ ${nome}: discipulado de ${lider.full_name}`)
  }
}

if (resultado.link) {
  console.log(`\n✓ Link de acesso (vale 14 dias, uso único):\n  ${resultado.link}\n`)
} else if (resultado.senha) {
  console.log(`\n✓ Acesso criado para ${nome}`)
  console.log(`  Endereço: ${site}`)
  console.log(`  Senha provisória: ${resultado.senha}`)
  console.log('  No primeiro acesso o sistema exige que ela crie a própria senha.\n')
} else {
  console.log(`\n✓ ${nome} já tem acesso ao sistema.\n`)
}

await encerrar()
