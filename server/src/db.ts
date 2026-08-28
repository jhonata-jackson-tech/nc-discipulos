import pg from 'pg'
import { config } from './config.ts'

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
})

export interface SessionClaims {
  sub: string
  email: string
  role: 'authenticated'
}

/**
 * Executa um bloco com a identidade do usuario, exatamente como o PostgREST
 * faria: as claims viram `request.jwt.claims` e o papel vira `authenticated`.
 *
 * E o que mantem uma unica fonte de verdade. Mesmo aqui dentro do servidor, a
 * Row Level Security continua valendo - o servico nao tem um caminho
 * privilegiado para contornar as regras do banco.
 */
export async function withUser<T>(
  claims: SessionClaims,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify(claims),
    ])
    await client.query('set local role authenticated')
    const result = await run(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
