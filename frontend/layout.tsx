// frontend/layout.tsx
//
// Changements vs étape 2 :
//   - Import et rendu de BottomNav (mobile uniquement)
//   - <main> reçoit pb-bottom-nav sur mobile (contenu jamais masqué)
//   - token layout-tokens mis à jour avec bottom-nav

import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { Footer, Header, Sidebar } from '@/components/layout'
import { BottomNav } from '@/components/layout/BottomNav'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBreakpoint } from '@/lib/hooks/useBreakpoint'
import { useSetupCheck } from '@/lib/hooks/useSetupCheck'
import { isWails, tryWailsSub, tryWailsVoid } from '@/lib/wails-bridge'
import { poles } from '@/modules/_registry'
import type { ModuleManifest } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'
import { homeDashboardManifest } from '@/modules/home'
import { toast } from 'sonner'

import { CheckForUpdates } from '@/wailsjs/go/main/App'
import { EventsOn } from '@/wailsjs/runtime/runtime'

const normalizePath = (path: string) => (path || '/').replace(/\/+$/, '') || '/'

function findModuleByPath(pathname: string): ModuleManifest | null {
	if (pathname === '/') return homeDashboardManifest

	let best: ModuleManifest | null = null
	const norm = (s: string) => (s || '/').replace(/\/+$/, '')
	const path = norm(pathname)

	for (const pole of poles || []) {
		for (const m of pole.modules || []) {
			if (!m?.route) continue
			const route = norm(m.route)
			if (path === route || path.startsWith(`${route}/`)) {
				if (!best || route.length > best.route.length) best = m
			}
			for (const alias of m.aliases ?? []) {
				const aliasNorm = norm(alias)
				if (path === aliasNorm || path.startsWith(`${aliasNorm}/`)) {
					if (!best || aliasNorm.length > norm(best.route).length) best = m
				}
			}
		}
	}
	return best
}

export function Layout({ children }: { children: React.ReactNode }) {
	const { pathname } = useLocation()
	const navigate = useNavigate()
	const { isAuthenticated } = useAuth()
	const { isMobile, isTablet, canPushContent } = useBreakpoint()

	const [activeGroup, setActiveGroup] = useState<string | null>(null)
	const [manuallyClosed, setManuallyClosed] = useState(false)
	const [homePanelOpen, setHomePanelOpen] = useState(false)

	const { needsSetup, loading: setupLoading } = useSetupCheck()
	const currentModule = useMemo(() => findModuleByPath(pathname), [pathname])
	const isHomePage = pathname === '/'
	const hasSidebar = !!currentModule?.sidebarMenu?.length
	const sidebarMenu = currentModule?.sidebarMenu || []

	const {
		activeCompanyId,
		companies,
		isLoading: companiesLoading,
	} = useActiveCompany()

	// ── Sync activeGroup avec l'URL ─────────────────────────────────────────
	useEffect(() => {
		if (!sidebarMenu.length || manuallyClosed) return
		const normPath = normalizePath(pathname)
		const matchingGroup = sidebarMenu.find((group) =>
			group.items?.some((item) => {
				const t = normalizePath(item.to)
				return normPath === t || normPath.startsWith(t)
			}),
		)
		if (matchingGroup && matchingGroup.id !== activeGroup) {
			setActiveGroup(matchingGroup.id)
		}
	}, [pathname, sidebarMenu, activeGroup, manuallyClosed])

	// ── Reset sur changement de module ─────────────────────────────────────
	useEffect(() => {
		if (currentModule?.id !== undefined) {
			setManuallyClosed(false)
			setActiveGroup(null)
		}
	}, [currentModule?.id])

	const handleToggleGroup = (groupId: string) => {
		const group = sidebarMenu.find((g) => g.id === groupId)
		const isSingleItem = (group?.items?.length ?? 0) === 1
		if (activeGroup === groupId && !isSingleItem) {
			setManuallyClosed(true)
			setActiveGroup(null)
			return
		}
		setManuallyClosed(false)
		setActiveGroup(groupId)
	}

	const handleClosePanel = () => {
		setManuallyClosed(true)
		setActiveGroup(null)
	}

	const activeGroupData = sidebarMenu.find((g) => g.id === activeGroup) || null

	// sidebarOverlay : vrai si le manifest le déclare OU si on est sur tablette.
	// Sur tablette, le panel est toujours un overlay (pas de push du contenu),
	// quelle que soit la valeur du flag manifest — car l'espace est trop étroit.
	const sidebarOverlay = (currentModule?.sidebarOverlay ?? false) || isTablet

	// ── Marge et padding <main> ─────────────────────────────────────────────
	// isPanelOpen → push du contenu uniquement sur desktop, manifest non-overlay
	const isPanelOpen =
		!sidebarOverlay &&
		canPushContent &&
		(homePanelOpen ||
			(activeGroupData !== null && (activeGroupData.items?.length ?? 0) > 1))

	const mainMargin = (() => {
		if (!hasSidebar || isMobile) return ''
		if (isTablet) return 'ml-rail'
		return isPanelOpen ? 'ml-sidebar-open' : 'ml-rail'
	})()

	// pb-bottom-nav : évite que le contenu soit masqué par la BottomNav fixe
	const mainPadding = isMobile && hasSidebar ? 'pb-bottom-nav' : ''

	// ── Redirections ────────────────────────────────────────────────────────
	useEffect(() => {
		if (setupLoading) return
		if (needsSetup && pathname !== '/setup') {
			navigate({ to: '/setup' })
			return
		}
		if (!needsSetup && pathname === '/setup') {
			navigate({ to: '/login' })
			return
		}
		if (pathname !== '/setup') {
			if (!isAuthenticated && pathname !== '/login') navigate({ to: '/login' })
			if (isAuthenticated && pathname === '/login') navigate({ to: '/' })
		}
	}, [isAuthenticated, pathname, navigate, needsSetup, setupLoading])

	useEffect(() => {
		if (setupLoading || needsSetup || !isAuthenticated || !isWails()) return
		const key = 'update_check_done_session'
		if (sessionStorage.getItem(key) === '1') return
		sessionStorage.setItem(key, '1')
		const unsub = tryWailsSub(() => EventsOn('update:available', () => {}))
		const t = window.setTimeout(
			() => tryWailsVoid(() => CheckForUpdates()),
			10_000,
		)
		return () => {
			window.clearTimeout(t)
			unsub()
		}
	}, [isAuthenticated, needsSetup, setupLoading])

	useEffect(() => {
		if (
			setupLoading ||
			needsSetup ||
			!isAuthenticated ||
			!currentModule?.requiresCompany ||
			companiesLoading
		)
			return
		const noCompany = companies.length === 0 || !activeCompanyId
		if (noCompany && pathname !== '/') {
			toast.error("Tu dois d'abord créer une entreprise...")
			navigate({ to: '/' })
		}
	}, [
		activeCompanyId,
		companies,
		companiesLoading,
		currentModule,
		isAuthenticated,
		navigate,
		pathname,
		needsSetup,
		setupLoading,
	])

	// ── Pages sans layout ───────────────────────────────────────────────────
	if (pathname === '/setup') return <>{children}</>
	if (pathname === '/login') return <>{children}</>
	if (setupLoading)
		return (
			<div className='min-h-screen flex items-center justify-center bg-background'>
				<div className='h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin' />
			</div>
		)
	if (!isAuthenticated) return null

	return (
		<div className='min-h-screen flex flex-col bg-background'>
			<Header currentModule={currentModule} isHomePage={isHomePage} />

			{/* Sidebar desktop/tablet — nulle sur mobile (géré en interne) */}
			{hasSidebar && (
				<Sidebar
					currentModule={currentModule}
					activeGroup={activeGroup}
					onToggleGroup={handleToggleGroup}
					onClosePanel={handleClosePanel}
					onHomePanelChange={setHomePanelOpen}
				/>
			)}

			{/*
        Contenu principal
          mobile  → ml-0,        pb-bottom-nav (espace sous la BottomNav)
          tablet  → ml-rail,     pas de pb
          desktop → ml-rail/ml-sidebar-open, transition margin, pas de pb
      */}
			<main
				className={[
					'flex-1',
					mainMargin,
					mainPadding,
					canPushContent && hasSidebar
						? 'transition-[margin] duration-200 ease-in-out'
						: '',
				]
					.filter(Boolean)
					.join(' ')}
			>
				{children}
			</main>

			<Footer />

			{/* BottomNav — visible uniquement sur mobile, si le module a un menu */}
			{isMobile && hasSidebar && <BottomNav currentModule={currentModule} />}
		</div>
	)
}
