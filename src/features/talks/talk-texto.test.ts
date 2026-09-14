import { describe, expect, it } from 'vitest'
import {
  comoFrase,
  comoLink,
  lerNomeDoPdf,
  proximoDiaDeGc,
  tamanhoLegivel,
  tituloDoTalk,
} from './talk-texto'

describe('lerNomeDoPdf', () => {
  it('lê o número e o tema do arquivo que a igreja manda', () => {
    expect(
      lerNomeDoPdf('NEXT 27+ - TEMA 8 - ALEGRIA COMO COMBUSTÍVEL DA PERSEVERANÇA .pdf'),
    ).toEqual({
      numero: 8,
      tema: 'Alegria como combustível da perseverança',
    })
  })

  it('não adivinha quando o nome vem diferente', () => {
    expect(lerNomeDoPdf('roteiro final (2).pdf')).toEqual({ numero: null, tema: '' })
  })

  it('aceita dois-pontos e travessão', () => {
    expect(lerNomeDoPdf('Tema 12: O perdão.pdf')).toEqual({ numero: 12, tema: 'O perdão' })
    expect(lerNomeDoPdf('TEMA 3 — FÉ.PDF').tema).toBe('Fé')
  })
})

describe('comoFrase', () => {
  it('só a primeira letra maiúscula, com acento', () => {
    expect(comoFrase('  ÉPOCA   DE COLHEITA ')).toBe('Época de colheita')
  })
})

describe('proximoDiaDeGc', () => {
  it('segunda aponta para a quinta da mesma semana', () => {
    expect(proximoDiaDeGc(4, '2026-09-14')).toBe('2026-09-17')
  })

  it('na própria quinta é hoje', () => {
    expect(proximoDiaDeGc(4, '2026-09-17')).toBe('2026-09-17')
  })

  it('na sexta já é a quinta seguinte', () => {
    expect(proximoDiaDeGc(4, '2026-09-18')).toBe('2026-09-24')
  })
})

describe('comoLink', () => {
  it('abre o link do jeito que foi colado', () => {
    const spotify =
      'https://open.spotify.com/playlist/6nr80Y4cyAKR4uZY37ehi6?si=QwEt84f2QQaMu1xvhUv7LA'
    expect(comoLink(spotify)).toBe(spotify)
    expect(comoLink('  spotify:playlist:6nr80  ')).toBe('spotify:playlist:6nr80')
  })

  it('completa o https quando o link veio sem ele', () => {
    expect(comoLink('youtube.com/playlist?list=PLRx1hpupIYVg')).toBe(
      'https://youtube.com/playlist?list=PLRx1hpupIYVg',
    )
    expect(comoLink('   ')).toBe('')
  })
})

describe('apresentação', () => {
  it('escreve tamanho e título', () => {
    expect(tamanhoLegivel(6_128_349)).toBe('5,8 MB')
    expect(tamanhoLegivel(48_000)).toBe('47 KB')
    expect(tituloDoTalk({ numero: 8, tema: 'Alegria' })).toBe('Tema 8 · Alegria')
    expect(tituloDoTalk({ numero: null, tema: 'Alegria' })).toBe('Alegria')
  })
})
