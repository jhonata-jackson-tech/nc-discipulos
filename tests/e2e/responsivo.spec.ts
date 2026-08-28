import { expect, test } from '@playwright/test'
import { signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

const ROTAS = [
  { path: '/', nome: 'Minha semana' },
  { path: '/cuidados', nome: 'Cuidados' },
  { path: '/atividades', nome: 'Atividades' },
  { path: '/distribuicao', nome: 'Distribuição' },
  { path: '/integrantes', nome: 'Integrantes' },
  { path: '/supervisao', nome: 'Supervisão' },
  { path: '/agenda', nome: 'Semanas' },
  { path: '/configuracoes', nome: 'Configurações' },
  { path: '/notificacoes', nome: 'Notificações' },
  { path: '/perfil', nome: 'Meus dados' },
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
