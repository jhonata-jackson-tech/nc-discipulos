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

    // A comparacao acontece no banco, pelo pgcrypto: a senha em claro nunca e
    // guardada nem comparada em memoria do Node.
    const { rows } = await pool.query<{
      id: string
      email: string
      must_change_password: boolean
    }>(
      `select id, email, must_change_password from auth.users
        where lower(email) = $1
          and encrypted_password = extensions.crypt($2, encrypted_password)`,
      [email, password],
    )

    if (rows.length === 0) {
      loginLimit.fail(chave)
      throw new HttpError(401, 'E-mail ou senha incorretos.')
    }

    const usuario = rows[0]!
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
       values ($1, extensions.crypt($2, extensions.gen_salt('bf', 10)),
               jsonb_build_object('invite_token', $3::text))
       returning id, email`,
      [email, password, inviteToken],
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
          set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)),
              must_change_password = false,
              updated_at = now()
        where id = $1 and must_change_password
        returning id, email`,
      [userId, nova],
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

    const { rowCount } = await pool.query(
      `update auth.users
          set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)),
              must_change_password = false,
              updated_at = now()
        where id = $1
          and encrypted_password = extensions.crypt($3, encrypted_password)`,
      [userId, next, current],
    )

    if (rowCount === 0) {
      loginLimit.fail(chave)
      throw new HttpError(403, 'Senha atual incorreta.')
    }

    loginLimit.reset(chave)

    // Trocar a senha derruba as outras sessoes: e o que da sentido a troca.
    await revokeAllForUser(userId)
    res.status(204).end()
  }),
)
