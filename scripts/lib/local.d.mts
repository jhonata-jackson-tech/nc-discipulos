/** Tipos do apoio local, para os testes de integracao em TypeScript. */
import type { PostgrestClient } from '@supabase/postgrest-js'

export type LocalClient = PostgrestClient<any, any, any>

export interface LocalSession {
  access_token: string
  refresh_token: string
  expires_at: number
  user: { id: string; email: string }
}

export interface LocalAccess {
  sessao: LocalSession
  client: LocalClient
}

export const API_URL: string
export const REST_URL: string
export const DATABASE_URL: string
export const configurado: boolean

export function sha256(valor: string): string
export function assinarToken(claims: Record<string, unknown>, segundos?: number): string
export function tokenServico(): string
export function clienteComToken(token: string): LocalClient
export function adminClient(): LocalClient

export function criarConta(input: {
  email: string
  password: string
  inviteToken: string
}): Promise<LocalAccess>
export function entrar(email: string, password: string): Promise<LocalAccess>
export function darAcesso(
  admin: LocalClient,
  profileId: string,
  email: string,
  password: string,
): Promise<LocalAccess>

export function gerarSemana(
  token: string,
  input: { groupId: string; startsOn: string },
): Promise<{ weekId: string; assignments: number; pools: unknown[]; warnings: string[] }>

export function sql<T = Record<string, unknown>>(texto: string, valores?: unknown[]): Promise<T[]>
export function removerConta(userId: string): Promise<void>
export function encerrar(): Promise<void>
