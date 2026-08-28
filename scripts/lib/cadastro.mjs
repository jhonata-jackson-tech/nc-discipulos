/**
 * Cadastro de integrante: completa quem ja existe, cria quem falta, vincula ao
 * GC e devolve o link de convite.
 *
 * Fica separado dos dois scripts que o usam - o de uma pessoa e o de lote -
 * para nao existirem duas versoes da mesma regra.
 *
 * O que este modulo **nao** faz: confirmar genero de cuidado e ligar
 * discipulado. Essas duas coisas sao um ato deliberado da lideranca, pessoa a
 * pessoa, e tem lugar proprio no assistente de primeiros passos.
 */
import { randomUUID } from 'node:crypto'
import { sha256 } from './local.mjs'

const PAPEIS = ['leader', 'supervisor', 'disciple', 'member']

/** Aceita 21999999999, (21) 99999-9999 e 1997-01-22 ou 22/01/1997. */
export const soDigitos = (valor) => (valor ? valor.replace(/\D/g, '') : null)

export const dataISO = (valor) => {
  if (!valor) return null
  const limpo = valor.trim()
  return limpo.includes('/') ? limpo.split('/').reverse().join('-') : limpo
}

async function procurar(admin, nome) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, user_id')
    .eq('full_name', nome)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

export async function grupoPadrao(admin) {
  const { data, error } = await admin.from('groups').select('id, name').order('created_at').limit(1)
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Nenhum GC no banco. Rode as migrations e o seed primeiro.')
  return data[0]
}

/**
 * @returns {Promise<{nome: string, acao: string, link: string|null}>}
 */
export async function cadastrar(admin, grupo, pessoa) {
  const nome = pessoa.nome?.trim()
  const email = pessoa.email?.trim().toLowerCase()
  const papel = pessoa.papel?.trim() || 'member'

  if (!nome) throw new Error('Falta o nome completo.')
  if (!email || !email.includes('@')) throw new Error(`E-mail inválido para ${nome}.`)
  if (!PAPEIS.includes(papel)) throw new Error(`Papel inválido para ${nome}: ${papel}`)

  // `atual` e o nome como esta hoje no sistema: completa em vez de duplicar.
  let registro = (await procurar(admin, pessoa.atual?.trim() || nome)) ?? null
  if (!registro && pessoa.atual) registro = await procurar(admin, nome)

  const dados = {
    full_name: nome,
    email,
    phone: soDigitos(pessoa.whatsapp),
    birth_date: dataISO(pessoa.nascimento),
    role: papel,
  }

  // O e-mail e unico entre os integrantes ativos. Bater nessa trave quase
  // sempre significa a mesma pessoa cadastrada duas vezes - vale dizer quem e,
  // em vez de devolver o nome do indice.
  const duplicado = async () => {
    const { data } = await admin
      .from('profiles')
      .select('full_name')
      .ilike('email', email)
      .is('deleted_at', null)
    const outro = data?.find((p) => p.full_name !== nome)
    return outro
      ? `este e-mail já está no cadastro de "${outro.full_name}". É a mesma pessoa? Use a coluna "atual" com esse nome.`
      : 'este e-mail já está em uso.'
  }

  let acao
  if (registro) {
    const { error } = await admin.from('profiles').update(dados).eq('id', registro.id)
    if (error) throw new Error(error.code === '23505' ? await duplicado() : error.message)
    acao = pessoa.atual && pessoa.atual !== nome ? 'completado (nome ajustado)' : 'completado'
  } else {
    const { data, error } = await admin.from('profiles').insert(dados).select('id, user_id').single()
    if (error) throw new Error(error.code === '23505' ? await duplicado() : error.message)
    registro = data
    acao = 'criado'
  }

  const { data: vinculo } = await admin
    .from('group_memberships')
    .select('id')
    .eq('group_id', grupo.id)
    .eq('profile_id', registro.id)
    .is('left_at', null)

  if (!vinculo?.length) {
    const { error } = await admin
      .from('group_memberships')
      .insert({ group_id: grupo.id, profile_id: registro.id, role: papel })
    if (error) throw new Error(error.message)
  }

  if (registro.user_id) {
    return { nome, acao: `${acao} (já tem acesso)`, link: null }
  }

  // Um convite pendente por pessoa: o anterior perde a validade.
  await admin.from('invites').delete().eq('profile_id', registro.id).eq('status', 'pending')

  const token = randomUUID().replace(/-/g, '')
  const { error } = await admin
    .from('invites')
    .insert({ profile_id: registro.id, email, token_hash: sha256(token) })
  if (error) throw new Error(error.message)

  const site = (pessoa.site ?? 'http://localhost:5173').replace(/\/$/, '')
  return {
    nome,
    acao,
    link: `${site}/convite?token=${token}&email=${encodeURIComponent(email)}`,
  }
}
