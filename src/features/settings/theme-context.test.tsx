import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './theme-context'

/** Controla o que `prefers-color-scheme` responde durante o teste. */
function mockSystemDark(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: dark,
      media: query,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    })),
  )
}

function Sonda() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="escolha">{theme}</span>
      <span data-testid="aplicado">{resolved}</span>
      <button onClick={() => setTheme('dark')}>escuro</button>
      <button onClick={() => setTheme('light')}>claro</button>
      <button onClick={() => setTheme('system')}>sistema</button>
    </div>
  )
}

describe('tema', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('segue o sistema enquanto ninguém escolher', () => {
    mockSystemDark(true)
    render(
      <ThemeProvider>
        <Sonda />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('escolha')).toHaveTextContent('system')
    expect(screen.getByTestId('aplicado')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('a escolha da pessoa vence a preferência do sistema', async () => {
    mockSystemDark(true)
    render(
      <ThemeProvider>
        <Sonda />
      </ThemeProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'claro' }))

    expect(screen.getByTestId('aplicado')).toHaveTextContent('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('guarda a escolha para a próxima visita', async () => {
    mockSystemDark(false)
    render(
      <ThemeProvider>
        <Sonda />
      </ThemeProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'escuro' }))
    expect(window.localStorage.getItem('cuidar-gc-tema')).toBe('dark')
  })

  it('recupera a escolha guardada ao abrir de novo', () => {
    window.localStorage.setItem('cuidar-gc-tema', 'dark')
    mockSystemDark(false)

    render(
      <ThemeProvider>
        <Sonda />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('escolha')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('volta a acompanhar o sistema quando a pessoa pede', async () => {
    window.localStorage.setItem('cuidar-gc-tema', 'light')
    mockSystemDark(true)

    render(
      <ThemeProvider>
        <Sonda />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('aplicado')).toHaveTextContent('light')

    await userEvent.click(screen.getByRole('button', { name: 'sistema' }))
    expect(screen.getByTestId('aplicado')).toHaveTextContent('dark')
  })
})
