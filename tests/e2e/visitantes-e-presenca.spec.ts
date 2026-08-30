import { expect, test } from '@playwright/test'
import { signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

/**
 * Desktop e celular compartilham o mesmo banco. Cada projeto precisa do seu
 * nome e do seu dia de encontro, senão um sobrescreve o cenário do outro -
 * a presença é única por grupo e por dia.
 */
const diaDoEncontro = (projeto: string) => (projeto === 'desktop' ? '2026-08-20' : '2026-08-13')

test.describe('visitantes', () => {
  test('cadastra, conversa e coloca o visitante no GC', async ({ page }, testInfo) => {
    const nome = `Visitante e2e ${testInfo.project.name}`

    await signIn(page, 'leader')
    await page.goto('/visitantes')

    // ------------------------------------------------------------- cadastro
    await page.getByRole('button', { name: 'Novo visitante' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel('Nome').fill(nome)
    await page.getByLabel('Telefone').fill('11988887777')
    await page.getByRole('button', { name: 'Cadastrar' }).click()

    await expect(page.getByText('Visitante cadastrado.')).toBeVisible()
    await expect(page.getByText(nome)).toBeVisible()

    // ------------------------------------------------------------- contato
    await page.getByRole('button', { name: 'Registrar contato' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('radio', { name: 'Vem ao GC' }).click()
    await page.getByLabel('Anotação').fill('Disse que volta na próxima quinta.')
    await page.getByRole('button', { name: 'Registrar contato' }).last().click()

    await expect(page.getByText('Contato registrado.')).toBeVisible()
    await expect(page.getByText('1 conversa(s)').first()).toBeVisible()

    // -------------------------------------------------------- entra no GC
    await page.getByRole('button', { name: `Ações para ${nome}` }).click()
    await page.getByRole('menuitem', { name: 'Colocar no GC' }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Colocar no GC' }).click()

    await expect(page.getByText('Agora faz parte do GC.')).toBeVisible()

    // O visitante sai da aba de acompanhamento e o cadastro nasce do outro lado.
    await page.getByRole('tab', { name: 'Entraram' }).click()
    await expect(page.getByText(nome)).toBeVisible()

    // Integrantes desenha cartões no celular e tabela no desktop; só um dos
    // dois está visível por vez, e o outro casaria com o texto do mesmo jeito.
    await page.goto('/integrantes')
    await expect(page.getByText(nome).filter({ visible: true }).first()).toBeVisible()
  })

  test('não deixa encerrar o acompanhamento sem motivo', async ({ page }, testInfo) => {
    const nome = `Encerrado e2e ${testInfo.project.name}`
    const motivo = `Encaminhamos para o GC do bairro dele (${testInfo.project.name}).`

    await signIn(page, 'leader')
    await page.goto('/visitantes')

    await page.getByRole('button', { name: 'Novo visitante' }).first().click()
    await page.getByLabel('Nome').fill(nome)
    await page.getByRole('button', { name: 'Cadastrar' }).click()
    await expect(page.getByText('Visitante cadastrado.')).toBeVisible()

    await page.getByRole('button', { name: `Ações para ${nome}` }).click()
    await page.getByRole('menuitem', { name: 'Encerrar acompanhamento' }).click()

    // Confirmar de mão vazia é recusado: o motivo é a única coisa que alguém
    // vai querer saber daqui a três meses.
    await page.getByRole('button', { name: 'Encerrar', exact: true }).click()
    await expect(page.getByText('Diga o motivo: daqui a três meses ninguém lembra.')).toBeVisible()

    await page.getByLabel('Por quê?').fill(motivo)
    await page.getByRole('button', { name: 'Encerrar', exact: true }).click()

    await expect(page.getByText('Acompanhamento encerrado, com o motivo registrado.')).toBeVisible()

    await page.getByRole('tab', { name: 'Encerrados' }).click()
    await expect(page.getByText(motivo)).toBeVisible()
  })

  test('o discípulo não alcança a lista de visitantes', async ({ page }) => {
    await signIn(page, 'disciple')

    await page.goto('/visitantes')
    await expect(page.getByText('Esta área não é para o seu perfil')).toBeVisible()
  })
})

test.describe('presença do GC', () => {
  test('registra a presença do encontro e ela chega ao relatório', async ({ page }, testInfo) => {
    const dia = diaDoEncontro(testInfo.project.name)

    await signIn(page, 'leader')
    await page.goto('/presenca')

    await page.getByLabel('Outro dia de encontro').fill(dia)
    await expect(page.getByText('Ainda não há presença registrada neste dia.')).toBeVisible()

    // O elenco vem da tela, não de um número fixo: os outros testes deste
    // arquivo colocam gente nova no GC, e um "6" escrito à mão só valeria
    // enquanto ninguém entrasse.
    const elenco = await page.getByRole('radiogroup', { name: /^Presença de / }).count()

    // Todo mundo começa em "faltou": marcar quem veio é o caminho curto.
    await expect(page.getByText(`0 de ${elenco}`)).toBeVisible()

    await page.getByRole('button', { name: 'Todos vieram' }).click()
    await expect(page.getByText(`${elenco} de ${elenco}`)).toBeVisible()

    // Uma pessoa avisa que não vem - é a distinção que o relatório usa depois.
    const linhaDoIrmao = page.getByRole('radiogroup', {
      name: `Presença de ${state.names!.memberA}`,
    })
    await linhaDoIrmao.getByRole('radio', { name: 'Avisou' }).click()
    await page.getByLabel(`Motivo da ausência de ${state.names!.memberA}`).fill('Viagem a trabalho')

    await expect(page.getByText(`${elenco - 1} de ${elenco}`)).toBeVisible()

    await page.getByLabel('Anotação do encontro').fill('Talk sobre gratidão.')
    await page.getByRole('button', { name: 'Registrar presença' }).click()

    await expect(page.getByText('Presença registrada.')).toBeVisible()
    await expect(page.getByText(`${elenco - 1} vieram`).first()).toBeVisible()

    // Reabrir o mesmo dia devolve exatamente o que foi salvo.
    await page.reload()
    await page.getByLabel('Outro dia de encontro').fill(dia)
    await expect(page.getByText(`${elenco - 1} de ${elenco}`)).toBeVisible()

    // E o relatório enxerga o encontro.
    await page.goto('/relatorios')
    await expect(page.getByText('Encontro a encontro')).toBeVisible()
    await expect(page.getByText('Média por encontro')).toBeVisible()
  })

  test('o discípulo não alcança a presença', async ({ page }) => {
    await signIn(page, 'disciple')

    await page.goto('/presenca')
    await expect(page.getByText('Esta área não é para o seu perfil')).toBeVisible()
  })
})
