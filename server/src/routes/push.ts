import { Router } from 'express'
import { config } from '../config.ts'
import { withUser } from '../db.ts'
import { asyncRoute, HttpError, requireSession, type AuthedRequest } from '../http.ts'
import { pushHabilitado } from '../push.ts'

export const pushRouter = Router()

/**
 * A chave publica VAPID precisa chegar ao navegador para ele criar a inscricao.
 * Ela e publica por definicao - o que assina de verdade e a chave privada, que
 * nunca sai do servidor.
 */
pushRouter.get('/push/chave', (_req, res) => {
  res.json({ chave: config.vapid?.publicKey ?? null })
})

interface Inscricao {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

pushRouter.post(
  '/push/inscrever',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    if (!pushHabilitado) throw new HttpError(503, 'As notificações push não estão configuradas.')

    const corpo = (req.body ?? {}) as Inscricao
    const endpoint = typeof corpo.endpoint === 'string' ? corpo.endpoint : ''
    const p256dh = typeof corpo.keys?.p256dh === 'string' ? corpo.keys.p256dh : ''
    const auth = typeof corpo.keys?.auth === 'string' ? corpo.keys.auth : ''

    if (!endpoint || !p256dh || !auth) {
      throw new HttpError(400, 'Inscrição incompleta.')
    }

    // Roda com a identidade de quem pediu: quem decide de quem e o aparelho e
    // o banco, como em qualquer outra escrita do sistema.
    await withUser(req.claims!, async (client) => {
      await client.query('select public.save_push_subscription($1, $2, $3, $4)', [
        endpoint,
        p256dh,
        auth,
        req.header('user-agent') ?? null,
      ])
    })

    res.status(204).end()
  }),
)

pushRouter.post(
  '/push/cancelar',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
    if (!endpoint) throw new HttpError(400, 'Informe a inscrição a cancelar.')

    await withUser(req.claims!, async (client) => {
      await client.query('delete from public.push_subscriptions where endpoint = $1', [endpoint])
    })

    res.status(204).end()
  }),
)
