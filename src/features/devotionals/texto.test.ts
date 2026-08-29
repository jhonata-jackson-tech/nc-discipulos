import { describe, expect, it } from 'vitest'
import { lerDevocional, tempoDeLeitura } from './texto'

describe('lerDevocional', () => {
  it('separa parágrafos por linha em branco', () => {
    const lido = lerDevocional('Bom dia.\n\nA fidelidade não faz barulho.')
    expect(lido).toHaveLength(2)
    expect(lido[0]![0]![0]!.texto).toBe('Bom dia.')
  })

  it('mantém o versículo inteiro: uma quebra só não separa parágrafo', () => {
    const lido = lerDevocional('Salmo 23\nO Senhor é o meu pastor.')
    expect(lido).toHaveLength(1)
    expect(lido[0]).toHaveLength(2)
  })

  it('entende o negrito do WhatsApp', () => {
    const [paragrafo] = lerDevocional('Ele é *fiel* sempre.')
    expect(paragrafo![0]).toEqual([
      { texto: 'Ele é ', forte: false, enfase: false },
      { texto: 'fiel', forte: true, enfase: false },
      { texto: ' sempre.', forte: false, enfase: false },
    ])
  })

  it('entende o itálico, e não confunde com o negrito', () => {
    const [paragrafo] = lerDevocional('_assim_ e *assado*')
    expect(paragrafo![0]!.map((t) => [t.texto, t.forte, t.enfase])).toEqual([
      ['assim', false, true],
      [' e ', false, false],
      ['assado', true, false],
    ])
  })

  it('deixa em paz o asterisco solto', () => {
    const [paragrafo] = lerDevocional('3 * 4 = 12')
    expect(paragrafo![0]).toEqual([{ texto: '3 * 4 = 12', forte: false, enfase: false }])
  })

  it('descarta linhas vazias sobrando e não devolve parágrafo vazio', () => {
    expect(lerDevocional('\n\n  \n\nTexto.\n\n\n')).toHaveLength(1)
    expect(lerDevocional('   ')).toEqual([])
  })

  it('normaliza a quebra de linha do Windows', () => {
    expect(lerDevocional('Um.\r\n\r\nDois.')).toHaveLength(2)
  })
})

describe('tempoDeLeitura', () => {
  it('nunca diz zero minuto', () => {
    expect(tempoDeLeitura('Amém.')).toBe(1)
  })

  it('conta por volta de 200 palavras por minuto', () => {
    expect(tempoDeLeitura(Array(600).fill('palavra').join(' '))).toBe(3)
  })
})
