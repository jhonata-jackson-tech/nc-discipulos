/** Configuracao do servico. Falta de segredo e erro de partida, nunca default. */

function required(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Variavel de ambiente ausente: ${name}`)
  }
  return value
}

function number(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`Variavel ${name} precisa ser um numero.`)
  return parsed
}

const jwtSecret = required('JWT_SECRET')
if (jwtSecret.length < 32) {
  // O PostgREST recusa segredos curtos para HS256, e com razao.
  throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.')
}

export const config = {
  port: number('PORT', 3001),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret,
  /** Token de acesso curto: some quando a aba fecha e e renovado pelo refresh. */
  accessTokenTtlSeconds: number('ACCESS_TOKEN_TTL_SECONDS', 60 * 60),
  refreshTokenTtlDays: number('REFRESH_TOKEN_TTL_DAYS', 30),
  /** Vazio em producao: a aplicacao e servida na mesma origem pelo Caddy. */
  corsOrigin: process.env.CORS_ORIGIN ?? '',
}
