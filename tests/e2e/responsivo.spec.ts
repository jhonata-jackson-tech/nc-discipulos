import { expect, test } from '@playwright/test'
import { signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

const ROTAS = [
  { path: '/', nome: 'Minha semana' },
  { path: '/cuidados', nome: 'Cuidados' },
  { path: '/atividades', nome: 'Atividades' },
  { path: '/devocionais', nome: 'Devocionais' },
  { path: '/distribuicao', nome: 'Distribuição' },
  { path: '/integrantes', nome: 'Integrantes' },
  { path: '/visitantes', nome: 'Visitantes' },
  { path: '/presenca', nome: 'Presença' },
  { path: '/relatorios', nome: 'Relatórios' },
  { path: '/supervisao', nome: 'Supervisão' },
  { path: '/agenda', nome: 'Semanas' },
  { path: '/configuracoes', nome: 'Configurações' },
  { path: '/notificacoes', nome: 'Notificações' },
  { path: '/perfil', nome: 'Perfil' },
]

const LARGURAS = [360, 768, 1280, 1440]

/**
 * Nenhuma tela pode rolar na horizontal. Conteudo largo - tabelas, quadros -
 * deve rolar dentro do proprio container.
 */
test.describe('composição responsiva', () => {
  for (const largura of LARGURAS) {
    test(`sem rolagem horizontal em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 })
      await signIn(page, 'leader')

      for (const rota of ROTAS) {
        await page.goto(rota.path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        const overflow = await page.evaluate(() => {
          const doc = document.documentElement
          const limite = doc.clientWidth

          // Aponta o elemento culpado, para o diagnostico nao virar caca ao tesouro.
          const culpado = Array.from(document.querySelectorAll<HTMLElement>('body *')).find(
            (el) => el.getBoundingClientRect().right > limite + 1,
          )

          return {
            scroll: doc.scrollWidth,
            client: limite,
            culpado: culpado
              ? `<${culpado.tagName.toLowerCase()} class="${culpado.className}">`
              : null,
          }
        })

        expect(
          overflow.scroll,
          `${rota.nome} transborda ${overflow.scroll - overflow.client}px na horizontal. Culpado: ${overflow.culpado}`,
        ).toBeLessThanOrEqual(overflow.client + 1)
      }
    })
  }

  /**
   * O documento em si nao pode rolar - nem para o lado, nem para baixo.
   *
   * Quem rola e a area de conteudo, dentro do shell. Sem isso o app "escorrega"
   * no celular: a barra inferior sobe junto com o dedo, o cabecalho some e o
   * iOS estica a pagina inteira no fim da lista.
   */
  test('o documento não rola: só o conteúdo', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await signIn(page, 'leader')

    for (const rota of ROTAS) {
      await page.goto(rota.path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const documento = await page.evaluate(() => {
        const doc = document.documentElement
        return {
          rolaLado: doc.scrollWidth - doc.clientWidth,
          rolaBaixo: doc.scrollHeight - doc.clientHeight,
          corpoRolaBaixo: document.body.scrollHeight - document.body.clientHeight,
        }
      })

      expect(
        documento.rolaLado,
        `${rota.nome}: o documento rola na horizontal`,
      ).toBeLessThanOrEqual(1)
      expect(documento.rolaBaixo, `${rota.nome}: o documento rola na vertical`).toBeLessThanOrEqual(
        1,
      )
      expect(
        documento.corpoRolaBaixo,
        `${rota.nome}: o corpo da página rola por fora do conteúdo`,
      ).toBeLessThanOrEqual(1)
    }
  })

  test('barra inferior no celular, sidebar no desktop', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await signIn(page, 'leader')

    const rapida = page.getByRole('navigation', { name: 'Navegação rápida' })
    const sidebar = page.getByRole('navigation', { name: 'Navegação principal' })

    await expect(rapida).toBeVisible()
    await expect(sidebar).toBeHidden()

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(sidebar).toBeVisible()
    await expect(rapida).toBeHidden()
  })

  test('os alvos de toque têm pelo menos 44px no celular', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await signIn(page, 'leader')

    const itens = page.getByRole('navigation', { name: 'Navegação rápida' }).getByRole('link')

    const total = await itens.count()
    for (let i = 0; i < total; i++) {
      const box = await itens.nth(i).boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

/**
 * Toda tela comeca do comeco.
 *
 * Quem rola e a area de conteudo, nao o documento - entao trocar de rota nao
 * reposiciona nada por conta propria, e a tela seguinte nascia no meio,
 * exatamente onde a anterior tinha parado.
 */
test('ao trocar de tela, o conteúdo volta ao início', async ({ page }) => {
  await signIn(page, 'leader')
  await page.goto('/relatorios')
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible()

  const rolagem = () => page.evaluate(() => document.querySelector('main')!.scrollTop)
  const rolavel = await page.evaluate(() => {
    const conteudo = document.querySelector('main')!
    return conteudo.scrollHeight > conteudo.clientHeight + 200
  })
  test.skip(!rolavel, 'A tela não é longa o bastante neste tamanho.')

  await page.evaluate(() => document.querySelector('main')!.scrollTo(0, 200))
  expect(await rolagem()).toBeGreaterThan(0)

  await page.getByRole('link', { name: 'Atividades' }).first().click()
  await expect(page.getByRole('heading', { name: 'Atividades' })).toBeVisible()

  // A tela anterior continua à vista enquanto o pedaço da nova chega - o
  // reposicionamento acontece na entrada dela, não no clique.
  await expect.poll(rolagem).toBe(0)
})
