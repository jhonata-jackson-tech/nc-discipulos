import { createHash, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Apoio dos testes de integracao.
 *
 * Eles rodam contra um Supabase local (`npx supabase start`). Sem ambiente
 * configurado, a suite inteira e pulada em vez de falhar.
 */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const hasSupabase = Boolean(ANON_KEY && SERVICE_ROLE_KEY)

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export interface TestUser {
  profileId: string
  email: string
  password: string
  client: SupabaseClient
}

/**
 * Cria um integrante, emite um convite valido para ele e conclui o primeiro
 * acesso - exatamente o caminho que uma pessoa real percorre.
 */
export async function createUser(
  admin: SupabaseClient,
  input: {
    fullName: string
    role: 'supervisor' | 'leader' | 'disciple' | 'member'
    careGender?: 'male' | 'female' | null
  },
): Promise<TestUser> {
  const suffix = randomUUID().slice(0, 8)
  const email = `${input.role}.${suffix}@teste.cuidar.local`
  const password = `Teste-${suffix}-123`

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .insert({
      full_name: `${input.fullName} ${suffix}`,
      role: input.role,
      care_gender: input.careGender ?? null,
    })
    .select()
    .single()
  if (profileError) throw profileError

  const token = randomUUID().replace(/-/g, '')
  const { error: inviteError } = await admin.from('invites').insert({
    profile_id: profile.id,
    email,
    token_hash: sha256(token),
  })
  if (inviteError) throw inviteError

  const client = anonClient()
  const { error: signUpError } = await client.auth.signUp({
    email,
    password,
    options: { data: { invite_token: token } },
  })
  if (signUpError) throw signUpError

  // Alguns ambientes exigem login explicito apos o cadastro.
  if (!(await client.auth.getSession()).data.session) {
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  return { profileId: profile.id, email, password, client }
}

/** Remove tudo que os testes criaram, na ordem correta de dependencias. */
export async function cleanup(admin: SupabaseClient, profileIds: string[], groupId?: string) {
  if (profileIds.length === 0) return

  const { data: users } = await admin
    .from('profiles')
    .select('user_id')
    .in('id', profileIds)

  await admin.from('care_assignments').delete().in('caregiver_id', profileIds)
  await admin.from('care_assignments').delete().in('cared_for_id', profileIds)
  await admin.from('supervision_requests').delete().in('requester_id', profileIds)
  await admin.from('discipleship_links').delete().in('disciple_id', profileIds)
  await admin.from('notifications').delete().in('profile_id', profileIds)
  await admin.from('invites').delete().in('profile_id', profileIds)
  if (groupId) {
    await admin.from('care_weeks').delete().eq('group_id', groupId)
    await admin.from('activities').delete().eq('group_id', groupId)
    await admin.from('groups').delete().eq('id', groupId)
  }
  await admin.from('profiles').delete().in('id', profileIds)

  for (const user of users ?? []) {
    if (user.user_id) await admin.auth.admin.deleteUser(user.user_id)
  }
}
