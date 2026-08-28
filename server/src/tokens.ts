import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from './config.ts'
import { pool, type SessionClaims } from './db.ts'

export interface IssuedSession {
  accessToken: string
  /** Epoch em segundos - o cliente renova sozinho antes de vencer. */
  expiresAt: number
  refreshToken: string
  user: { id: string; email: string }
}

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

/**
 * O JWT precisa carregar `role: 'authenticated'`: e essa claim que faz o
 * PostgREST assumir o papel certo, e por tabela as politicas de RLS valerem.
 */
export function signAccessToken(user: { id: string; email: string }): {
  token: string
  expiresAt: number
} {
  const expiresAt = Math.floor(Date.now() / 1000) + config.accessTokenTtlSeconds
  const claims: SessionClaims & { exp: number } = {
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    exp: expiresAt,
  }
  return { token: jwt.sign(claims, config.jwtSecret, { algorithm: 'HS256' }), expiresAt }
}

export function verifyAccessToken(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    if (typeof payload === 'string' || !payload.sub) return null

    // A checagem do papel nao e formalidade: o token de troca de senha e
    // assinado com o mesmo segredo e passaria por aqui sem ela, virando uma
    // sessao completa para quem ainda esta com a senha provisoria.
    if (payload.role !== 'authenticated') return null

    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ''),
      role: 'authenticated',
    }
  } catch {
    return null
  }
}

/**
 * Token de uso unico e curto: serve so para definir a primeira senha.
 *
 * Nao carrega `role: 'authenticated'`, entao o PostgREST o trata como visitante
 * anonimo - que nao le nada do dominio. Quem esta com senha provisoria pode
 * trocar a senha e mais nada.
 */
export function signChangeToken(userId: string): string {
  return jwt.sign({ sub: userId, scope: 'change_password' }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '20m',
  })
}

export function verifyChangeToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    if (typeof payload === 'string' || payload.scope !== 'change_password' || !payload.sub) {
      return null
    }
    return String(payload.sub)
  } catch {
    return null
  }
}

export async function issueSession(user: { id: string; email: string }): Promise<IssuedSession> {
  const { token: accessToken, expiresAt } = signAccessToken(user)
  const refreshToken = crypto.randomBytes(32).toString('hex')

  await pool.query(
    `insert into auth.refresh_tokens (user_id, token_hash, expires_at)
     values ($1, $2, now() + make_interval(days => $3))`,
    [user.id, hash(refreshToken), config.refreshTokenTtlDays],
  )

  await pool.query('update auth.users set last_sign_in_at = now() where id = $1', [user.id])

  return { accessToken, expiresAt, refreshToken, user }
}

/**
 * Renovacao com rotacao: o token usado e revogado no mesmo movimento em que o
 * novo nasce. Um refresh token roubado vale, no maximo, ate o dono renovar.
 */
export async function rotateSession(refreshToken: string): Promise<IssuedSession | null> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query<{ id: string; user_id: string; email: string }>(
      `select t.id, t.user_id, u.email
         from auth.refresh_tokens t
         join auth.users u on u.id = t.user_id
        where t.token_hash = $1 and t.revoked_at is null and t.expires_at > now()
        for update`,
      [hash(refreshToken)],
    )
    if (rows.length === 0) {
      await client.query('rollback')
      return null
    }

    const found = rows[0]!
    await client.query('update auth.refresh_tokens set revoked_at = now() where id = $1', [
      found.id,
    ])
    await client.query('commit')

    return await issueSession({ id: found.user_id, email: found.email })
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await pool.query(
    'update auth.refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null',
    [hash(refreshToken)],
  )
}

/** Sair de um dispositivo encerra a sessao em todos - o app e de uso pessoal. */
export async function revokeAllForUser(userId: string): Promise<void> {
  await pool.query(
    'update auth.refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null',
    [userId],
  )
}
