/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Bell,
  Building2,
  ChevronDown,
  User,
  LogOut,
  Settings,
  ChevronLeft,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'

type Company = {
  id: string | number
  name: string
  active?: boolean
}

type Notification = {
  id: string | number
  text: string
  unread?: boolean
}

interface HeaderProps {
  currentModule: ModuleManifest | null
  isHomePage: boolean
  companies: Company[]
  notifications: Notification[]
}

export function Header({
  currentModule,
  isHomePage,
  companies,
  notifications,
}: HeaderProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const brand = currentModule?.name ?? 'PocketPOS'
  const moduleMenu = currentModule?.topbarMenu || []
  const activeCompany = companies.find((c) => c.active)
  const unreadCount = notifications.filter((n) => n.unread).length

  // Avatar PocketBase si un fichier avatar est défini
  const avatarUrl =
    user && (user as any).avatar
      ? `${document.location.origin}/api/files/users/${user.id}/${(user as any).avatar}?thumb=100x100`
      : null

  const handleLogout = () => {
    logout()
    navigate({ to: '/login' })
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          {/* Logo + bouton retour */}
          <div className="flex items-center gap-2">
            {currentModule && !isHomePage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate({ to: '/' })}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}

            {isHomePage ? (
              <Link to="/" className="flex items-center gap-2 font-bold text-lg">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm">
                  P
                </div>
                {brand}
              </Link>
            ) : (
              <div className="flex items-center gap-2 font-bold text-lg">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm">
                  P
                </div>
                {brand}
              </div>
            )}
          </div>

          {/* Menu de topbar */}
          {moduleMenu.length > 0 && (
            <nav className="flex gap-4">
              {moduleMenu.map((item) => (
                <NavLink key={item.to} to={item.to} icon={item.icon}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Sélecteur entreprise - affiché si au moins 1 company */}
          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  <span className="hidden md:inline">
                    {activeCompany?.name ?? 'Entreprise'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Entreprises</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {companies.map((company) => (
                  <DropdownMenuItem
                    key={company.id}
                    className={cn(company.active && 'bg-accent')}
                  >
                    <Building2 className="h-4 w-4 mr-2" />
                    {company.name}
                    {company.active && (
                      <Badge variant="secondary" className="ml-auto">
                        Active
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings className="h-4 w-4 mr-2" />
                  Gérer les entreprises
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-600" />
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {notifications.map((notif) => (
                <DropdownMenuItem key={notif.id} className="py-3">
                  <div className="flex items-start gap-3 w-full">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full mt-1.5',
                        notif.unread ? 'bg-blue-600' : 'bg-muted',
                      )}
                    />
                    <span className="text-sm flex-1">{notif.text}</span>
                  </div>
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuItem className="justify-center text-sm text-muted-foreground">
                Voir toutes les notifications
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Menu utilisateur */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {user?.name ?? 'Utilisateur'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user?.email}
                  </p>
                  <Badge
                    variant="secondary"
                    className="w-fit mt-1 text-xs capitalize"
                  >
                    {'user'}
                  </Badge>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem>
                <User className="h-4 w-4 mr-2" />
                Mon compte
              </DropdownMenuItem>

              <DropdownMenuItem>
                <Settings className="h-4 w-4 mr-2" />
                Paramètres
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-red-600"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

interface NavLinkProps {
  to: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}

function NavLink({ to, icon: Icon, children }: NavLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        '[&.active]:bg-accent [&.active]:text-accent-foreground',
      )}
      activeProps={{ className: 'bg-accent text-accent-foreground' }}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </Link>
  )
}
