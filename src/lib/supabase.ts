import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * O app e inutil sem banco: em vez de cair em dados falsos, mostramos uma tela
 * explicando o que falta configurar.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'chave-ausente',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'cuidar-gc-auth',
    },
  },
)

export const functionsUrl = (name: string) => `${url}/functions/v1/${name}`
