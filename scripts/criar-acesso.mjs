/**
 * Cria um acesso no ambiente local, sem passar pelo copiar-e-colar do link de
 * convite. Atalho de desenvolvimento: em producao o convite sai de dentro do
 * sistema, em Integrantes > Convidar para o sistema.
 *
 *   node scripts/criar-acesso.mjs "Jhonata Jackson" jhonata@cuidar.local CuidarGC2026
 */
import { adminClient, configurado, darAcesso, encerrar, entrar } from './lib/local.mjs'

if (!configurado) {
  console.error('Defina DATABASE_URL e JWT_SECRET no .env (veja .env.example).')
  process.exit(1)
}

const [nome, email, senha] = process.argv.slice(2)
const admin = adminClient()

const { data: profile, error } = await admin
  .from('profiles')
  .select('id, full_name, role, user_id')
  .eq('full_name', nome)
  .is('deleted_at', null)
  .single()
if (error) throw error

if (profile.user_id) {
  console.log(`${profile.full_name} já tem acesso. Nada a fazer.`)
  process.exit(0)
}

await darAcesso(admin, profile.id, email, senha)

// Confere que o login realmente funciona antes de anunciar.
await entrar(email, senha)
await encerrar()

console.log(`✓ ${profile.full_name} (${profile.role}) — login testado com sucesso`)
