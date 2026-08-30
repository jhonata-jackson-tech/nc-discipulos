import { expect, test } from '@playwright/test'
import { signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

/**
 * Num formulário longo o campo tem que rolar - mas o título e o botão de
 * confirmar não podem sair da tela junto. No celular, rolar de volta para
 * achar o botão é o que faz parecer página em vez de aplicativo.
 */
test('no diálogo, só os campos rolam: título e botão ficam', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await signIn(page, 'leader')

  await page.goto('/atividades')
  await page.getByRole('button', { name: 'Nova atividade' }).first().click()

  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toBeVisible()

  const titulo = dialogo.getByRole('heading', { name: 'Nova atividade' })
  const confirmar = dialogo.getByRole('button', { name: 'Criar atividade' })
  await expect(titulo).toBeInViewport()
  await expect(confirmar).toBeInViewport()

  // Rola os campos até o fim.
  await dialogo.locator('form').evaluate((form) => form.scrollTo(0, form.scrollHeight))
  await page.waitForTimeout(300)

  await expect(titulo, 'o título sumiu ao rolar os campos').toBeInViewport()
  await expect(confirmar, 'o botão de confirmar sumiu ao rolar os campos').toBeInViewport()

  // E a página atrás continua parada.
  const rolouAtras = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  )
  expect(rolouAtras, 'a página atrás do diálogo rolou').toBeLessThanOrEqual(1)
})

/**
 * O mesmo contrato vale para os diálogos que não são um formulário: histórico,
 * lista, texto longo. Sem um corpo que role, o conteúdo fica solto - a caixa
 * estica os filhos e o diálogo vira página.
 */
test('no diálogo sem formulário, só o corpo rola', async ({ page }) => {
  // Visor curto de propósito: qualquer conteúdo já passa da altura da caixa.
  await page.setViewportSize({ width: 360, height: 420 })
  await signIn(page, 'leader')

  await page.goto('/')
  await page.getByRole('button', { name: 'Mais' }).click()

  const dialogo = page.getByRole('dialog')
  const titulo = dialogo.getByRole('heading', { name: 'Mais opções' })
  await expect(titulo).toBeInViewport()

  const corpo = dialogo.locator('[data-slot="dialog-body"]')
  await expect(corpo).toBeVisible()

  const rolou = await corpo.evaluate((elemento) => {
    elemento.scrollTo(0, elemento.scrollHeight)
    return elemento.scrollTop
  })
  expect(rolou, 'o corpo do diálogo não rolou').toBeGreaterThan(0)

  await expect(titulo, 'o título sumiu ao rolar o corpo').toBeInViewport()
})
