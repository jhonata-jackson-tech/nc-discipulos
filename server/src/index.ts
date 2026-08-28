/**
 * Cuidar GC :: servico de autenticacao e geracao da semana.
 *
 * Ele existe para fazer as duas coisas que o PostgREST nao faz: emitir a
 * sessao (JWT) e rodar o algoritmo de distribuicao. Todo o resto - leitura,
 * escrita, permissao - continua indo direto do navegador para o PostgREST,
 * onde a Row Level Security decide sozinha.
 */
import express from 'express'
import { config } from './config.ts'
import { pool } from './db.ts'
import { errorHandler } from './http.ts'
import { authRouter } from './routes/auth.ts'
import { weekRouter } from './routes/week.ts'

const app = express()

// Atras do Caddy: sem isso `req.ip` seria sempre o IP do proxy, e o freio de
// tentativas de senha valeria para o predio inteiro em vez de por pessoa.
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))

// Em producao a aplicacao e servida na mesma origem, e nao existe CORS. A
// liberacao so existe para o `npm run dev`, onde o Vite roda em outra porta.
if (config.corsOrigin) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.corsOrigin)
    res.header('Access-Control-Allow-Headers', 'authorization, content-type')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })
}

app.get('/saude', (_req, res) => {
  pool
    .query('select 1')
    .then(() => res.json({ status: 'ok' }))
    .catch(() => res.status(503).json({ status: 'sem banco' }))
})

app.use('/auth', authRouter)
app.use('/api', weekRouter)

app.use(errorHandler)

const server = app.listen(config.port, () => {
  console.log(`[cuidar-gc] servico ouvindo na porta ${config.port}`)
})

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    server.close(() => {
      pool.end().finally(() => process.exit(0))
    })
  })
}
