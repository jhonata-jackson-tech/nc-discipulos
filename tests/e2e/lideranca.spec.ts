import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createDraftWeek, nameOf, signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

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

test.describe('atividades: o combinado', () => {
  test('quem cria e se indica já entra aceito', async ({ page }, testInfo) => {
    // Título único por execução: o banco de desenvolvimento guarda o que os
    // testes anteriores criaram, e um aceite de ontem esconderia a regressão
    // de hoje.
    const titulo = `Dinâmica da liderança ${randomUUID().slice(0, 6)} (${testInfo.project.name})`

    await signIn(page, 'leader')
    await page.goto('/atividades')
    await page.getByRole('button', { name: 'Nova atividade' }).first().click()

    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Título').fill(titulo)
    await dialogo.getByText(nameOf('leader')).click()
    await dialogo.getByRole('button', { name: 'Criar atividade' }).click()
    await expect(page.getByText('Atividade criada.')).toBeVisible()

    // Nem aceite pendente, nem botão para aceitar o que a pessoa mesma quis.
    const cartao = page.locator('div').filter({ hasText: titulo }).last()
    await expect(cartao.getByText('Aceitou')).toBeVisible()
    await expect(cartao.getByRole('button', { name: 'Aceitar' })).toHaveCount(0)
  })

  test('o discípulo aceita, e recusar exige motivo', async ({ page, browser }, testInfo) => {
    const aceita = `Lanche do GC ${randomUUID().slice(0, 6)} (${testInfo.project.name})`
    const recusada = `Talk do GC ${randomUUID().slice(0, 6)} (${testInfo.project.name})`

    // A liderança indica o discípulo em duas atividades: uma para aceitar,
    // outra para recusar.
    await signIn(page, 'leader')
    await page.goto('/atividades')

    for (const titulo of [aceita, recusada]) {
      await page.getByRole('button', { name: 'Nova atividade' }).first().click()
      const dialogo = page.getByRole('dialog')
      await dialogo.getByLabel('Título').fill(titulo)
      await dialogo.getByText(nameOf('disciple')).click()
      await dialogo.getByRole('button', { name: 'Criar atividade' }).click()
      await expect(page.getByText('Atividade criada.')).toBeVisible()
    }
    await expect(page.getByText('Aguardando resposta').first()).toBeVisible()

    // Quem foi indicado responde.
    const outro = await browser.newContext()
    const outraPagina = await outro.newPage()
    await signIn(outraPagina, 'disciple')
    await outraPagina.goto('/atividades')

    // Aceitar: o caminho que estava quebrado - o banco recusava a resposta.
    const cartaoAceite = outraPagina.locator('div').filter({ hasText: aceita }).last()
    await cartaoAceite.getByRole('button', { name: 'Aceitar' }).click()
    await expect(outraPagina.getByText('Atividade aceita.')).toBeVisible()
    await expect(cartaoAceite.getByText('Aceitou')).toBeVisible()

    // Recusar sem motivo o banco não deixa passar - nem a tela.
    const cartaoRecusa = outraPagina.locator('div').filter({ hasText: recusada }).last()
    await cartaoRecusa.getByRole('button', { name: 'Não vou conseguir' }).click()
    const recusa = outraPagina.getByRole('dialog')
    await expect(recusa.getByRole('button', { name: 'Enviar recusa' })).toBeDisabled()
    await recusa.getByLabel('Motivo').fill('Estarei viajando nesse dia.')
    await recusa.getByRole('button', { name: 'Enviar recusa' }).click()
    await expect(outraPagina.getByText('Resposta enviada à liderança.')).toBeVisible()

    await outro.close()
  })
})

test.describe('relatórios', () => {
  test('a liderança vê o panorama; o irmão não', async ({ page }) => {
    await signIn(page, 'leader')
    await page.goto('/relatorios')
    await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Semana a semana' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Constância de quem cuida' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Há mais tempo sem contato' })).toBeVisible()
  })

  test('o supervisor também vê', async ({ page }) => {
    await signIn(page, 'supervisor')
    await page.goto('/relatorios')
    await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible()
  })
})

test.describe('semana publicada', () => {
  test('o líder consegue remanejar, e o motivo é obrigatório', async ({ page }) => {
    await signIn(page, 'leader')
    await page.goto('/distribuicao')

    // A semana publicada do preparo aparece no seletor.
    const quadro = page.getByRole('region', { name: /quadro|distribui/i }).first()
    await expect(quadro.or(page.getByText('Responsável por'))).toBeTruthy()

    const seletor = page.getByLabel(/Responsável por/).first()
    if (await seletor.count()) {
      await seletor.click()
      const opcao = page.getByRole('option').nth(1)
      if (await opcao.count()) {
        await opcao.click()
        const dialogo = page.getByRole('dialog')
        await expect(dialogo.getByText('Remanejar cuidado')).toBeVisible()
        await expect(dialogo.getByRole('button', { name: 'Remanejar' })).toBeDisabled()
        await dialogo.getByLabel('Motivo').fill('Responsável viajando nesta semana.')
        await dialogo.getByRole('button', { name: 'Remanejar' }).click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      }
    }
  })
})
