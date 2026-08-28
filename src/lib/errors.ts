/**
 * Traducao de erros para uma linguagem que a lideranca entenda.
 *
 * O banco e o servico de autenticacao ja respondem em portugues; o que sobra
 * para traduzir aqui sao as violacoes de constraint, que chegam cruas do
 * Postgres, e as falhas de rede.
 */
const AUTH_MESSAGES: Record<string, string> = {
  'Auth session missing!': 'Sua sessão expirou. Entre novamente.',
}

export function friendlyError(error: unknown): string {
  if (!error) return 'Algo deu errado. Tente novamente.'

  if (typeof error === 'string') return AUTH_MESSAGES[error] ?? error

  const message = (error as { message?: string }).message ?? ''
  if (AUTH_MESSAGES[message]) return AUTH_MESSAGES[message]

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Não foi possível falar com o servidor. Verifique sua conexão.'
  }

  if (message.includes('duplicate key') && message.includes('assignment_unique_cared_for')) {
    return 'Esta pessoa já tem um cuidado nesta semana.'
  }
  if (message.includes('transfer_pending_unique_idx')) {
    return 'Já existe um pedido de transferência aguardando resposta.'
  }
  if (message.includes('discipleship_active_unique_idx')) {
    return 'Este discípulo já tem um líder primário vigente.'
  }
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return 'Você não tem permissão para esta ação.'
  }

  return message || 'Algo deu errado. Tente novamente.'
}
