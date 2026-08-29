import { expect, test } from '@playwright/test'
import { admin, signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

test('o aviso leva para a tela certa, e dá para apagar', async ({ page }) => {
  // Um aviso apontando para o endereço antigo: é o que 33 pessoas já têm na
  // caixa, e ele não pode cair em "página não encontrada".
  const client = admin()
  await client.from('notifications').insert({
    profile_id: state.accounts!.leader.profileId,
    type: 'general',
    title: 'Aviso de teste do endereço',
    body: 'Deve abrir Minha semana.',
    link: '/minha-semana',
  })

  await signIn(page, 'leader')
  await page.goto('/notificacoes')

  await page.getByText('Aviso de teste do endereço').click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('não encontrada')).toHaveCount(0)

  await page.goto('/notificacoes')
  const aviso = page.getByText('Aviso de teste do endereço')
  await expect(aviso).toBeVisible()
  await page.getByRole('button', { name: /Apagar aviso "Aviso de teste do endereço"/ }).click()
  await expect(aviso).toHaveCount(0)
})

test('voltar fecha o diálogo em vez de sair da tela', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await signIn(page, 'leader')

  await page.goto('/atividades')
  await page.getByRole('button', { name: 'Nova atividade' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.goBack()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(new URL(page.url()).pathname, 'o voltar saiu da tela').toBe('/atividades')
})
