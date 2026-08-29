import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { FullPageLoader, RequireAuth, RequireRole, RequireSetup } from '@/components/layout/guards'
import { CardListSkeleton } from '@/components/common/states'
import { LoginPage } from '@/features/auth/login-page'

// Cada tela vira um pedaco separado: no celular, o primeiro carregamento traz
// so o essencial da rota aberta.
const AcceptInvitePage = lazy(() =>
  import('@/features/auth/accept-invite-page').then((m) => ({ default: m.AcceptInvitePage })),
)
const MyWeekPage = lazy(() =>
  import('@/features/week/my-week-page').then((m) => ({ default: m.MyWeekPage })),
)
const CarePage = lazy(() =>
  import('@/features/care/care-page').then((m) => ({ default: m.CarePage })),
)
const DistributionPage = lazy(() =>
  import('@/features/distribution/distribution-page').then((m) => ({
    default: m.DistributionPage,
  })),
)
const WeeksPage = lazy(() =>
  import('@/features/distribution/weeks-page').then((m) => ({ default: m.WeeksPage })),
)
const ActivitiesPage = lazy(() =>
  import('@/features/activities/activities-page').then((m) => ({ default: m.ActivitiesPage })),
)
const MembersPage = lazy(() =>
  import('@/features/members/members-page').then((m) => ({ default: m.MembersPage })),
)
const SupervisionPage = lazy(() =>
  import('@/features/supervision/supervision-page').then((m) => ({ default: m.SupervisionPage })),
)
const NotificationsPage = lazy(() =>
  import('@/features/notifications/notifications-page').then((m) => ({
    default: m.NotificationsPage,
  })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/settings-page').then((m) => ({ default: m.SettingsPage })),
)
const ProfilePage = lazy(() =>
  import('@/features/settings/profile-page').then((m) => ({ default: m.ProfilePage })),
)
const SetupWizardPage = lazy(() =>
  import('@/features/setup/setup-wizard-page').then((m) => ({ default: m.SetupWizardPage })),
)
const NotFoundPage = lazy(() =>
  import('@/features/settings/not-found-page').then((m) => ({ default: m.NotFoundPage })),
)

/** Enquanto o pedaco da tela chega, mostramos o esqueleto do conteudo. */
function LazyOutlet() {
  return (
    <Suspense fallback={<CardListSkeleton rows={3} />}>
      <Outlet />
    </Suspense>
  )
}

function LazyAuthPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullPageLoader />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  { path: '/entrar', element: <LoginPage /> },
  {
    path: '/convite',
    element: (
      <LazyAuthPage>
        <AcceptInvitePage />
      </LazyAuthPage>
    ),
  },

  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            element: <LazyOutlet />,
            children: [
              {
                path: '/primeiros-passos',
                element: <RequireRole roles={['leader']} />,
                children: [{ index: true, element: <SetupWizardPage /> }],
              },
              {
                element: <RequireSetup />,
                children: [
                  { path: '/', element: <MyWeekPage /> },
                  // Avisos enviados antes da correção apontam para cá. Um
                  // desvio custa uma linha; um "página não encontrada" na mão
                  // de 33 pessoas custa confiança.
                  { path: '/minha-semana', element: <Navigate to="/" replace /> },
                  { path: '/notificacoes', element: <NotificationsPage /> },
                  { path: '/perfil', element: <ProfilePage /> },
                  { path: '/atividades', element: <ActivitiesPage /> },
                  {
                    element: <RequireRole roles={['leader', 'supervisor', 'disciple']} />,
                    children: [
                      { path: '/cuidados', element: <CarePage /> },
                      { path: '/supervisao', element: <SupervisionPage /> },
                    ],
                  },
                  {
                    element: <RequireRole roles={['leader', 'supervisor']} />,
                    children: [
                      { path: '/integrantes', element: <MembersPage /> },
                      { path: '/agenda', element: <WeeksPage /> },
                    ],
                  },
                  {
                    element: <RequireRole roles={['leader']} />,
                    children: [
                      { path: '/distribuicao', element: <DistributionPage /> },
                      { path: '/configuracoes', element: <SettingsPage /> },
                    ],
                  },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
])
