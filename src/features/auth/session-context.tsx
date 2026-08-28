import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AppRole, Group, Profile } from '@/types/database'

interface SessionValue {
  session: Session | null
  profile: Profile | null
  group: Group | null
  role: AppRole | null
  /** Autenticado mas ainda sem integrante vinculado - convite incompleto. */
  orphanAccount: boolean
  isLeader: boolean
  isSupervisor: boolean
  isLeadership: boolean
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = React.createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [authReady, setAuthReady] = React.useState(false)
  const queryClient = useQueryClient()

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setAuthReady(true)
      if (!next) queryClient.clear()
    })

    return () => listener.subscription.unsubscribe()
  }, [queryClient])

  const userId = session?.user?.id

  const profileQuery = useQuery({
    queryKey: ['session-profile', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId!)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })

  // O GC vem do vinculo da pessoa, nao de "o primeiro grupo que existir": e o
  // que garante que cada usuario enxergue o seu grupo mesmo quando houver mais
  // de um no banco.
  const groupQuery = useQuery({
    queryKey: ['group', profileQuery.data?.id],
    enabled: Boolean(profileQuery.data?.id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_memberships')
        .select('group:groups(*)')
        .eq('profile_id', profileQuery.data!.id)
        .is('left_at', null)
        .order('joined_at')
        .limit(1)
        .maybeSingle()
      if (error) throw error

      const linked = (data as { group: Group } | null)?.group
      if (linked) return linked

      // Integrante ainda sem associacao: cai no unico GC configurado.
      const fallback = await supabase
        .from('groups')
        .select('*')
        .order('created_at')
        .limit(1)
        .maybeSingle()
      if (fallback.error) throw fallback.error
      return fallback.data as Group | null
    },
  })

  const profile = profileQuery.data ?? null
  const role = profile?.role ?? null

  const value: SessionValue = React.useMemo(
    () => ({
      session,
      profile,
      group: groupQuery.data ?? null,
      role,
      orphanAccount: Boolean(session) && profileQuery.isSuccess && !profile,
      isLeader: role === 'leader',
      isSupervisor: role === 'supervisor',
      isLeadership: role === 'leader' || role === 'supervisor',
      loading: !authReady || (Boolean(userId) && profileQuery.isLoading),
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: ['session-profile'] })
      },
      signOut: async () => {
        await supabase.auth.signOut()
        queryClient.clear()
      },
    }),
    [
      session,
      profile,
      groupQuery.data,
      role,
      profileQuery.isSuccess,
      profileQuery.isLoading,
      authReady,
      userId,
      queryClient,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionValue {
  const context = React.useContext(SessionContext)
  if (!context) throw new Error('useSession precisa estar dentro de SessionProvider.')
  return context
}
