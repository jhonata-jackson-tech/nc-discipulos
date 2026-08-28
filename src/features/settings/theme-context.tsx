import * as React from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'cuidar-gc-tema'

interface ThemeValue {
  /** O que a pessoa escolheu, incluindo "seguir o sistema". */
  theme: Theme
  /** O que esta de fato na tela agora. */
  resolved: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeValue | null>(null)

function readStored(): Theme {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // Navegador com armazenamento bloqueado: seguimos o sistema.
  }
  return 'system'
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(readStored)
  const [systemDark, setSystemDark] = React.useState(systemPrefersDark)

  // Enquanto a escolha for "sistema", acompanhamos a preferencia em tempo real.
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')

    // A barra do navegador no celular acompanha o tema.
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', resolved === 'dark' ? '#2f3a3a' : '#0f766e')
  }, [resolved])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Sem armazenamento a escolha vale so para esta sessao.
    }
  }, [])

  const value = React.useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeValue {
  const context = React.useContext(ThemeContext)
  if (!context) throw new Error('useTheme precisa estar dentro de ThemeProvider.')
  return context
}
