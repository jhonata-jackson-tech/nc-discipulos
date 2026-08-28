import { existsSync, readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { STATE_FILE } from './global-setup'

export interface E2EState {
  ready: boolean
  tag?: string
  groupId?: string
  weekId?: string
  draftWeekId?: string
  accounts?: Record<string, { email: string; password: string; profileId: string }>
  names?: Record<string, string>
}

export function readState(): E2EState {
  if (!existsSync(STATE_FILE)) return { ready: false }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as E2EState
}

export const state = readState()

/** Entra pelo formulario real de login - o caminho de todo dia. */
export async function signIn(page: Page, who: keyof NonNullable<E2EState['accounts']>) {
  const account = state.accounts![who]

  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(account.email)
  await page.getByLabel('Senha', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  // O h1 "Entrar" existe na propria tela de login: esperamos a saida dela e a
  // chegada do shell autenticado antes de seguir.
  await page.waitForURL((url) => !url.pathname.startsWith('/entrar'))
  // "Minha semana" existe na sidebar do desktop e na barra inferior do celular.
  await expect(page.getByRole('link', { name: 'Minha semana' }).first()).toBeVisible()
}

export function nameOf(who: string) {
  return state.names![who]
}

/** Cliente administrativo, usado apenas para preparar cenarios de teste. */
export function admin(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/**
 * Recoloca a semana publicada no estado que o preparo criou.
 *
 * Os projetos (desktop e celular) compartilham o mesmo banco; sem isso, um
 * teste que transfere um cuidado mudaria o cenario do proximo.
 */
export async function resetCareState() {
  const client = admin()
  const accounts = state.accounts!
  const ids = Object.values(accounts).map((account) => account.profileId)

  await client.from('transfer_requests').delete().in('requester_id', ids)
  await client.from('care_assignments').delete().eq('week_id', state.weekId!)

  await client.from('care_assignments').insert([
    {
      week_id: state.weekId!,
      caregiver_id: accounts.leader.profileId,
      cared_for_id: accounts.disciple.profileId,
      origin: 'fixed_disciple',
    },
    {
      week_id: state.weekId!,
      caregiver_id: accounts.leader.profileId,
      cared_for_id: accounts.memberA.profileId,
      origin: 'rotation',
    },
    {
      week_id: state.weekId!,
      caregiver_id: accounts.disciple.profileId,
      cared_for_id: accounts.memberB.profileId,
      origin: 'rotation',
    },
  ])
}

/**
 * Cria uma semana em rascunho exclusiva do teste que a pediu, com um cuidado
 * dentro. Cada teste fica independente da ordem de execucao.
 */
export async function createDraftWeek(startsOn: string, endsOn: string) {
  const client = admin()

  await client.from('care_weeks').delete().eq('group_id', state.groupId!).eq('starts_on', startsOn)

  const { data: week, error } = await client
    .from('care_weeks')
    .insert({
      group_id: state.groupId!,
      starts_on: startsOn,
      ends_on: endsOn,
      seed: `rascunho-${startsOn}`,
      status: 'draft',
      generation_report: { pools: [], warnings: [], extraSlots: [] },
    })
    .select()
    .single()
  if (error) throw error

  await client.from('care_assignments').insert({
    week_id: week.id,
    caregiver_id: state.accounts!.disciple.profileId,
    cared_for_id: state.accounts!.memberB.profileId,
    origin: 'rotation',
  })

  return week.id as string
}
