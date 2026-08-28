import { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Erro de permissao nao melhora com nova tentativa.
        const message = (error as { message?: string })?.message ?? ''
        if (message.includes('permission') || message.includes('JWT')) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: true,
    },
    mutations: {
      onError: (error) => toast.error(friendlyError(error)),
    },
  },
})
