import { defineConfig, devices } from '@playwright/test'

// Porta propria dos testes: assim eles nunca esbarram em outro projeto que ja
// esteja ocupando a porta padrao do Vite.
const E2E_PORT = 5179
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`

/**
 * Fluxos criticos ponta a ponta.
 *
 * Precisa do compose de desenvolvimento no ar e das variaveis DATABASE_URL e
 * JWT_SECRET no `.env`. Sem elas, a preparacao marca os testes como pulados
 * em vez de falhar.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${E2E_PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60_000,
      },
})
