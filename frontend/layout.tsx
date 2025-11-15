// frontend/layout.tsx
import { Bars3Icon } from '@heroicons/react/24/solid'
import { Link, useLocation } from '@tanstack/react-router'
import { useState, useMemo } from 'react'

import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

import { poles } from '@/modules/_registry'  // ⭐ On importe le registre
import type { ModuleManifest } from '@/modules/_registry'

export function Layout({ children }: { children: React.ReactNode }) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const { pathname } = useLocation()

  // 🔍 Trouver le module actif en fonction de l'URL
  const currentModule = useMemo<ModuleManifest | null>(() => {
    for (const pole of poles) {
      for (const mod of pole.modules) {
        if (pathname.startsWith(mod.route)) return mod
      }
    }
    return null
  }, [pathname])

  const hasSidebar = currentModule?.sidebarMenu?.length

  return (
    <div className="min-h-screen flex flex-col">

      {/* ======================== */}
      {/* NAVBAR */}
      {/* ======================== */}
      <nav className="border-b bg-secondary">
        <div className="flex h-16 items-center px-4">

          {/* --- Mobile burger menu --- */}
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="open sidebar"
              >
                <Bars3Icon className="h-6 w-6" />
              </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-80">
              <nav className="flex flex-col gap-4">

                {/* Navigation générique */}
                <Link
                  to="/"
                  className="text-lg font-medium hover:underline"
                  onClick={() => setIsSheetOpen(false)}
                >
                  Dashboard
                </Link>

                <Link
                  to="/notes"
                  className="text-lg font-medium hover:underline"
                  onClick={() => setIsSheetOpen(false)}
                >
                  Notes
                </Link>

                {/* ⭐ Si un module actif existe, on peut lui ajouter des liens spécifiques */}
                {currentModule?.sidebarMenu?.map((group) => (
                  <div key={group.id} className="mt-4">
                    <p className="font-semibold mb-2">{group.label}</p>
                    <nav className="flex flex-col gap-2">
                      {group.items.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          className="pl-4 text-sm hover:underline"
                          onClick={() => setIsSheetOpen(false)}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </nav>
                  </div>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* --- Logo --- */}
          <div className="mx-2 flex-1 px-2">
            <Link to="/" className="text-lg font-semibold hover:underline">
              pocket-react
            </Link>
          </div>

          {/* --- Desktop menu --- */}
          <nav className="hidden lg:flex gap-4">
            <Link to="/notes" className="text-sm font-medium hover:underline">
              Notes
            </Link>
            {/* ⭐ futur : menus spécifiques au module courant */}
          </nav>
        </div>
      </nav>

      {/* ======================== */}
      {/* SIDEBAR (Desktop) */}
      {/* ======================== */}
      {hasSidebar && (
        <aside className="hidden lg:block w-64 border-r p-4">
          {currentModule!.sidebarMenu!.map((group) => (
            <div key={group.id} className="mb-6">
              <p className="font-semibold mb-2">{group.label}</p>
              <nav className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="pl-2 text-sm hover:underline"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </aside>
      )}

      {/* ======================== */}
      {/* CONTENT */}
      {/* ======================== */}
      <main className={`flex-1 p-4 ${hasSidebar ? 'lg:ml-64' : ''}`}>
        {children}
      </main>
    </div>
  )
}
