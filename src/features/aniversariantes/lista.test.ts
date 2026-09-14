import { describe, expect, it } from 'vitest'
import { chaveDoAniversariante, diasAte, lerLista } from './lista'

// O texto como chegou, com os caracteres invisíveis (⁠) do WhatsApp.
const LISTA = `*ANIVERSARIANTES*:

*Janeiro*
- 2: Patrícia
- 14: David
- 22: Lethicia Mota

*Fevereiro*
- 7: Ygor
- 15: Miguel
- 14: Robson
- ⁠19: Victoria

*Março*
- 01: Matheus
- ⁠10: Gabriel
- 30: Nicolas
 •   17: Vitor H
*Abril*
- 12: ⁠Isabela

*Novembro*
- 02: Aurora
- ⁠04 Jonas
- 17 Carla

*Dezembro*
-
- `

describe('lerLista', () => {
  const { lidos, ignoradas } = lerLista(LISTA)

  it('lê todos os aniversariantes, mês a mês', () => {
    expect(lidos).toHaveLength(15)
    expect(ignoradas).toEqual([])
  })

  it('entende dia sem dois-pontos, marcador diferente e caractere invisível', () => {
    expect(lidos).toContainEqual({ nome: 'Victoria', dia: 19, mes: 2 })
    expect(lidos).toContainEqual({ nome: 'Vitor H', dia: 17, mes: 3 })
    expect(lidos).toContainEqual({ nome: 'Isabela', dia: 12, mes: 4 })
    expect(lidos).toContainEqual({ nome: 'Jonas', dia: 4, mes: 11 })
    expect(lidos).toContainEqual({ nome: 'Carla', dia: 17, mes: 11 })
  })

  it('não inventa aniversariante em mês vazio', () => {
    expect(lidos.some((a) => a.mes === 12)).toBe(false)
  })

  it('separa o que não dá para entender, em vez de adivinhar', () => {
    const resultado = lerLista('*Março*\n- 32: Fulano\n- Beltrano sem dia')
    expect(resultado.lidos).toEqual([])
    expect(resultado.ignoradas).toEqual(['- 32: Fulano', '- Beltrano sem dia'])
  })

  it('não aceita dia fora do mês', () => {
    expect(lerLista('*Abril*\n- 31: Ninguém').lidos).toEqual([])
    expect(lerLista('*Fevereiro*\n- 29: Bissexto').lidos).toHaveLength(1)
  })
})

describe('chaveDoAniversariante', () => {
  it('reconhece a mesma pessoa com acento e espaço diferentes', () => {
    expect(chaveDoAniversariante({ nome: 'Jônatas  ', dia: 31, mes: 10 })).toBe(
      chaveDoAniversariante({ nome: 'jonatas', dia: 31, mes: 10 }),
    )
  })
})

describe('diasAte', () => {
  it('conta a partir de hoje, virando o ano quando já passou', () => {
    expect(diasAte(14, 9, '2026-09-14')).toBe(0)
    expect(diasAte(24, 9, '2026-09-14')).toBe(10)
    expect(diasAte(13, 9, '2026-09-14')).toBe(364)
  })

  it('leva quem nasceu em 29 de fevereiro para o dia 28 fora do bissexto', () => {
    expect(diasAte(29, 2, '2027-02-28')).toBe(0)
    expect(diasAte(29, 2, '2028-02-28')).toBe(1)
  })
})
