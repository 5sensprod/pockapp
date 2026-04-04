// frontend/components/layout/BottomNav.tsx
//
// Navigation mobile — remplace le rail desktop sur <768px.
//
// Logique :
//   - Affiche : icône Home fixe + les groupes du module courant
//   - Groupe à 1 item   → navigation directe
//   - Groupe à N items  → ouvre un BottomSheet avec les sous-items
//   - Home              → ouvre un BottomSheet listant tous les modules
//
// Tokens utilisés :
//   h-bottom-nav      → hauteur de la barre (var CSS --bottom-nav-h, 56px)
//   bg-rail           → fond de la barre (identique au rail desktop)
//   text-rail-icon    → icône inactive
//   text-rail-icon-active → icône active
//   bg-panel-item-active  → fond item actif dans la sheet
//
// Dans Layout.tsx :
//   <main> reçoit pb-bottom-nav pour que le contenu ne soit pas masqué
//   BottomNav est rendu en fixed, hors du flux du <main>

import { cn } from '@/lib/utils'
import type { ModuleManifest, SidebarGroup } from '@/modules/_registry'
import { homeDashboardManifest } from '@/modules/home'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'
import * as React from 'react'
import { BottomSheet } from './BottomSheet'

const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

// Nombre max d'items affichés dans la barre (hors Home)
// Au-delà, les groupes supplémentaires sont accessibles via "…" ou la sheet Home
const MAX_RAIL_ITEMS = 4

interface BottomNavProps {
  currentModule: ModuleManifest | null
}

export function BottomNav({ currentModule }: BottomNavProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const [openSheet, setOpenSheet] = React.useState<string | null>(null)
  // 'home' | group.id | null

  const sidebarMenu = currentModule?.sidebarMenu ?? []
  const homeSidebarMenu = homeDashboardManifest.sidebarMenu ?? []
  const normPath = normalizePath(pathname)
  const isHomePage = pathname === '/'

  // Groupes affichés dans la barre (limités à MAX_RAIL_ITEMS)
  const visibleGroups = sidebarMenu.slice(0, MAX_RAIL_ITEMS)

  const groupIsActive = (group: SidebarGroup) =>
    group.items?.some((item) => {
      const t = normalizePath(item.to)
      return normPath === t || normPath.startsWith(t)
    }) ?? false

  const handleGroupTap = (group: SidebarGroup) => {
    if (group.items?.length === 1) {
      setOpenSheet(null)
      navigate({ to: group.items[0].to as any })
    } else {
      setOpenSheet(openSheet === group.id ? null : group.id)
    }
  }

  const handleHomeTap = () => {
    if (isHomePage) return
    setOpenSheet(openSheet === 'home' ? null : 'home')
  }

  const closeSheet = () => setOpenSheet(null)

  return (
    <>
      {/* ── Barre fixe en bas ────────────────────────────────────────────
          h-bottom-nav = var(--bottom-nav-h) = 56px + safe area iOS
      ─────────────────────────────────────────────────────────────────── */}
      <div
        className='fixed bottom-0 left-0 right-0 z-50 bg-rail'
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role='navigation'
        aria-label='Navigation principale'
      >
        <div className='h-bottom-nav flex items-center justify-around px-2'>

          {/* ── Icône Home ──────────────────────────────────────────────── */}
          {!isHomePage && (
            <NavItem
              icon={<LayoutDashboard className='h-5 w-5' />}
              label='Accueil'
              isActive={openSheet === 'home'}
              hasIndicator={openSheet === 'home'}
              onClick={handleHomeTap}
            />
          )}

          {/* ── Groupes du module courant ────────────────────────────────── */}
          {visibleGroups.map((group) => {
            const Icon = group.icon
            const isActive = groupIsActive(group)
            const isSheetOpen = openSheet === group.id

            return (
              <NavItem
                key={group.id}
                icon={<Icon className='h-5 w-5' />}
                label={
                  group.items?.length === 1
                    ? group.items[0].label
                    : group.label
                }
                isActive={isActive || isSheetOpen}
                hasIndicator={isActive}
                onClick={() => handleGroupTap(group)}
              />
            )
          })}
        </div>
      </div>

      {/* ── Sheet : sous-items d'un groupe ────────────────────────────────── */}
      {visibleGroups.map((group) => (
        <BottomSheet
          key={group.id}
          open={openSheet === group.id}
          onClose={closeSheet}
          title={group.label}
        >
          <SheetGroupItems
            group={group}
            normPath={normPath}
            onNavigate={closeSheet}
          />
        </BottomSheet>
      ))}

      {/* ── Sheet : tous les modules (Home panel) ─────────────────────────── */}
      <BottomSheet
        open={openSheet === 'home'}
        onClose={closeSheet}
        title='Tous les modules'
      >
        <SheetHomeItems
          groups={homeSidebarMenu}
          normPath={normPath}
          onNavigate={closeSheet}
        />
      </BottomSheet>
    </>
  )
}

// ── Item de la barre ──────────────────────────────────────────────────────────
function NavItem({
  icon,
  label,
  isActive,
  hasIndicator,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  isActive: boolean
  hasIndicator: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      // Touch target minimum 44px (Stitch : Tablet/POS compatibility)
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5',
        'min-w-[44px] min-h-[44px] px-3 rounded-lg',
        'transition-all duration-150',
        isActive
          ? 'text-rail-icon-active'
          : 'text-rail-icon hover:text-rail-icon-active',
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      {/* Indicateur actif — barre en haut (miroir du rail desktop) */}
      {hasIndicator && (
        <span className='absolute top-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary' />
      )}
      {icon}
      <span className='text-[10px] leading-none truncate max-w-[56px]'>
        {label}
      </span>
    </button>
  )
}

// ── Contenu sheet : sous-items d'un groupe module ─────────────────────────────
function SheetGroupItems({
  group,
  normPath,
  onNavigate,
}: {
  group: SidebarGroup
  normPath: string
  onNavigate: () => void
}) {
  return (
    <div className='flex flex-col gap-1 py-1'>
      {group.items?.map((item) => {
        const Icon = item.icon
        const t = normalizePath(item.to)
        const isActive = normPath === t || normPath.startsWith(t)
        return (
          <Link
            key={item.to}
            to={item.to as any}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors',
              // Touch target généreux sur mobile
              'min-h-[48px]',
              isActive
                ? 'bg-panel-item-active text-foreground font-semibold'
                : 'text-panel-item-text hover:bg-panel-header active:bg-panel-item-active',
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  isActive ? 'text-foreground' : 'text-panel-item-icon',
                )}
              />
            )}
            <span>{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

// ── Contenu sheet : modules globaux (Home panel) ──────────────────────────────
function SheetHomeItems({
  groups,
  normPath,
  onNavigate,
}: {
  groups: SidebarGroup[]
  normPath: string
  onNavigate: () => void
}) {
  return (
    <div className='flex flex-col gap-1 py-1'>
      {groups.map((group) => {
        const Icon = group.icon
        const mainRoute = group.items?.[0]?.to ?? '/'
        const isActive =
          group.items?.some((item) => {
            const t = normalizePath(item.to)
            return normPath === t || normPath.startsWith(t)
          }) ?? false

        return (
          <Link
            key={group.id}
            to={mainRoute as any}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px]',
              isActive
                ? 'bg-panel-item-active text-foreground'
                : 'text-panel-item-text hover:bg-panel-header active:bg-panel-item-active',
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5 shrink-0',
                isActive ? 'text-foreground' : 'text-panel-item-icon',
              )}
            />
            <span>{group.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
