import { Router } from 'express'
import { pool } from '../db.ts'
import {
  issueSession,
  revokeAllForUser,
  revokeRefreshToken,
  rotateSession,
  signChangeToken,
  verifyChangeToken,
  type IssuedSession,
} from '../tokens.ts'
import { asyncRoute, HttpError, rateLimiter, requireSession, type AuthedRequest } from '../http.ts'
import { hashSenha, senhaConfere } from '../senha.ts'

export const authRouter = Router()

/** Tentativas **erradas** de senha, por e-mail e por IP: 10 a cada 15 minutos. */
const loginLimit = rateLimiter(10, 15 * 60_000)

interface Credentials {
  email?: unknown
  password?: unknown
}

function readCredentials(body: Credentials): { email: string; password: string } {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) throw new HttpError(400, 'Informe e-mail e senha.')
  return { email, password }
}

const sessionPayload = (session: IssuedSession) => ({
  access_token: session.accessToken,
  refresh_token: session.refreshToken,
  expires_at: session.expiresAt,
  user: session.user,
})

authRouter.post(
  '/login',
  asyncRoute(async (req, res) => {
    const { email, password } = readCredentials(req.body ?? {})
    const chave = `${req.ip}:${email}`
    loginLimit.check(chave)

    const { rows } = await pool.query<{
      id: string
      email: string
      encrypted_password: string
      must_change_password: boolean
    }>(
      `select id, email, encrypted_password, must_change_password from auth.users
        where lower(email) = $1`,
      [email],
    )

    const usuario = rows[0]
    // A verificacao roda mesmo sem usuario, com um hash descartavel: sem isso,
    // o tempo de resposta diria quais e-mails existem no GC.
    const confere = await senhaConfere(
      password,
      usuario?.encrypted_password ?? 'scrypt$16384$8$1$c2Fs$dA==',
    )

    if (!usuario || !confere) {
      loginLimit.fail(chave)
      throw new HttpError(401, 'E-mail ou senha incorretos.')
    }

    loginLimit.reset(chave)

    // Senha provisoria, entregue pela lideranca: nao nasce sessao aqui. O que
    // sai e apenas o direito de definir a senha - com esse token, o PostgREST
    // trata quem chama como visitante, e visitante nao le nada.
    if (usuario.must_change_password) {
      res.json({
        must_change_password: true,
        change_token: signChangeToken(usuario.id),
        user: { id: usuario.id, email: usuario.email },
      })
      return
    }

    res.json(sessionPayload(await issueSession(usuario)))
  }),
)

/**
 * Primeiro acesso. Quem valida o convite e o gatilho `on_auth_user_created`,
 * no banco - a mesma regra que existia antes, no mesmo lugar. Sem token valido
 * para aquele e-mail, o insert e recusado e nenhuma conta nasce.
 */
authRouter.post(
  '/signup',
  asyncRoute(async (req, res) => {
    const { email, password } = readCredentials(req.body ?? {})
    const inviteToken =
      typeof req.body?.invite_token === 'string' ? req.body.invite_token.trim() : ''

    if (!inviteToken) {
      throw new HttpError(403, 'O cadastro no Cuidar GC acontece somente por convite.')
    }
    if (password.length < 8) {
      throw new HttpError(422, 'A senha precisa ter pelo menos 8 caracteres.')
    }

    const { rows } = await pool.query<{ id: string; email: string }>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data)
       values ($1, $2, jsonb_build_object('invite_token', $3::text))
       returning id, email`,
      [email, await hashSenha(password), inviteToken],
    )

    res.status(201).json(sessionPayload(await issueSession(rows[0]!)))
  }),
)

authRouter.post(
  '/refresh',
  asyncRoute(async (req, res) => {
    const token = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : ''
    if (!token) throw new HttpError(400, 'Sessão não encontrada. Entre novamente.')

    const session = await rotateSession(token)
    if (!session) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.')

    res.json(sessionPayload(session))
  }),
)

authRouter.post(
  '/logout',
  asyncRoute(async (req, res) => {
    const token = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : ''
    if (token) await revokeRefreshToken(token)
    res.status(204).end()
  }),
)

/**
 * Definicao da primeira senha, para quem entrou com a provisoria.
 *
 * O token de troca ja provou que a pessoa sabia a senha entregue - nao faz
 * sentido pedi-la de novo. Ao final, a sessao de verdade nasce aqui: a pessoa
 * segue direto para o app, sem passar pelo login outra vez.
 */
authRouter.post(
  '/primeira-senha',
  asyncRoute(async (req, res) => {
    const token = typeof req.body?.change_token === 'string' ? req.body.change_token : ''
    const nova = typeof req.body?.new_password === 'string' ? req.body.new_password : ''

    const userId = token ? verifyChangeToken(token) : null
    if (!userId) {
      throw new HttpError(401, 'Este acesso expirou. Entre novamente com a senha que você recebeu.')
    }
    if (nova.length < 8) {
      throw new HttpError(422, 'A nova senha precisa ter pelo menos 8 caracteres.')
    }

    const { rows } = await pool.query<{ id: string; email: string }>(
      `update auth.users
          set encrypted_password = $2,
              must_change_password = false,
              updated_at = now()
        where id = $1 and must_change_password
        returning id, email`,
      [userId, await hashSenha(nova)],
    )

    if (rows.length === 0) {
      throw new HttpError(409, 'Esta senha já foi definida. Entre com ela.')
    }

    res.json(sessionPayload(await issueSession(rows[0]!)))
  }),
)

/** Troca de senha pelo proprio dono, ja autenticado. */
authRouter.post(
  '/password',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const current = typeof req.body?.current_password === 'string' ? req.body.current_password : ''
    const next = typeof req.body?.new_password === 'string' ? req.body.new_password : ''
    const userId = req.claims!.sub

    if (next.length < 8)
      throw new HttpError(422, 'A nova senha precisa ter pelo menos 8 caracteres.')

    const chave = `senha:${userId}`
    loginLimit.check(chave)

    const { rows } = await pool.query<{ encrypted_password: string }>(
      'select encrypted_password from auth.users where id = $1',
      [userId],
    )

    if (!rows[0] || !(await senhaConfere(current, rows[0].encrypted_password))) {
      loginLimit.fail(chave)
      throw new HttpError(403, 'Senha atual incorreta.')
    }

    await pool.query(
      `update auth.users
          set encrypted_password = $2, must_change_password = false, updated_at = now()
        where id = $1`,
      [userId, await hashSenha(next)],
    )

    loginLimit.reset(chave)

    // Trocar a senha derruba as outras sessoes: e o que da sentido a troca.
    await revokeAllForUser(userId)
    res.status(204).end()
  }),
)
