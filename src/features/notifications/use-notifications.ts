import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/db'
import type { AppNotification } from '@/types/database'

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return data as AppNotification[]
    },
  })
}

export function useUnreadCount() {
  const { data } = useNotifications()
  return data?.filter((n) => !n.read_at).length ?? 0
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return
      const { error } = await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
