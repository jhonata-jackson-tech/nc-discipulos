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

  /**
   * Quantos proxies existem entre a pessoa e este servico. Com Caddy sozinho e
   * 1; atras de um Apache que ja atende o servidor, sao 2. Errar aqui nao da
   * erro visivel - so faz `req.ip` virar o IP do proxy, e o freio de
   * tentativas de senha passa a valer para todo mundo junto.
   */
  trustProxyHops: number('TRUST_PROXY_HOPS', 1),

  /**
   * Chaves do Web Push. Sao opcionais: sem elas o app funciona inteiro, apenas
   * sem aviso fora da tela. Gere com `npm run vapid`.
   */
  vapid: vapidKeys(),
}

function vapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null

  // O `subject` identifica quem envia, para o servico de push do fabricante
  // saber a quem reclamar. Precisa ser um mailto: ou uma URL.
  const subject = process.env.VAPID_SUBJECT ?? ''
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new Error('VAPID_SUBJECT precisa ser um mailto: ou uma URL https://')
  }

  return { publicKey, privateKey, subject }
}
