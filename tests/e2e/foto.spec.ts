import { expect, test } from '@playwright/test'
import { signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

/** PNG 1×1 válido: o navegador precisa conseguir decodificar de verdade. */
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('a pessoa coloca e remove a própria foto', async ({ page }) => {
  await signIn(page, 'disciple')
  // A foto se troca em Configurações: o perfil só mostra.
  await page.goto('/configuracoes?aba=dados')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.setInputFiles('#foto', {
    name: 'retrato.png',
    mimeType: 'image/png',
    buffer: PNG_MINIMO,
  })

  await expect(page.getByText('Dados atualizados.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trocar foto' })).toBeVisible()

  // A foto guardada é a versão reduzida, não o arquivo original.
  const src = await page.locator('img').first().getAttribute('src')
  expect(src?.startsWith('data:image/jpeg')).toBe(true)
  expect(src!.length).toBeLessThan(120_000)

  await page.getByRole('button', { name: 'Remover' }).click()
  await expect(page.getByRole('button', { name: 'Adicionar foto' })).toBeVisible()
})
