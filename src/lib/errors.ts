/**
 * Traducao de erros para uma linguagem que a lideranca entenda.
 *
 * O banco ja devolve mensagens em portugues nas regras de negocio; aqui
 * cobrimos os erros tecnicos do Supabase e da rede.
 */
const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
  'User already registered': 'Este e-mail já possui acesso.',
  'New password should be different from the old password.':
    'A nova senha precisa ser diferente da anterior.',
  'Password should be at least 8 characters.': 'A senha precisa ter pelo menos 8 caracteres.',
  'Auth session missing!': 'Sua sessão expirou. Entre novamente.',
  'Email rate limit exceeded': 'Muitas tentativas seguidas. Aguarde alguns minutos.',
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
