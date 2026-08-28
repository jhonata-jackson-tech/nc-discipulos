import { randomUUID } from 'node:crypto'
import {
  adminClient,
  configurado,
  criarConta,
  encerrar,
  entrar,
  removerConta,
  sha256,
  type LocalClient,
} from '../../scripts/lib/local.mjs'

/**
 * Apoio dos testes de integracao.
 *
 * Eles rodam contra o compose de desenvolvimento:
 *
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
 *
 * Sem `.env` configurado, a suite inteira e pulada em vez de falhar.
 */
export const hasBackend = configurado

export { adminClient, encerrar, sha256 }

export interface TestUser {
  profileId: string
  email: string
  password: string
  client: LocalClient
}

/**
 * Cria um integrante, emite um convite valido para ele e conclui o primeiro
 * acesso - exatamente o caminho que uma pessoa real percorre.
 */
export async function createUser(
  admin: LocalClient,
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

  const { client } = await criarConta({ email, password, inviteToken: token })

  // Confere que a sessao emitida no cadastro realmente entra.
  await entrar(email, password)

  return { profileId: profile.id, email, password, client }
}

/** Remove tudo que os testes criaram, na ordem correta de dependencias. */
export async function cleanup(admin: LocalClient, profileIds: string[], groupId?: string) {
  if (profileIds.length === 0) return

  const { data: users } = await admin.from('profiles').select('user_id').in('id', profileIds)

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

  for (const user of (users ?? []) as { user_id: string | null }[]) {
    if (user.user_id) await removerConta(user.user_id)
  }
}
