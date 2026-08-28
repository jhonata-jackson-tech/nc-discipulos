/**
 * Apoio dos scripts e dos testes que falam com o ambiente local.
 *
 * Aqui mora tudo o que antes vinha pronto do `supabase-js`: assinar um token,
 * montar um cliente de dados, criar acesso e entrar. E de proposito uma peca
 * so - scripts e testes usam exatamente o mesmo caminho que a aplicacao usa,
 * em vez de cada um ter a sua versao de "como autenticar".
 *
 * Precisa do compose de desenvolvimento no ar:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db migrate postgrest api
 */
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
import pg from 'pg'
import 'dotenv/config'

export const API_URL = process.env.API_URL ?? 'http://localhost:3001'
export const REST_URL = process.env.REST_URL ?? 'http://localhost:3002'
export const DATABASE_URL = process.env.DATABASE_URL ?? ''
const JWT_SECRET = process.env.JWT_SECRET ?? ''

/** Sem ambiente configurado, quem chama pula em vez de falhar. */
export const configurado = Boolean(DATABASE_URL && JWT_SECRET)

export const sha256 = (valor) => createHash('sha256').update(valor).digest('hex')

const base64url = (buffer) =>
  Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * Assina um JWT HS256 com o mesmo segredo do servidor. O PostgREST assume o
 * papel da claim `role`, e e assim que o script consegue ignorar a RLS para
 * preparar cenario - algo que a aplicacao nunca faz.
 */
export function assinarToken(claims, segundos = 3600) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + segundos }),
  )
  const assinatura = base64url(
    createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest(),
  )
  return `${header}.${payload}.${assinatura}`
}

export const tokenServico = () => assinarToken({ role: 'service_role' })

export function clienteComToken(token) {
  return new PostgrestClient(REST_URL, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** Cliente que ignora a RLS. So existe fora da aplicacao. */
export const adminClient = () => clienteComToken(tokenServico())

// --------------------------------------------------------------------- contas
async function chamarAuth(caminho, corpo) {
  const resposta = await fetch(`${API_URL}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const dados = resposta.status === 204 ? {} : await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error(dados.error ?? `Falha em ${caminho} (${resposta.status})`)
  return dados
}

export async function criarConta({ email, password, inviteToken }) {
  const sessao = await chamarAuth('/auth/signup', {
    email,
    password,
    invite_token: inviteToken,
  })
  return { sessao, client: clienteComToken(sessao.access_token) }
}

export async function entrar(email, password) {
  const sessao = await chamarAuth('/auth/login', { email, password })
  return { sessao, client: clienteComToken(sessao.access_token) }
}

/**
 * Emite um convite valido e conclui o primeiro acesso - o mesmo caminho que
 * uma pessoa real percorre, sem atalho que o produto nao tenha.
 */
export async function darAcesso(admin, profileId, email, password) {
  // So existe um convite pendente por pessoa. Em ambiente de desenvolvimento e
  // comum sobrar um de uma execucao interrompida: descartamos antes de emitir.
  await admin.from('invites').delete().eq('profile_id', profileId).eq('status', 'pending')

  const token = randomUUID().replace(/-/g, '')
  const { error } = await admin
    .from('invites')
    .insert({ profile_id: profileId, email, token_hash: sha256(token) })
  if (error) throw new Error(error.message)

  return criarConta({ email, password, inviteToken: token })
}

export async function gerarSemana(token, { groupId, startsOn }) {
  const resposta = await fetch(`${API_URL}/api/gerar-semana`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId, startsOn }),
  })
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    const erro = new Error(dados.error ?? `Falha ao gerar a semana (${resposta.status})`)
    erro.code = dados.code
    erro.details = dados.details
    throw erro
  }
  return dados
}

// ------------------------------------------------------------ acesso direto
// Remover uma conta e conferir o banco por fora sao operacoes que nao passam
// pela API: o schema `auth` nunca e publicado.
let pool

export function conexao() {
  pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 })
  return pool
}

export async function sql(texto, valores = []) {
  const { rows } = await conexao().query(texto, valores)
  return rows
}

export async function removerConta(userId) {
  await sql('delete from auth.users where id = $1', [userId])
}

export async function encerrar() {
  if (pool) await pool.end()
  pool = undefined
}
