import { expect, test } from '@playwright/test'
import { criarAcessoProvisorio, nameOf, resetCareState, signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

// Cada teste comeca do mesmo cenario, independente do que o anterior fez.
test.beforeEach(async () => {
  if (state.ready) await resetCareState()
})

test.describe('entrada e minha semana', () => {
  test('recusa credenciais erradas com mensagem em português', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('ninguem@e2e.cuidar.local')
    await page.getByLabel('Senha', { exact: true }).fill('senha-errada-123')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
  })

  test('a senha entregue pela liderança só serve para criar a própria senha', async ({ page }) => {
    const { email, senha } = await criarAcessoProvisorio()

    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha', { exact: true }).fill(senha)
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Não entra no app: cai na criação da senha.
    await expect(page.getByRole('heading', { name: 'Crie sua senha' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Minha semana' })).toHaveCount(0)

    await page.getByLabel('Sua senha').fill('MinhaSenha123')
    await page.getByLabel('Repita a senha').fill('MinhaSenha123')
    await page.getByRole('button', { name: 'Criar senha e entrar' }).click()

    // Agora sim, dentro do app.
    await expect(page.getByRole('link', { name: 'Minha semana' }).first()).toBeVisible()

    // E a senha entregue não vale mais.
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha', { exact: true }).fill(senha)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
  })

  test('quem esqueceu a senha é mandado para a liderança, não para um e-mail', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByRole('button', { name: 'Esqueci minha senha' }).click()

    const aviso = page.getByRole('dialog')
    await expect(aviso.getByText('Fale com o administrador do sistema.')).toBeVisible()
    await expect(aviso.getByRole('button', { name: 'Entendi' })).toBeVisible()
  })

  test('o discípulo vê o que precisa fazer na semana', async ({ page }) => {
    await signIn(page, 'disciple')

    await expect(page.getByText('Semana de 24 a 30 de agosto')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pessoas para cuidar' })).toBeVisible()
    await expect(page.getByText(nameOf('memberB'))).toBeVisible()
    await expect(page.getByText('Seu progresso nesta semana')).toBeVisible()
  })

  test('o irmão não vê a lista de cuidados', async ({ page }) => {
    await signIn(page, 'memberA')

    await expect(page.getByRole('link', { name: 'Cuidados' })).toHaveCount(0)
    await page.goto('/cuidados')
    await expect(page.getByText('Esta área não é para o seu perfil')).toBeVisible()
  })
})

test.describe('registro de contato', () => {
  test('o discípulo marca contato com o irmão do rodízio', async ({ page }) => {
    await signIn(page, 'disciple')

    const card = page.getByRole('group', { name: `Cuidado de ${nameOf('memberB')}` })
    await card.getByRole('button', { name: /Marcar contato|Registrar novo contato/ }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel('Feedback (opcional)').fill('Conversamos sobre a semana.')
    await page.getByRole('button', { name: 'Salvar contato' }).click()

    await expect(page.getByText('Contato registrado. Obrigado por cuidar.')).toBeVisible()
    await expect(page.getByText('Contato realizado').first()).toBeVisible()
  })

  test('o líder registra o cuidado do discípulo fixo e do irmão do rodízio', async ({ page }) => {
    await signIn(page, 'leader')

    for (const person of [nameOf('disciple'), nameOf('memberA')]) {
      const card = page.getByRole('group', { name: `Cuidado de ${person}` })
      await card.getByRole('button', { name: /Marcar contato|Registrar novo contato/ }).click()

      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByLabel('Feedback (opcional)').fill(`Contato com ${person}.`)
      await page.getByRole('button', { name: 'Salvar contato' }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
    }

    // O progresso do líder conta os dois: discipulado e rodízio.
    await expect(page.getByText('2 de 2')).toBeVisible()
  })
})

test.describe('transferência', () => {
  test('só muda de responsável depois do aceite', async ({ page, browser }) => {
    await signIn(page, 'disciple')

    const card = page.getByRole('group', { name: `Cuidado de ${nameOf('memberB')}` })
    await card.getByRole('button', { name: `Ações para ${nameOf('memberB')}` }).click()
    await page.getByText('Transferir cuidado').click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel('Escolha quem vai receber').click()
    await page.getByRole('option', { name: nameOf('peer') }).click()
    await page.getByLabel('Motivo').fill('Estarei viajando nesta semana.')
    await page.getByRole('button', { name: 'Enviar pedido' }).click()

    // O aviso aparece no toast e no cartao do pedido: basta um deles.
    await expect(page.getByText(/O cuidado continua com você até o aceite/).first()).toBeVisible()
    // Enquanto ninguém aceita, a pessoa continua na lista de quem pediu.
    await expect(page.getByText(nameOf('memberB')).first()).toBeVisible()

    const context = await browser.newContext()
    const other = await context.newPage()
    await signIn(other, 'peer')

    await expect(other.getByText(/pediu que você assuma o cuidado/)).toBeVisible()
    await other.getByRole('button', { name: 'Aceitar cuidado' }).click()
    await expect(other.getByText('Cuidado assumido.')).toBeVisible()
    await expect(other.getByText(nameOf('memberB')).first()).toBeVisible()

    await context.close()
  })
})
