/**
 * Sessao da aplicacao.
 *
 * O acesso e um JWT curto (uma hora) que o PostgREST valida a cada chamada; o
 * refresh e um token longo, rotacionado a cada renovacao. Guardamos os dois no
 * `localStorage` porque o app precisa continuar aberto no celular entre um
 * domingo e outro - e nao ha cookie de sessao possivel quando a PWA e servida
 * como arquivo estatico.
 */
const STORAGE_KEY = 'cuidar-gc-auth'

/** Renova um minuto antes de vencer, para nunca mandar um token no limite. */
const RENEW_MARGIN_SECONDS = 60

export interface AuthUser {
  id: string
  email: string
}

export interface Session {
  accessToken: string
  refreshToken: string
  /** Epoch em segundos. */
  expiresAt: number
  user: AuthUser
}

interface SessionResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  user: AuthUser
}

/** Erro com a mensagem que o servidor escreveu, pronta para a tela. */
export class AuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const listeners = new Set<(session: Session | null) => void>()
let current: Session | null = read()
let renewing: Promise<Session | null> | null = null

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.accessToken || !parsed?.refreshToken) return null
    return parsed
  } catch {
    return null
  }
}

function write(session: Session | null) {
  current = session
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Navegador sem armazenamento: a sessao vale ate a aba fechar.
  }
  for (const listener of listeners) listener(session)
}

const toSession = (data: SessionResponse): Session => ({
  accessToken: data.access_token,
  refreshToken: data.refresh_token,
  expiresAt: data.expires_at,
  user: data.user,
})

/** Base da API. Vazio em producao: Caddy serve tudo na mesma origem. */
const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ''}${path}`

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AuthError('Não foi possível falar com o servidor. Verifique sua conexão.', 0)
  }

  if (response.status === 204) return undefined as T

  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new AuthError(data.error ?? 'Algo deu errado. Tente novamente.', response.status)
  }
  return data as T
}

export function getSession(): Session | null {
  return current
}

export function onAuthStateChange(listener: (session: Session | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function signIn(email: string, password: string): Promise<Session> {
  const session = toSession(await post<SessionResponse>('/auth/login', { email, password }))
  write(session)
  return session
}

export async function signUp(input: {
  email: string
  password: string
  inviteToken: string
}): Promise<Session> {
  const session = toSession(
    await post<SessionResponse>('/auth/signup', {
      email: input.email,
      password: input.password,
      invite_token: input.inviteToken,
    }),
  )
  write(session)
  return session
}

export async function signOut(): Promise<void> {
  const session = current
  write(null)
  // Encerrar no servidor e desejavel, mas nunca pode segurar a saida do app.
  if (session) {
    await post('/auth/logout', { refresh_token: session.refreshToken }).catch(() => {})
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const token = await getAccessToken()
  if (!token) throw new AuthError('Sua sessão expirou. Entre novamente.', 401)
  await post(
    '/auth/password',
    { current_password: currentPassword, new_password: newPassword },
    token,
  )
}

/**
 * Token valido para a proxima chamada, renovando quando esta perto de vencer.
 * Renovacoes simultaneas compartilham a mesma promessa: varias telas carregando
 * ao mesmo tempo nao podem gastar o refresh token uma na frente da outra.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = current
  if (!session) return null

  const now = Math.floor(Date.now() / 1000)
  if (session.expiresAt - RENEW_MARGIN_SECONDS > now) return session.accessToken

  renewing ??= renew()
  const renewed = await renewing
  renewing = null
  return renewed?.accessToken ?? null
}

async function renew(): Promise<Session | null> {
  const session = current
  if (!session) return null

  try {
    const next = toSession(
      await post<SessionResponse>('/auth/refresh', { refresh_token: session.refreshToken }),
    )
    write(next)
    return next
  } catch (error) {
    // Refresh recusado significa sessao encerrada de verdade: cair para a tela
    // de login e mais honesto do que insistir com um token morto.
    if (error instanceof AuthError && error.status !== 0) write(null)
    return null
  }
}
