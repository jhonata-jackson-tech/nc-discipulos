/**
 * Cria um acesso no ambiente local, sem passar pelo copiar-e-colar do link de
 * convite. Atalho de desenvolvimento: em producao o convite sai de dentro do
 * sistema, em Integrantes > Convidar para o sistema.
 *
 *   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/criar-acesso.mjs "Jhonata Jackson" jhonata@cuidar.local CuidarGC2026
 */
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const [nome, email, senha] = process.argv.slice(2)

const sha256 = (v) => createHash('sha256').update(v).digest('hex')
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

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

const token = randomUUID().replace(/-/g, '')
await admin.from('invites').insert({ profile_id: profile.id, email, token_hash: sha256(token) })

const anon = createClient(URL, ANON, { auth: { persistSession: false } })
const { error: signUpError } = await anon.auth.signUp({
  email,
  password: senha,
  options: { data: { invite_token: token } },
})
if (signUpError) throw signUpError

// Confere que o login realmente funciona antes de anunciar.
const check = createClient(URL, ANON, { auth: { persistSession: false } })
const { error: loginError } = await check.auth.signInWithPassword({ email, password: senha })
if (loginError) throw loginError

console.log(`✓ ${profile.full_name} (${profile.role}) — login testado com sucesso`)
