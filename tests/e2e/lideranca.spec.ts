import { expect, test } from '@playwright/test'
import { createDraftWeek, signIn, state } from './support'

test.skip(!state.ready, 'Supabase de teste não configurado.')

test.describe('operação da liderança', () => {
  test('cria uma atividade com mais de um responsável', async ({ page }, testInfo) => {
    // Titulo proprio de cada projeto: desktop e celular compartilham o banco.
    const titulo = `Talk sobre gratidão (${testInfo.project.name})`

    await signIn(page, 'leader')

    await page.goto('/atividades')
    await page.getByRole('button', { name: 'Nova atividade' }).first().click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel('Título').fill(titulo)
    await page.getByLabel('Descrição').fill('Dois responsáveis dividem a condução.')

    const list = page.getByRole('dialog').getByRole('checkbox')
    await list.nth(0).click()
    await list.nth(1).click()

    await page.getByRole('button', { name: 'Criar atividade' }).click()
    await expect(page.getByText('Atividade criada.')).toBeVisible()
    await expect(page.getByText(titulo)).toBeVisible()
  })

  test('publica a semana em rascunho', async ({ page }) => {
    // Rascunho proprio deste teste, para nao depender da ordem de execucao.
    await createDraftWeek('2026-09-14', '2026-09-20')
    await signIn(page, 'leader')

    await page.goto('/distribuicao')
    await page.getByRole('button', { name: 'Publicar semana' }).click()

    await expect(page.getByText('Publicar esta semana?')).toBeVisible()
    await page.getByRole('button', { name: 'Publicar', exact: true }).click()

    await expect(page.getByText('Semana publicada. Todos foram avisados.')).toBeVisible()
  })

  test('não deixa o discípulo abrir a distribuição', async ({ page }) => {
    await signIn(page, 'disciple')

    await page.goto('/distribuicao')
    await expect(page.getByText('Esta área não é para o seu perfil')).toBeVisible()
  })
})

test.describe('supervisão reservada', () => {
  test('o pedido reservado não chega à liderança do GC', async ({ page, browser }) => {
    await signIn(page, 'disciple')

    await page.goto('/supervisao')
    await page.getByRole('button', { name: 'Pedir conversa' }).first().click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel('Assunto').fill('Conversa reservada e2e')
    await page.getByLabel('Mensagem').fill('Preciso conversar com um supervisor em particular.')
    await page.getByRole('button', { name: 'Enviar pedido' }).click()

    await expect(page.getByText('Solicitação enviada aos supervisores.')).toBeVisible()

    // O supervisor enxerga.
    const supervisorContext = await browser.newContext()
    const supervisorPage = await supervisorContext.newPage()
    await signIn(supervisorPage, 'supervisor')
    await supervisorPage.goto('/supervisao')
    await expect(supervisorPage.getByText('Conversa reservada e2e').first()).toBeVisible()
    await supervisorContext.close()

    // O líder do GC não - nem o assunto, nem qualquer contador.
    const leaderContext = await browser.newContext()
    const leaderPage = await leaderContext.newPage()
    await signIn(leaderPage, 'leader')
    await leaderPage.goto('/supervisao')
    await expect(leaderPage.getByText('Conversa reservada e2e')).toHaveCount(0)
    await leaderContext.close()
  })
})
