/**
 * Notificacoes fora do app.
 *
 * O aviso interno continua sendo a fonte: ele e gravado no banco de qualquer
 * jeito, e a central dentro do app mostra tudo. O push e so o empurrao para
 * quem nao esta com o Cuidar GC aberto - e por isso pode falhar sem que
 * ninguem perca informacao.
 */
import { getAccessToken } from '@/lib/auth'
import { apiUrl } from '@/lib/db'

export type EstadoPush =
  | 'sem-suporte'
  | 'precisa-instalar'
  | 'desligado'
  | 'ligado'
  | 'bloqueado'
  | 'indisponivel'

const temSuporte = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

/**
 * No iPhone, o Safari so entrega push quando a pagina foi instalada na tela de
 * inicio. Enquanto estiver aberta como aba, nem adianta pedir permissao - e
 * melhor explicar isso do que mostrar um botao que nao funciona.
 */
const iosSemInstalar = () => {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const instalado =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return ios && !instalado
}

/** A chave publica vem em base64url e o navegador exige bytes. */
function chaveEmBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchido = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const bruto = atob(preenchido)
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length))
  for (let i = 0; i < bruto.length; i += 1) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

async function chavePublica(): Promise<string | null> {
  const resposta = await fetch(apiUrl('/api/push/chave'))
  if (!resposta.ok) return null
  const dados = (await resposta.json()) as { chave: string | null }
  return dados.chave
}

async function enviar(caminho: string, corpo: unknown): Promise<void> {
  const token = await getAccessToken()
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.')

  const resposta = await fetch(apiUrl(caminho), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  })

  if (!resposta.ok) {
    const dados = (await resposta.json().catch(() => ({}))) as { error?: string }
    throw new Error(dados.error ?? 'Não foi possível alterar as notificações.')
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!temSuporte()) return iosSemInstalar() ? 'precisa-instalar' : 'sem-suporte'
  if (!(await chavePublica())) return 'indisponivel'
  if (Notification.permission === 'denied') return 'bloqueado'

  const registro = await navigator.serviceWorker.ready
  const inscricao = await registro.pushManager.getSubscription()
  return inscricao ? 'ligado' : 'desligado'
}

export async function ligarPush(): Promise<EstadoPush> {
  const chave = await chavePublica()
  if (!chave) return 'indisponivel'

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueado' : 'desligado'

  const registro = await navigator.serviceWorker.ready
  const inscricao =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      // Sem isto o navegador recusa: toda mensagem tem que ser visivel para a
      // pessoa. Push silencioso nao existe aqui, e ainda bem.
      userVisibleOnly: true,
      applicationServerKey: chaveEmBytes(chave),
    }))

  await enviar('/api/push/inscrever', inscricao.toJSON())
  return 'ligado'
}

export async function desligarPush(): Promise<EstadoPush> {
  const registro = await navigator.serviceWorker.ready
  const inscricao = await registro.pushManager.getSubscription()
  if (!inscricao) return 'desligado'

  // Avisar o servidor primeiro: se o cancelamento local desse certo e o
  // registro no banco ficasse, o servidor continuaria mandando para o vazio.
  await enviar('/api/push/cancelar', { endpoint: inscricao.endpoint })
  await inscricao.unsubscribe()
  return 'desligado'
}
