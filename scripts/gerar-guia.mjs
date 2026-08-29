/**
 * Transforma `docs/guia-do-integrante.html` em PDF.
 *
 * O guia vive como HTML no repositorio, e nao como um PDF solto: assim ele
 * entra no diff quando o app muda de lugar - "Configuracoes -> Meus dados" ja
 * mudou uma vez - e qualquer pessoa regera o arquivo com um comando.
 *
 *   npm run guia
 */
import { chromium } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { statSync } from 'node:fs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEM = resolve(RAIZ, 'docs/guia-do-integrante.html')
const DESTINO = resolve(RAIZ, 'docs/guia-do-integrante.pdf')

const navegador = await chromium.launch()
const pagina = await navegador.newPage()

// `networkidle` porque a fonte da marca vem do Google Fonts: sem esperar, o
// PDF sai com a fonte de reserva - legivel, mas nao e a do app.
await pagina.goto(pathToFileURL(ORIGEM).href, { waitUntil: 'networkidle' })
await pagina.evaluate(() => document.fonts.ready)

await pagina.pdf({
  path: DESTINO,
  format: 'A4',
  // As margens vivem no `@page` do proprio documento.
  preferCSSPageSize: true,
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `
    <div style="width:100%;padding:0 15mm;font-family:-apple-system,Arial,sans-serif;
                font-size:7.5pt;color:#8a8a8a;display:flex;justify-content:space-between">
      <span>Discípulos · Guia do integrante</span>
      <span class="pageNumber"></span>
    </div>`,
})

await navegador.close()

const kb = Math.round(statSync(DESTINO).size / 1024)
console.log(`✓ docs/guia-do-integrante.pdf (${kb} KB)`)
