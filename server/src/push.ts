import pg from 'pg'
import webpush from 'web-push'
import { config } from './config.ts'
import { pool } from './db.ts'

/**
 * Entrega de notificacoes push.
 *
 * O servico mantem um LISTEN aberto no Postgres. Cada aviso gravado por
 * `app.notify` dispara o gatilho da migration 0009, e a mensagem chega aqui
 * sem polling e sem uma segunda regra de "quando avisar" - essa regra ja mora
 * no banco, junto com o resto.
 */

interface Aviso {
  notificationId: string
}

/** Uma entrega pronta: o banco ja decidiu o texto e para onde mandar. */
interface Entrega {
  subscription_id: string
  endpoint: string
  p256dh: string
  auth: string
  title: string
  body: string
  link: string
}

export const pushHabilitado = Boolean(config.vapid)

if (config.vapid) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey)
}

/**
 * Este servico nao le `notifications` nem a lista de aparelhos: ele chama uma
 * funcao estreita que devolve o texto ja filtrado para tela de bloqueio (a
 * regra vive na migration 0009, ao lado do dado) e responde se entregou.
 */
async function entregar(entrega: Entrega): Promise<void> {
  const payload = JSON.stringify({
    title: entrega.title,
    body: entrega.body,
    link: entrega.link,
  })

  try {
    await webpush.sendNotification(
      {
        endpoint: entrega.endpoint,
        keys: { p256dh: entrega.p256dh, auth: entrega.auth },
      },
      payload,
      { TTL: 60 * 60 * 12 },
    )
    await pool.query('select app.push_result($1, true)', [entrega.subscription_id])
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode

    // 404/410: o navegador descartou a inscricao (app desinstalado, permissao
    // revogada, cache limpo). Guardar isso so acumularia lixo e tentativas.
    if (status === 404 || status === 410) {
      await pool.query('select app.push_result($1, false)', [entrega.subscription_id])
      return
    }

    console.error(`[push] falha ao entregar (${status ?? 'sem status'})`)
  }
}

async function despachar(aviso: Aviso): Promise<void> {
  const { rows } = await pool.query<Entrega>('select * from app.push_targets($1)', [
    aviso.notificationId,
  ])

  // Entregas independentes: uma falha nao pode cancelar as outras.
  await Promise.allSettled(rows.map(entregar))
}

/**
 * Conexao dedicada ao LISTEN: ela nao pode voltar para o pool entre consultas,
 * senao o LISTEN se perde. Se cair, reconecta sozinha - a aplicacao continua
 * funcionando sem push, mas o push nao pode ficar mudo para sempre.
 */
export function ouvirNotificacoes(): void {
  if (!pushHabilitado) {
    console.log('[push] sem chaves VAPID: entrega externa desligada')
    return
  }

  let tentativas = 0

  const conectar = () => {
    const client = new pg.Client({ connectionString: config.databaseUrl })

    client.on('notification', (mensagem) => {
      if (!mensagem.payload) return
      try {
        // O `catch` nao e decoracao: uma promessa rejeitada aqui derruba o
        // processo inteiro, e um push que falhou nao pode tirar a aplicacao
        // do ar.
        despachar(JSON.parse(mensagem.payload) as Aviso).catch((error: Error) =>
          console.error('[push] falha ao despachar:', error.message),
        )
      } catch (error) {
        console.error('[push] aviso ilegivel:', error)
      }
    })

    client.on('error', (error) => {
      console.error('[push] conexao de escuta caiu:', error.message)
      client.end().catch(() => {})
      reconectar()
    })

    client
      .connect()
      .then(() => client.query('listen cuidar_notificacao'))
      .then(() => {
        tentativas = 0
        console.log('[push] escutando avisos do banco')
      })
      .catch((error: Error) => {
        console.error('[push] nao consegui escutar:', error.message)
        reconectar()
      })
  }

  const reconectar = () => {
    // Espera crescente, com teto de 30s: um banco reiniciando nao merece uma
    // tempestade de tentativas.
    const espera = Math.min(30_000, 1_000 * 2 ** tentativas++)
    setTimeout(conectar, espera)
  }

  conectar()
}
