import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from './tokens.ts'
import type { SessionClaims } from './db.ts'

/** Erro que ja tem uma mensagem pronta para a tela. */
export class HttpError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface AuthedRequest extends Request {
  claims?: SessionClaims
}

export function requireSession(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const claims = token ? verifyAccessToken(token) : null
  if (!claims) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.')
  req.claims = claims
  next()
}

/** Express 5 encaminha rejeicoes de async para o handler de erro. */
export const asyncRoute =
  <T extends Request>(handler: (req: T, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req as T, res).catch(next)
  }

interface PgError {
  code?: string
  message?: string
}

/**
 * O banco e quem conhece as regras do GC, e responde em portugues. Aqui so
 * traduzimos o codigo do Postgres para o status HTTP certo - a mensagem
 * escrita nas migrations chega intacta na tela.
 */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    res
      .status(error.status)
      .json({ error: error.message, code: error.code, details: error.details })
    return
  }

  const pg = error as PgError
  if (pg?.code === '23505') {
    res.status(409).json({ error: 'Este e-mail já possui acesso.' })
    return
  }
  // 42501 = insufficient_privilege: e o codigo que as regras de convite usam.
  if (pg?.code === '42501' && pg.message) {
    res.status(403).json({ error: pg.message })
    return
  }
  if (pg?.code === 'P0001' && pg.message) {
    res.status(422).json({ error: pg.message })
    return
  }

  console.error('[cuidar-gc] erro nao tratado:', error)
  res.status(500).json({ error: 'Algo deu errado. Tente novamente.' })
}

/**
 * Freio simples de tentativas, em memoria. O GC tem dezenas de pessoas em um
 * unico processo: uma tabela no banco seria precisao sem ganho.
 */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return (key: string) => {
    const now = Date.now()
    const current = hits.get(key)

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      if (hits.size > 5_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
      }
      return
    }

    current.count += 1
    if (current.count > limit) {
      throw new HttpError(429, 'Muitas tentativas seguidas. Aguarde alguns minutos.')
    }
  }
}
