import * as React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Bell, Heart, LogOut, MoreHorizontal, User } from 'lucide-react'
import { useSession } from '@/features/auth/session-context'
import { useUnreadCount } from '@/features/notifications/use-notifications'
import { navFor } from '@/app/navigation'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { DemoRoleSwitcher } from '@/components/layout/demo-role-switcher'
import { cn, initials } from '@/lib/utils'
import { roleLabelFor } from '@/lib/labels'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * No celular, navegacao inferior. No desktop, sidebar e conteudo em grid -
 * nunca uma tela de celular esticada no navegador.
 */
export function AppShell() {
  const { profile, role, signOut } = useSession()
  const items = navFor(role)
  const primary = items.filter((item) => item.primary).slice(0, 4)
  const secondary = items.filter((item) => !primary.includes(item))
  const unread = useUnreadCount()
  const [moreOpen, setMoreOpen] = React.useState(false)

  return (
    <div className="bg-background min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* --------------------------------------------------------- sidebar */}
      <aside className="bg-card sticky top-0 hidden h-dvh flex-col gap-1 border-r px-3 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
            <Heart className="size-5" fill="currentColor" strokeWidth={0} aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold">Cuidar GC</p>
            <p className="text-muted-foreground text-xs">Cuidado semanal</p>
          </div>
        </div>

        <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-0.5">
          {items.map((item) => (
            <SidebarLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
          ))}
        </nav>

        <DemoRoleSwitcher />

        <ProfileMenu onSignOut={signOut}>
          <button
            type="button"
            className="hover:bg-secondary mt-1 flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors"
          >
            <Avatar className="size-9">
              <AvatarFallback>{initials(profile?.full_name ?? '?')}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{profile?.full_name}</span>
              <span className="text-muted-foreground block text-xs">
                {role ? roleLabelFor(role, profile?.care_gender ?? null) : ''}
              </span>
            </span>
          </button>
        </ProfileMenu>
      </aside>

      {/* --------------------------------------------------------- conteudo */}
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="bg-background/85 safe-top sticky top-0 z-30 border-b backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-4">
            <div className="flex items-center gap-2">
              <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
                <Heart className="size-4" fill="currentColor" strokeWidth={0} aria-hidden />
              </span>
              <span className="font-display text-[15px] font-bold">Cuidar GC</span>
            </div>
            <div className="flex items-center gap-0.5">
              <DemoRoleSwitcher compact />
              <ThemeToggle />
              <NotificationBell count={unread} />
              <ProfileMenu onSignOut={signOut}>
                <button
                  type="button"
                  aria-label="Sua conta"
                  className="touch-target flex items-center justify-center"
                >
                  <Avatar className="size-8">
                    <AvatarFallback>{initials(profile?.full_name ?? '?')}</AvatarFallback>
                  </Avatar>
                </button>
              </ProfileMenu>
            </div>
          </div>
        </header>

        <header className="bg-background/85 sticky top-0 z-30 hidden border-b backdrop-blur-md lg:block">
          <div className="flex h-16 items-center justify-end gap-1 px-8">
            <ThemeToggle />
            <NotificationBell count={unread} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* ---------------------------------------------------- barra inferior */}
      <nav
        aria-label="Navegação rápida"
        className="bg-card/95 safe-bottom fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md lg:hidden"
      >
        <div className="grid grid-cols-5">
          {primary.map((item) => (
            <BottomLink
              key={item.to}
              to={item.to}
              label={item.shortLabel ?? item.label}
              fullLabel={item.label}
              icon={item.icon}
            />
          ))}

          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium"
              >
                <MoreHorizontal className="size-5" aria-hidden />
                Mais
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mais opções</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-1 pb-2">
                {secondary.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className="hover:bg-secondary flex items-start gap-3 rounded-lg p-3 transition-colors"
                  >
                    <item.icon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                    <span className="leading-tight">
                      <span className="block text-sm font-medium">{item.label}</span>
                      {item.description && (
                        <span className="text-muted-foreground block text-xs">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </NavLink>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </nav>
    </div>
  )
}

function SidebarLink({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary-soft text-accent-foreground'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )
      }
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {label}
    </NavLink>
  )
}

function BottomLink({
  to,
  label,
  fullLabel,
  icon: Icon,
}: {
  to: string
  label: string
  fullLabel: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      aria-label={fullLabel}
      className={({ isActive }) =>
        cn(
          'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-5', isActive && 'scale-110')} aria-hidden />
          <span className="max-w-full truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

function NotificationBell({ count }: { count: number }) {
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <NavLink to="/notificacoes" aria-label={`Notificações${count > 0 ? `, ${count} novas` : ''}`}>
        <Bell className="size-5" aria-hidden />
        {count > 0 && (
          <span className="bg-destructive text-destructive-foreground absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </NavLink>
    </Button>
  )
}

function ProfileMenu({
  children,
  onSignOut,
}: {
  children: React.ReactNode
  onSignOut: () => void
}) {
  const { profile } = useSession()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{profile?.full_name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <NavLink to="/perfil">
            <User aria-hidden />
            Meus dados
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onSignOut}>
          <LogOut aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
