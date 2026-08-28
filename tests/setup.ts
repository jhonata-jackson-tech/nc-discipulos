import '@testing-library/jest-dom/vitest'

/**
 * O Node 26 expõe um `localStorage` nativo que fica desabilitado sem a flag
 * `--localstorage-file`, e ele sombreia o que o jsdom instalaria. Nos testes,
 * trocamos por uma implementação em memória — o suficiente para exercitar quem
 * guarda preferências no navegador.
 */
// Os testes de integração rodam em ambiente Node, sem `window`: nada a fazer.
const temJanela = typeof window !== 'undefined'

function storageUtilizavel(): boolean {
  if (!temJanela) return true
  try {
    const alvo = window.localStorage
    if (!alvo) return false
    alvo.setItem('__sonda__', '1')
    alvo.removeItem('__sonda__')
    return true
  } catch {
    return false
  }
}

if (!storageUtilizavel()) {
  const criarStorage = (): Storage => {
    const dados = new Map<string, string>()
    return {
      get length() {
        return dados.size
      },
      clear: () => dados.clear(),
      getItem: (chave: string) => dados.get(chave) ?? null,
      key: (indice: number) => Array.from(dados.keys())[indice] ?? null,
      removeItem: (chave: string) => void dados.delete(chave),
      setItem: (chave: string, valor: string) => void dados.set(chave, String(valor)),
    }
  }

  for (const alvo of [window, globalThis] as unknown as object[]) {
    Object.defineProperty(alvo, 'localStorage', {
      value: criarStorage(),
      configurable: true,
      writable: true,
    })
    Object.defineProperty(alvo, 'sessionStorage', {
      value: criarStorage(),
      configurable: true,
      writable: true,
    })
  }
}
