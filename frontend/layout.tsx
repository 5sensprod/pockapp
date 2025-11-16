import React, { useMemo, useState, useEffect } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'

import { Header, Sidebar, Footer } from '@/components/layout'
import { poles } from '@/modules/_registry'
import type { ModuleManifest } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'

type Company = {
  id: number
  name: string
  active: boolean
}

type Notification = {
  id: number
  text: string
  unread: boolean
}

// Fake data pour l’instant (remplaçable par PocketBase plus tard)
const companies: Company[] = [
  { id: 1, name: 'Mon Entreprise', active: true },
  { id: 2, name: 'Client A', active: false },
  { id: 3, name: 'Client B', active: false },
]

const notifications: Notification[] = [
  { id: 1, text: 'Nouvelle commande #1234', unread: true },
  { id: 2, text: 'Stock faible', unread: true },
  { id: 3, text: 'Rapport mensuel', unread: false },
]

function findModuleByPath(pathname: string): ModuleManifest | null {
  let best: ModuleManifest | null = null
  const norm = (s: string) => (s || '/').replace(/\/+$/, '')
  const path = norm(pathname)

  for (const pole of poles || []) {
    for (const m of pole.modules || []) {
      if (!m?.route) continue
      const route = norm(m.route)
      if (path === route || path.startsWith(route + '/')) {
        if (!best || route.length > best.route.length) best = m
      }
    }
  }
  return best
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [isPanelOpen, setIsPanelOpen] = useState(false)

  const currentModule = useMemo(() => findModuleByPath(pathname), [pathname])
  const isHomePage = pathname === '/'
  const hasSidebar = !!currentModule?.sidebarMenu?.length

  // 🔐 Redirections simples
  useEffect(() => {
    if (!isAuthenticated && pathname !== '/login') {
      navigate({ to: '/login' })
    }
    if (isAuthenticated && pathname === '/login') {
      navigate({ to: '/' })
    }
  }, [isAuthenticated, pathname, navigate])

  // Sur /login → pas de layout global
  if (pathname === '/login') {
    return <>{children}</>
  }

  // En attente de redirection, on ne rend rien
  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        currentModule={currentModule}
        isHomePage={isHomePage}
        companies={companies}
        notifications={notifications}
      />

      {hasSidebar && (
        <Sidebar
          currentModule={currentModule}
          onPanelChange={setIsPanelOpen}
        />
      )}

      <main
        className={`flex-1 transition-all ${
          hasSidebar ? (isPanelOpen ? 'ml-[19.5rem]' : 'ml-14') : ''
        }`}
      >
        {children}
      </main>

      <Footer />
    </div>
  )
}