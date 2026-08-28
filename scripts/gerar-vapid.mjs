/**
 * Gera o par de chaves VAPID das notificacoes push.
 *
 * A chave publica vai para o navegador na hora de inscrever o aparelho; a
 * privada assina cada envio e nunca sai do servidor. Trocar o par invalida
 * todas as inscricoes existentes - cada pessoa precisaria ligar o aviso de
 * novo. Gere uma vez e guarde no `.env`.
 *
 *   node scripts/gerar-vapid.mjs
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let webpush
try {
  webpush = require('../server/node_modules/web-push/src/index.js')
} catch {
  console.error('Rode `npm install` dentro de server/ antes de gerar as chaves.')
  process.exit(1)
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys()

console.log(`
Cole no .env (e reinicie o serviço):

VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:voce@exemplo.com

A chave pública é entregue ao navegador — não é segredo.
A privada é: quem a tiver consegue enviar avisos em nome do Cuidar GC.
`)
