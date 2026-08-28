/** Tipos do cadastro de integrantes, para os testes em TypeScript. */
import type { LocalClient } from './local.mjs'

export interface Grupo {
  id: string
  name: string
}

export interface EntradaCadastro {
  /** Nome como a pessoa esta hoje no sistema: completa em vez de duplicar. */
  atual?: string
  nome: string
  email: string
  whatsapp?: string
  nascimento?: string
  papel?: 'leader' | 'supervisor' | 'disciple' | 'member'
  /** Base do link de convite. Ignorado quando ha senha provisoria. */
  site?: string
  /** Cria a conta ja com esta senha e a troca obrigatoria no primeiro acesso. */
  senhaProvisoria?: string
}

export interface ResultadoCadastro {
  nome: string
  acao: string
  link: string | null
  senha: string | null
}

export function soDigitos(valor?: string): string | null
export function dataISO(valor?: string): string | null
export function grupoPadrao(admin: LocalClient): Promise<Grupo>
export function cadastrar(
  admin: LocalClient,
  grupo: Grupo,
  pessoa: EntradaCadastro,
): Promise<ResultadoCadastro>
