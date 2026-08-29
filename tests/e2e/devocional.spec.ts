import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { signIn, state } from './support'

test.skip(!state.ready, 'Ambiente de teste não configurado.')

const CORPO = `Bom dia, igreja.

Tem uma fidelidade que ninguém aplaude.

*"Quem é fiel no pouco, também é fiel no muito."*
Lucas 16.10`

/** Entra como administrador, publica um devocional e devolve o título usado. */
async function publicar(page: Page, alcance: string, marca: string) {
  const titulo = `Devocional ${marca}`

  await signIn(page, 'leader')
  await page.goto('/devocionais')
  await page.getByRole('button', { name: 'Novo devocional' }).first().click()

  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Título').fill(titulo)
  await dialogo.getByLabel('Texto').fill(CORPO)
  if (alcance !== 'Todo o GC') {
    await dialogo.getByLabel('Quem recebe').click()
    await page.getByRole('option', { name: alcance }).click()
  }
  await dialogo.getByRole('button', { name: 'Salvar rascunho' }).click()
  await expect(page.getByText('Rascunho salvo.')).toBeVisible()

  // Publicar é outro gesto, e passa por uma confirmação: o aviso alcança
  // dezenas de celulares e não volta atrás.
  await page.getByText(titulo).first().click()
  await page.getByRole('button', { name: 'Publicar' }).first().click()
  await page.getByRole('button', { name: 'Publicar', exact: true }).last().click()
  await expect(page.getByText('Devocional publicado. O aviso saiu.')).toBeVisible()

  return titulo
}

test.describe('devocionais', () => {
  test('o administrador publica, e quem alcança recebe e responde', async ({ page, browser }) => {
    const titulo = await publicar(page, 'Todo o GC', randomUUID().slice(0, 6))

    // Quem publicou não recebe aviso do próprio gesto.
    await page.goto('/notificacoes')
    await expect(page.getByText(titulo)).toHaveCount(0)

    const outro = await browser.newContext()
    const outraPagina = await outro.newPage()
    await signIn(outraPagina, 'disciple')

    // O aviso chega com o nome de quem assina - é o que faz querer abrir.
    await outraPagina.goto('/notificacoes')
    const aviso = outraPagina.getByText('Pastor Felipe Mendes te mandou uma mensagem').first()
    await expect(aviso).toBeVisible()
    await aviso.click()

    await expect(outraPagina.getByRole('heading', { name: titulo })).toBeVisible()
    // O negrito do WhatsApp virou negrito de verdade, e o versículo ficou inteiro.
    await expect(
      outraPagina.getByText('"Quem é fiel no pouco, também é fiel no muito."'),
    ).toBeVisible()

    await expect(outraPagina.getByText('Ninguém marcou ainda.')).toBeVisible()
    await outraPagina.getByRole('button', { name: 'Amém' }).click()
    await expect(outraPagina.getByText('Você marcou Amém.')).toBeVisible()

    // Um toque liga, outro desliga.
    await outraPagina.getByRole('button', { name: 'Amém' }).click()
    await expect(outraPagina.getByText('Ninguém marcou ainda.')).toBeVisible()

    await outro.close()
  })

  test('quem não administra não publica', async ({ page }) => {
    await signIn(page, 'supervisor')
    await page.goto('/devocionais')
    await expect(page.getByRole('heading', { name: 'Devocionais' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Novo devocional' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Autores' })).toHaveCount(0)
  })

  test('o alcance escolhido é obedecido', async ({ page, browser }) => {
    const titulo = await publicar(page, 'Só a liderança', randomUUID().slice(0, 6))

    const outro = await browser.newContext()
    const outraPagina = await outro.newPage()
    await signIn(outraPagina, 'memberA')

    await outraPagina.goto('/devocionais')
    await expect(outraPagina.getByRole('heading', { name: 'Devocionais' })).toBeVisible()
    await expect(outraPagina.getByText(titulo)).toHaveCount(0)

    await outraPagina.goto('/notificacoes')
    await expect(outraPagina.getByText(titulo)).toHaveCount(0)

    await outro.close()
  })
})
