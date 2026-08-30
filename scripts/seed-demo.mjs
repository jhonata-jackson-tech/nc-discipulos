/**
 * Popula o GC com dados de DEMONSTRAÇÃO, para dar o que olhar durante a
 * avaliação do produto: gêneros de cuidado, discipulado, duas semanas de
 * cuidado com contatos registrados, atividades, transferências, solicitações
 * de supervisão, notificações e aniversários.
 *
 * IMPORTANTE
 * Os gêneros de cuidado atribuídos aqui são um chute de demonstração. O produto
 * existe justamente para que essa informação seja confirmada pessoa a pessoa
 * pela liderança - por isso cada integrante recebe uma nota administrativa
 * avisando disso, e `npm run demo:limpar` devolve tudo ao estado do seed.
 *
 *   node scripts/seed-demo.mjs
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { adminClient, configurado, darAcesso, entrar, gerarSemana } from './lib/local.mjs'

if (!configurado) {
  console.error('Defina DATABASE_URL e JWT_SECRET no .env (veja .env.example).')
  process.exit(1)
}

const admin = adminClient()

const AVISO_GENERO =
  'Gênero de cuidado preenchido pelo seed de demonstração. Confirme com a pessoa antes de usar de verdade.'

// --------------------------------------------------------------- utilidades
const iso = (date) => date.toISOString().slice(0, 10)
const segundaDaSemana = (offsetSemanas = 0) => {
  const hoje = new Date()
  const dia = hoje.getUTCDay()
  const diff = (dia - 1 + 7) % 7
  const segunda = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()))
  segunda.setUTCDate(segunda.getUTCDate() - diff + offsetSemanas * 7)
  return segunda
}
const somarDias = (date, dias) => {
  const copia = new Date(date)
  copia.setUTCDate(copia.getUTCDate() + dias)
  return copia
}

/** Sorteio reprodutível: a mesma execução produz sempre o mesmo cenário. */
let semente = 20260826
const aleatorio = () => {
  semente = (semente * 1103515245 + 12345) % 2147483648
  return semente / 2147483648
}
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)]

// ------------------------------------------------------- genero por pessoa
// Chute de demonstração, explicitamente marcado como tal no cadastro.
const MULHERES = new Set([
  'Jenifer Messias',
  'Larissa Lobo',
  'Letícia Azevedo',
  'Lethicia Motta',
  'Paty Praia',
  'Amanda (Diego)',
  'Camila',
  'Carla Robson',
  'Clara Machado',
  'Amanda Garcia (Matheus)',
  'Isabela Marques',
  'Rafaela Duque',
  'Raissa',
  'Ana Flávia',
])

const ANIVERSARIOS = {
  'Jhonata Jackson': '1993-04-12',
  'Jenifer Messias': '1995-09-02',
  'Letícia Azevedo': '1999-08-30',
  'Felipe Freitas': '1997-11-05',
  'Lethicia Motta': '2000-09-08',
  'Paty Praia': '1996-02-19',
  'Gabriel Ribeiro': '2001-06-23',
  'Victor Hugo Paty': '1998-12-01',
  Anderson: '1994-09-03',
  Camila: '2002-01-27',
  'David Cruz': '1991-09-14',
  Messias: '1988-07-30',
  'Ana Flávia': '2003-03-11',
  'Isabela Marques': '1999-10-09',
}

const TELEFONES = ['(21) 99999-0001', '(21) 99999-0002', '(21) 98888-0003', '(21) 97777-0004']

console.log('→ carregando o GC')
const { data: grupo, error: erroGrupo } = await admin
  .from('groups')
  .select('*')
  .eq('name', 'GC Novos Comecos')
  .single()
if (erroGrupo) throw erroGrupo

const { data: vinculos } = await admin
  .from('group_memberships')
  .select('profile_id')
  .eq('group_id', grupo.id)
const idsDoGrupo = vinculos.map((v) => v.profile_id)

const { data: pessoas, error: erroPessoas } = await admin
  .from('profiles')
  .select('*')
  .in('id', idsDoGrupo)
  .is('deleted_at', null)
if (erroPessoas) throw erroPessoas

const porNome = new Map(pessoas.map((p) => [p.full_name, p]))

// --------------------------------------------------- 1. dados dos integrantes
console.log('→ confirmando gênero de cuidado, aniversários e contatos')
for (const pessoa of pessoas) {
  const genero = MULHERES.has(pessoa.full_name) ? 'female' : 'male'
  const patch = {
    care_gender: genero,
    salutation: genero === 'female' ? 'irma' : 'irmao',
  }
  if (ANIVERSARIOS[pessoa.full_name]) patch.birth_date = ANIVERSARIOS[pessoa.full_name]
  if (aleatorio() > 0.55) patch.phone = escolher(TELEFONES)

  const { error } = await admin.from('profiles').update(patch).eq('id', pessoa.id)
  if (error) throw error

  await admin
    .from('member_notes')
    .upsert({ profile_id: pessoa.id, notes: AVISO_GENERO }, { onConflict: 'profile_id' })

  Object.assign(pessoa, patch)
}

// ----------------------------------------------------------- 2. discipulado
console.log('→ vinculando discípulos aos líderes do mesmo gênero')
const lider = porNome.get('Jhonata Jackson')
const liderMulher = porNome.get('Jenifer Messias')

await admin.from('discipleship_links').delete().in('disciple_id', idsDoGrupo)

for (const pessoa of pessoas.filter((p) => p.role === 'disciple')) {
  const primario = pessoa.care_gender === 'female' ? liderMulher : lider
  const { error } = await admin
    .from('discipleship_links')
    .insert({ disciple_id: pessoa.id, leader_id: primario.id })
  if (error) throw error
}

await admin
  .from('groups')
  .update({ setup_completed_at: new Date().toISOString() })
  .eq('id', grupo.id)

// -------------------------------------------------- 3. semanas e distribuição
console.log('→ gerando as semanas de cuidado')
const contaLider = await garantirAcesso('Jhonata Jackson', 'jhonata@cuidar.local', 'CuidarGC2026')

const semanas = [
  { inicio: segundaDaSemana(-1), status: 'closed' },
  { inicio: segundaDaSemana(0), status: 'published' },
  { inicio: segundaDaSemana(1), status: 'draft' },
]

const criadas = []
for (const semana of semanas) {
  const inicio = iso(semana.inicio)
  await admin.from('care_weeks').delete().eq('group_id', grupo.id).eq('starts_on', inicio)

  let corpo
  try {
    corpo = await gerarSemana(contaLider.token, { groupId: grupo.id, startsOn: inicio })
  } catch (falha) {
    console.error(`A geração de ${inicio} falhou:`, falha.message)
    console.error('O serviço está no ar? `docker compose ... up -d api`')
    process.exit(1)
  }

  if (semana.status !== 'draft') {
    await admin
      .from('care_weeks')
      .update({ status: 'published', published_at: new Date().toISOString(), published_by: lider.id })
      .eq('id', corpo.weekId)
  }
  if (semana.status === 'closed') {
    await admin
      .from('care_weeks')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', corpo.weekId)
  }

  criadas.push({ id: corpo.weekId, ...semana, inicio })
  console.log(`   ${inicio}: ${corpo.assignments} cuidados (${semana.status})`)
}

// --------------------------------------------------- 4. contatos registrados
console.log('→ registrando contatos, feedbacks e pontos de atenção')
const CANAIS = ['whatsapp', 'call', 'in_person', 'message', 'video']
const MOTIVOS_DE_FALTA = [
  'Viagem a trabalho',
  'Plantão no hospital',
  'Gripado',
  'Prova na faculdade',
]
const FEEDBACKS = [
  'Conversa boa, combinamos de nos ver no culto de domingo.',
  'Mandei mensagem e respondeu rápido. Está animado com o GC.',
  'Falei por áudio. Semana corrida no trabalho, mas está bem.',
  'Encontramos depois da reunião. Pediu oração pela família.',
  'Sem retorno até agora. Vou tentar de novo amanhã.',
  'Está passando por uma fase difícil no trabalho. Vamos acompanhar.',
  'Faltou nas últimas duas semanas. Disse que quer voltar.',
]

for (const semana of criadas.filter((s) => s.status !== 'draft')) {
  const { data: cuidados } = await admin
    .from('care_assignments')
    .select('id, caregiver_id')
    .eq('week_id', semana.id)

  const proporcao = semana.status === 'closed' ? 1 : 0.65

  for (const cuidado of cuidados) {
    if (aleatorio() > proporcao) continue

    const sorteio = aleatorio()
    const atencao = sorteio > 0.9 ? 'leader_action' : sorteio > 0.75 ? 'watch' : 'normal'
    const situacao =
      atencao === 'leader_action'
        ? 'needs_attention'
        : atencao === 'watch'
          ? 'follow_up'
          : sorteio > 0.55
            ? 'awaiting_reply'
            : 'contacted'

    const quandoContatou = iso(somarDias(semana.inicio, Math.floor(aleatorio() * 5)))
    const dataValida = quandoContatou > iso(new Date()) ? iso(new Date()) : quandoContatou

    await admin.from('contact_logs').insert({
      assignment_id: cuidado.id,
      author_id: cuidado.caregiver_id,
      contacted_on: dataValida,
      channel: escolher(CANAIS),
      got_reply: situacao !== 'awaiting_reply',
      feedback: escolher(FEEDBACKS),
      attention_level: atencao,
    })

    await admin
      .from('care_assignments')
      .update({
        status: situacao,
        attention_level: atencao,
        last_contact_at: new Date(`${dataValida}T18:00:00Z`).toISOString(),
      })
      .eq('id', cuidado.id)
  }
}

// ------------------------------------------------------------ 5. atividades
console.log('→ criando as atividades da semana')
const semanaAtual = criadas.find((s) => s.status === 'published')
await admin.from('activities').delete().eq('group_id', grupo.id)

const nomes = (lista) => lista.map((n) => porNome.get(n)).filter(Boolean)

const atividades = [
  {
    type: 'talk',
    title: 'Talk: gratidão em tempos difíceis',
    description: 'Conduzido em dupla, com 20 minutos de conversa aberta no fim.',
    status: 'in_progress',
    is_recurring: true,
    dias: 2,
    responsaveis: nomes(['Felipe Freitas', 'Letícia Azevedo']),
  },
  {
    type: 'snack',
    title: 'Lanche da semana',
    description: 'Algo simples: bolo, suco e café.',
    status: 'todo',
    is_recurring: true,
    dias: 2,
    responsaveis: nomes(['Carla Robson', 'Camila']),
  },
  {
    type: 'dynamic',
    title: 'Dinâmica de integração',
    description: 'Para os irmãos que chegaram nas últimas semanas.',
    status: 'todo',
    is_recurring: false,
    dias: 2,
    responsaveis: nomes(['Gabriel Ribeiro']),
  },
  {
    type: 'birthdays',
    title: 'Aniversariantes do mês',
    description: 'Separar o bolo e organizar o momento no fim da reunião.',
    status: 'done',
    is_recurring: true,
    dias: 1,
    responsaveis: nomes(['Paty Praia', 'Lethicia Motta']),
  },
  {
    type: 'other',
    title: 'Visita ao Robson',
    description: 'Está afastado há três semanas. Combinar com ele antes.',
    status: 'todo',
    is_recurring: false,
    dias: 4,
    responsaveis: nomes(['Jhonata Jackson', 'David Cruz']),
  },
]

for (const atividade of atividades) {
  const vencimento = somarDias(semanaAtual.inicio, atividade.dias)
  vencimento.setUTCHours(22, 0, 0, 0)

  const { data: criada, error } = await admin
    .from('activities')
    .insert({
      group_id: grupo.id,
      week_id: semanaAtual.id,
      type: atividade.type,
      title: atividade.title,
      description: atividade.description,
      status: atividade.status,
      is_recurring: atividade.is_recurring,
      due_at: vencimento.toISOString(),
      created_by: lider.id,
    })
    .select()
    .single()
  if (error) throw error

  for (const responsavel of atividade.responsaveis) {
    await admin
      .from('activity_assignees')
      .insert({ activity_id: criada.id, profile_id: responsavel.id })
  }
}

// -------------------------------------------------------- 6. transferências
console.log('→ criando pedidos de transferência')
const { data: cuidadosAtuais } = await admin
  .from('care_assignments')
  .select('id, caregiver_id, cared_for_id')
  .eq('week_id', semanaAtual.id)

const cuidadores = pessoas.filter((p) => ['leader', 'disciple'].includes(p.role))
const generoDe = new Map(pessoas.map((p) => [p.id, p.care_gender]))

const pendente = cuidadosAtuais.find((c) => {
  const genero = generoDe.get(c.cared_for_id)
  return cuidadores.some(
    (p) => p.care_gender === genero && p.id !== c.caregiver_id && p.id !== c.cared_for_id,
  )
})

if (pendente) {
  const genero = generoDe.get(pendente.cared_for_id)
  const destinatario = cuidadores.find(
    (p) => p.care_gender === genero && p.id !== pendente.caregiver_id && p.id !== pendente.cared_for_id,
  )

  await admin.from('transfer_requests').insert({
    assignment_id: pendente.id,
    requester_id: pendente.caregiver_id,
    recipient_id: destinatario.id,
    reason: 'Vou viajar nesta semana e não consigo dar a atenção que a pessoa merece.',
  })

  await admin.from('notifications').insert({
    profile_id: destinatario.id,
    type: 'transfer_requested',
    title: 'Pedido de transferência de cuidado',
    body: 'Alguém pediu que você assuma um cuidado nesta semana.',
    link: '/minha-semana',
  })
}

// --------------------------------------------------------- 7. supervisão
console.log('→ abrindo conversas com a supervisão')
await admin.from('supervision_requests').delete().eq('group_id', grupo.id)

const supervisor = porNome.get('Rolian Martins')
const supervisora = porNome.get('Larissa Lobo')

await admin.from('supervision_requests').insert([
  {
    group_id: grupo.id,
    requester_id: porNome.get('Felipe Freitas').id,
    supervisor_id: supervisor.id,
    confidential_to_supervisors: true,
    subject: 'Conversa sobre o meu momento',
    message:
      'Gostaria de conversar reservadamente sobre como tenho me sentido para cuidar dos irmãos.',
    urgency: 'normal',
    suggested_times: 'Terça à noite ou sábado de manhã',
    status: 'requested',
  },
  {
    group_id: grupo.id,
    requester_id: porNome.get('Letícia Azevedo').id,
    supervisor_id: supervisora.id,
    confidential_to_supervisors: false,
    subject: 'Ideias para a dinâmica do mês',
    message: 'Queria trocar uma ideia sobre as dinâmicas que temos feito no GC.',
    urgency: 'low',
    status: 'scheduled',
    seen_at: new Date().toISOString(),
    scheduled_for: somarDias(new Date(), 3).toISOString(),
  },
  {
    group_id: grupo.id,
    requester_id: lider.id,
    supervisor_id: null,
    confidential_to_supervisors: true,
    subject: 'Acompanhamento de um irmão do GC',
    message: 'Preciso de orientação sobre como acompanhar melhor um irmão que está se afastando.',
    urgency: 'high',
    status: 'seen',
    seen_at: new Date().toISOString(),
  },
])

// ------------------------------------------------------------ 8. visitantes
// Os dois caminhos que existem hoje - quem apareceu na sala e quem o GC Center
// mandou - mais um desfecho de cada tipo, para a tela ter o que mostrar em
// todas as abas.
console.log('→ cadastrando visitantes e as conversas com eles')
await admin.from('visitors').delete().eq('group_id', grupo.id)

const visitantes = [
  {
    full_name: 'Marcos Andrade',
    phone: '(11) 98812-4477',
    care_gender: 'male',
    origin: 'gc_center',
    first_visit_on: iso(somarDias(new Date(), -12)),
    notes: 'Chegou pelo GC Center. Mora a duas quadras do local do GC.',
    status: 'acompanhando',
    conversas: [
      { dias: -10, canal: 'whatsapp', intencao: 'vem', nota: 'Respondeu animado, disse que vem na quinta.' },
      { dias: -4, canal: 'call', intencao: 'vem', nota: 'Veio na semana passada e gostou. Perguntou do horário.' },
    ],
  },
  {
    full_name: 'Beatriz Camargo',
    phone: '(11) 99143-2081',
    care_gender: 'female',
    origin: 'convite',
    convidadaPor: 'Camila',
    first_visit_on: iso(somarDias(new Date(), -6)),
    notes: 'Veio com a Camila, colega de trabalho dela.',
    status: 'acompanhando',
    conversas: [
      { dias: -3, canal: 'message', intencao: 'nao_sabe', nota: 'Está em uma escala de plantão, vai tentar.' },
    ],
  },
  {
    full_name: 'Thiago Nunes',
    phone: null,
    care_gender: 'male',
    origin: 'organico',
    first_visit_on: iso(somarDias(new Date(), -3)),
    notes: 'Apareceu sozinho, veio a convite de um vizinho.',
    status: 'acompanhando',
    conversas: [],
  },
  {
    full_name: 'Renata Prado',
    phone: '(11) 97733-0092',
    care_gender: 'female',
    origin: 'gc_center',
    first_visit_on: iso(somarDias(new Date(), -31)),
    notes: 'Mora longe daqui; o GC do bairro dela atende melhor.',
    status: 'encerrado',
    motivo: 'Encaminhada para o GC do bairro dela, que fica a dez minutos da casa.',
    conversas: [
      { dias: -28, canal: 'whatsapp', intencao: 'nao_sabe', nota: 'Perguntou se tem GC mais perto.' },
    ],
  },
]

for (const visitante of visitantes) {
  const { data: linha, error: falha } = await admin
    .from('visitors')
    .insert({
      group_id: grupo.id,
      full_name: visitante.full_name,
      phone: visitante.phone,
      care_gender: visitante.care_gender,
      origin: visitante.origin,
      invited_by: visitante.convidadaPor ? porNome.get(visitante.convidadaPor).id : null,
      first_visit_on: visitante.first_visit_on,
      notes: visitante.notes,
      status: visitante.status,
      outcome_reason: visitante.motivo ?? null,
      closed_at: visitante.status === 'encerrado' ? new Date().toISOString() : null,
      closed_by: visitante.status === 'encerrado' ? lider.id : null,
      created_by: lider.id,
    })
    .select('id')
    .single()
  if (falha) throw falha

  for (const conversa of visitante.conversas) {
    await admin.from('visitor_contacts').insert({
      visitor_id: linha.id,
      author_id: lider.id,
      contacted_on: iso(somarDias(new Date(), conversa.dias)),
      channel: conversa.canal,
      coming_to_gc: conversa.intencao,
      notes: conversa.nota,
    })
  }
  visitante.id = linha.id
}

// ------------------------------------------------------- 9. chamada do GC
// Uma chamada por quinta, nas quatro semanas anteriores - e a de duas semanas
// atrás em uma sexta, para o histórico mostrar o GC que precisou mudar de dia.
console.log('→ registrando a presença dos últimos encontros')
await admin.from('gc_meetings').delete().eq('group_id', grupo.id)

const { data: elenco } = await admin
  .from('profiles')
  .select('id')
  .in('id', idsDoGrupo)
  .eq('status', 'active')
  .is('deleted_at', null)

const QUINTA = 4
for (let atras = 4; atras >= 1; atras -= 1) {
  // A quinta daquela semana; na de duas semanas atrás, a sexta.
  const segunda = segundaDaSemana(-atras)
  const dia = somarDias(segunda, atras === 2 ? QUINTA : QUINTA - 1)
  if (iso(dia) > iso(new Date())) continue

  const { data: encontro, error: falhaEncontro } = await admin
    .from('gc_meetings')
    .insert({
      group_id: grupo.id,
      week_id: criadas.find((s) => s.inicio === iso(segunda))?.id ?? null,
      held_on: iso(dia),
      notes: atras === 2 ? 'Adiado para sexta: o salão estava ocupado.' : null,
      registered_by: lider.id,
      registered_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (falhaEncontro) throw falhaEncontro

  await admin.from('gc_attendance').insert(
    elenco.map((pessoa) => {
      const sorteio = aleatorio()
      const marca = sorteio > 0.32 ? 'presente' : sorteio > 0.18 ? 'justificado' : 'ausente'
      return {
        meeting_id: encontro.id,
        profile_id: pessoa.id,
        mark: marca,
        justification: marca === 'justificado' ? escolher(MOTIVOS_DE_FALTA) : null,
      }
    }),
  )

  // Os visitantes que já tinham visitado até aquele dia aparecem na sala.
  const naSala = visitantes.filter(
    (v) => v.first_visit_on <= iso(dia) && v.status === 'acompanhando',
  )
  if (naSala.length > 0) {
    await admin.from('gc_attendance').insert(
      naSala.map((visitante) => ({
        meeting_id: encontro.id,
        visitor_id: visitante.id,
        mark: aleatorio() > 0.35 ? 'presente' : 'ausente',
      })),
    )
  }
}

// -------------------------------------------------------- 10. notificações
console.log('→ enviando avisos')
await admin.from('notifications').insert(
  cuidadores.slice(0, 6).map((pessoa) => ({
    profile_id: pessoa.id,
    type: 'week_published',
    title: 'Sua semana de cuidado está disponível',
    body: 'A liderança publicou a distribuição desta semana.',
    link: '/minha-semana',
  })),
)

// ------------------------------------------------------------ 11. acessos
console.log('→ criando os acessos de demonstração')
const contas = [
  { nome: 'Jhonata Jackson', papel: 'Líder', email: 'jhonata@cuidar.local' },
  { nome: 'Rolian Martins', papel: 'Supervisor', email: 'rolian@cuidar.local' },
  { nome: 'Felipe Freitas', papel: 'Discípulo', email: 'felipe@cuidar.local' },
  { nome: 'Letícia Azevedo', papel: 'Discípula', email: 'leticia@cuidar.local' },
  { nome: 'Anderson', papel: 'Irmão', email: 'anderson@cuidar.local' },
]

const SENHA = 'CuidarGC2026'
const criadasContas = []
for (const conta of contas) {
  await garantirAcesso(conta.nome, conta.email, SENHA)
  criadasContas.push({ ...conta, senha: SENHA })
}

gravarContasNoEnv(criadasContas)

console.log('\n✓ demonstração pronta\n')
console.table(criadasContas.map(({ papel, nome, email, senha }) => ({ papel, nome, email, senha })))
console.log(
  '\nOs gêneros de cuidado são um chute de demonstração e estão marcados como tal nas notas\n' +
    'de cada integrante. `npm run demo:limpar` devolve o banco ao estado do seed.\n',
)

// ============================================================== utilidades
async function garantirAcesso(nome, email, senha) {
  const { data: pessoa, error } = await admin
    .from('profiles')
    .select('id, user_id, email')
    .eq('full_name', nome)
    .is('deleted_at', null)
    .single()
  if (error) throw error

  if (!pessoa.user_id) {
    await darAcesso(admin, pessoa.id, email, senha)
  }

  const { sessao } = await entrar(pessoa.email ?? email, senha)
  return { token: sessao.access_token, profileId: pessoa.id }
}

/**
 * As contas de demonstração ficam no `.env.local` para o seletor de perfil da
 * barra lateral encontrá-las. Ele só existe em desenvolvimento.
 */
function gravarContasNoEnv(lista) {
  const caminho = '.env.local'
  // Aspas simples: o leitor de .env nao desfaz escapes de aspas duplas, e o
  // JSON quebraria na leitura. Nenhum dado aqui contem aspas simples.
  const linha = `VITE_DEMO_ACCOUNTS='${JSON.stringify(lista)}'`
  const conteudo = existsSync(caminho) ? readFileSync(caminho, 'utf8') : ''
  const semLinhaAntiga = conteudo
    .split('\n')
    .filter((l) => !l.startsWith('VITE_DEMO_ACCOUNTS='))
    .join('\n')
    .trimEnd()

  writeFileSync(caminho, `${semLinhaAntiga}\n\n# Contas de demonstração (apenas ambiente local).\n${linha}\n`)
}
