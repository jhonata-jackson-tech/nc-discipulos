import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/app/query-client'
import { router } from '@/app/routes'
import { SessionProvider } from '@/features/auth/session-context'
import { ThemeProvider } from '@/features/settings/theme-context'
import { ErrorBoundary } from '@/components/layout/error-boundary'
import { OfflineBanner } from '@/components/layout/offline-banner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <TooltipProvider delayDuration={300}>
              <OfflineBanner />
              <RouterProvider router={router} />
              <Toaster />
            </TooltipProvider>
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
