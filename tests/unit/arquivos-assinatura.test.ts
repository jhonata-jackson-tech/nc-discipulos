/// <reference types="node" />
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  assinar,
  assinaturaDoArquivoConfere,
  conferir,
  faixa,
  vencimentoDeLeitura,
} from '../../arquivos/assinatura.mjs'

const SEGREDO = 'a'.repeat(40)
const TALK = '79f771fd-320c-404c-909a-7cd8a2cba8d9'

describe('assinatura dos links de arquivo', () => {
  it('confere o que foi assinado com o mesmo segredo', () => {
    const token = assinar(SEGREDO, { acao: 'ler', talk: TALK, tipo: 'pdf', exp: 2_000 })
    expect(conferir(SEGREDO, token, 1_000)).toMatchObject({ acao: 'ler', tipo: 'pdf' })
  })

  it('recusa vencido, segredo errado e token adulterado', () => {
    const token = assinar(SEGREDO, { acao: 'ler', talk: TALK, tipo: 'pdf', exp: 2_000 })
    expect(conferir(SEGREDO, token, 2_001)).toBeNull()
    expect(conferir('b'.repeat(40), token, 1_000)).toBeNull()

    const [corpo, assinatura] = token.split('.')
    const trocado = Buffer.from(
      JSON.stringify({ acao: 'gravar', talk: TALK, tipo: 'pdf', exp: 2_000 }),
    ).toString('base64url')
    expect(conferir(SEGREDO, `${trocado}.${assinatura}`, 1_000)).toBeNull()
    expect(conferir(SEGREDO, `${corpo}`, 1_000)).toBeNull()
    expect(conferir(SEGREDO, 'lixo', 1_000)).toBeNull()
  })

  it('recusa segredo curto na hora de assinar', () => {
    expect(() => assinar('curto', { acao: 'ler', talk: TALK, tipo: 'pdf', exp: 1 })).toThrow()
  })

  it('mantém o mesmo vencimento dentro da janela, e ele dura ao menos 12 horas', () => {
    const agora = 1_789_400_000
    expect(vencimentoDeLeitura(agora)).toBe(vencimentoDeLeitura(agora + 60))
    expect(vencimentoDeLeitura(agora) - agora).toBeGreaterThanOrEqual(12 * 60 * 60)
  })
})

describe('faixa (Range)', () => {
  it('lê as formas que o leitor de PDF usa', () => {
    expect(faixa(undefined, 100)).toBeNull()
    expect(faixa('bytes=0-9', 100)).toEqual({ inicio: 0, fim: 9 })
    expect(faixa('bytes=90-', 100)).toEqual({ inicio: 90, fim: 99 })
    expect(faixa('bytes=-10', 100)).toEqual({ inicio: 90, fim: 99 })
    expect(faixa('bytes=50-500', 100)).toEqual({ inicio: 50, fim: 99 })
  })

  it('recusa faixa impossível', () => {
    expect(faixa('bytes=100-', 100)).toBe(false)
    expect(faixa('bytes=9-3', 100)).toBe(false)
    expect(faixa('bytes=0-1,5-6', 100)).toBe(false)
    expect(faixa('itens=0-1', 100)).toBe(false)
  })
})

describe('assinatura do conteúdo', () => {
  it('confere PDF e imagens pelos primeiros bytes', () => {
    expect(assinaturaDoArquivoConfere('application/pdf', Buffer.from('%PDF-1.7'))).toBe(true)
    expect(assinaturaDoArquivoConfere('application/pdf', Buffer.from('<html>'))).toBe(false)
    expect(assinaturaDoArquivoConfere('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      true,
    )
  })
})
