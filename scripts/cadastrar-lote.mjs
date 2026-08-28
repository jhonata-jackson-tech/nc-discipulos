/**
 * Cadastra varios integrantes de uma vez e devolve os links de convite.
 *
 * A lista vem de um CSV separado por ponto e virgula, com cabecalho:
 *
 *   atual;nome;email;whatsapp;nascimento;papel
 *
 * `atual` e o nome como a pessoa esta hoje no sistema (o seed traz os nomes
 * curtos que a lideranca usa no dia a dia). Preenchido, o cadastro e
 * completado e renomeado em vez de duplicado. Deixe vazio para criar alguem
 * que ainda nao existe.
 *
 * O arquivo com gente de verdade **nao vai para o Git**: use
 * `cadastros.local.csv`, que ja esta no .gitignore. Veja
 * `cadastros.exemplo.csv` para o formato.
 *
 *   node scripts/cadastrar-lote.mjs cadastros.local.csv https://seu-dominio
 */
import { readFileSync } from 'node:fs'
import { adminClient, configurado, encerrar } from './lib/local.mjs'
import { cadastrar, grupoPadrao } from './lib/cadastro.mjs'

if (!configurado) {
  console.error('Defina DATABASE_URL e JWT_SECRET no .env (veja .env.example).')
  process.exit(1)
}

const arquivo = process.argv[2] ?? 'cadastros.local.csv'
const site = process.argv[3] ?? process.env.SITE_URL ?? 'http://localhost:5173'

let linhas
try {
  linhas = readFileSync(arquivo, 'utf8').split('\n')
} catch {
  console.error(`Não consegui ler ${arquivo}. Veja cadastros.exemplo.csv para o formato.`)
  process.exit(1)
}

const limpar = (v) => (v ?? '').trim()
const cabecalho = limpar(linhas[0]).split(';').map(limpar)
const pessoas = linhas
  .slice(1)
  .map(limpar)
  .filter((linha) => linha && !linha.startsWith('#'))
  .map((linha) => {
    const campos = linha.split(';').map(limpar)
    return Object.fromEntries(cabecalho.map((coluna, i) => [coluna, campos[i] ?? '']))
  })

if (pessoas.length === 0) {
  console.error('Nenhuma linha para cadastrar.')
  process.exit(1)
}

const admin = adminClient()
const grupo = await grupoPadrao(admin)
const links = []
let falhas = 0

for (const pessoa of pessoas) {
  try {
    const resultado = await cadastrar(admin, grupo, { ...pessoa, site })
    console.log(`→ ${resultado.nome}: ${resultado.acao}`)
    if (resultado.link) links.push(resultado)
  } catch (erro) {
    falhas += 1
    console.error(`✗ ${pessoa.nome || '(sem nome)'}: ${erro.message}`)
  }
}

console.log(`\n${'='.repeat(70)}\nLinks de convite — valem 14 dias, uso único\n${'='.repeat(70)}`)
for (const { nome, link } of links) {
  console.log(`\n${nome}\n${link}`)
}

console.log(
  `\n${links.length} link(es) a enviar${falhas ? `, ${falhas} falha(s)` : ''}.` +
    '\nConfirme o gênero de cuidado e o discipulado em Primeiros passos, dentro do sistema.\n',
)

await encerrar()
if (falhas) process.exitCode = 1
