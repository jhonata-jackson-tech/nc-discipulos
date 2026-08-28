import { PostgrestClient } from '@supabase/postgrest-js'
import { getAccessToken } from './auth'

/**
 * Cliente de dados: fala direto com o PostgREST, que publica o schema `public`
 * - as tabelas e as funcoes de servidor - e valida o JWT a cada requisicao.
 *
 * Nao existe caminho privilegiado aqui. O navegador manda o token da pessoa e
 * a Row Level Security decide o que ela ve; o mesmo select feito por um irmao
 * e por um lider devolve conjuntos diferentes, e isso e responsabilidade do
 * banco, nao desta camada.
 */
// O PostgREST vive na mesma origem, atras do Caddy (ou do proxy do Vite, em
// desenvolvimento). Mesmo assim a URL precisa ser absoluta: o cliente monta
// cada consulta com `new URL()`, que recusa caminho relativo.
const origem = import.meta.env.VITE_API_URL || window.location.origin
const restUrl = `${origem}/rest/v1`

/**
 * Injeta a sessao em cada chamada, renovando o token quando esta perto de
 * vencer. Um 401 vindo do PostgREST ganha uma segunda tentativa com o token
 * renovado: e o caso de quem deixou a aba aberta a noite toda.
 */
const authenticatedFetch: typeof fetch = async (input, init) => {
  const token = await getAccessToken()

  const send = (bearer: string | null) => {
    const headers = new Headers(init?.headers)
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`)
    return fetch(input, { ...init, headers })
  }

  const response = await send(token)
  if (response.status !== 401) return response

  const renewed = await getAccessToken()
  return renewed && renewed !== token ? send(renewed) : response
}

export const db = new PostgrestClient(restUrl, { fetch: authenticatedFetch })

/** A geracao da semana roda no servidor - e o unico endpoint fora do PostgREST. */
export const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ''}${path}`
