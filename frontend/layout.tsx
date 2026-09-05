// frontend/layout.tsx
//
// Navigation : une seule barre, tenue ici.
//   - `sidebarOpen` est l'unique état de navigation (persisté dans
//     localStorage, ouvert par défaut). Le bouton qui le bascule est dans le
//     Header ; la barre elle-même n'affiche plus que l'arbre complet.
//   - Le suivi de groupe actif (`activeGroup`, `manuallyClosed`) a disparu
//     avec le rail et les panneaux de module : plus rien à synchroniser avec
//     l'URL, c'est le chemin courant qui met en évidence l'item.
//   - Mobile inchangé : BottomNav, la Sidebar ne se rend pas.

import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { Header, Sidebar } from '@/components/layout'
import { BottomNav } from '@/components/layout/BottomNav'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBreakpoint } from '@/lib/hooks/useBreakpoint'
import { useSetupCheck } from '@/lib/hooks/useSetupCheck'
import { useNotifications } from '@/lib/notifications'
import { usePresenceEvents } from '@/lib/presence/use-presence-events'
import { isWails, tryWailsSub, tryWailsVoid } from '@/lib/wails-bridge'
import { poles } from '@/modules/_registry'
import type { ModuleManifest } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'
import { homeDashboardManifest } from '@/modules/home'
import { toast } from 'sonner'

import { CheckForUpdates } from '@/wailsjs/go/main/App'
import { EventsOn } from '@/wailsjs/runtime/runtime'

const SIDEBAR_OPEN_KEY = 'pocketapp:sidebar-open'

function readSidebarOpen(): boolean {
	if (typeof window === 'undefined') return true
	try {
		return window.localStorage.getItem(SIDEBAR_OPEN_KEY) !== '0'
	} catch {
		return true
	}
}

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
	const { isMobile, isDesktop } = useBreakpoint()

	const [sidebarOpen, setSidebarOpen] = useState<boolean>(readSidebarOpen)

	const { needsSetup, loading: setupLoading } = useSetupCheck()
	const currentModule = useMemo(() => findModuleByPath(pathname), [pathname])
	const hasBottomNav = !!currentModule?.sidebarMenu?.length

	const {
		activeCompanyId,
		companies,
		isLoading: companiesLoading,
	} = useActiveCompany()

	// ── Notifications : state centralisé ici — partagé avec Header via props ──
	const {
		upsert: upsertNotification,
		items: notifications,
		unreadCount,
		markAllRead,
		markRead,
		deleteNotification,
	} = useNotifications({
		enabled: !!isAuthenticated && !needsSetup && !setupLoading,
	})

	// ── SSE temps réel ────────────────────────────────────────────────────
	usePresenceEvents({
		enabled: !setupLoading && !needsSetup && !!isAuthenticated,
		onNotification: upsertNotification,
	})

	const setSidebarOpenPersisted = (next: boolean) => {
		setSidebarOpen(next)
		try {
			window.localStorage.setItem(SIDEBAR_OPEN_KEY, next ? '1' : '0')
		} catch {
			// stockage indisponible — la préférence vaut pour la session seule
		}
	}

	// ── Marge et padding <main> ─────────────────────────────────────────────
	// Seul le desktop pousse le contenu ; sur tablette la barre survole, faute
	// de largeur. La marge est animée sur la même durée et la même courbe que le
	// glissement de la barre (`Sidebar.tsx`), sinon les deux se décalent à l'œil.
	// C'est le SEUL élément qui transitionne une propriété de mise en page — la
	// barre, elle, glisse par `transform`, sans reflow.
	const mainMargin = isDesktop && sidebarOpen ? 'ml-panel' : 'ml-0'

	// pb-bottom-nav : évite que le contenu soit masqué par la BottomNav fixe
	const mainPadding = isMobile && hasBottomNav ? 'pb-bottom-nav' : ''

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
			<Header
				currentModule={currentModule}
				sidebarOpen={sidebarOpen}
				onToggleSidebar={() => setSidebarOpenPersisted(!sidebarOpen)}
				notifications={notifications}
				unreadCount={unreadCount}
				markAllRead={markAllRead}
				markRead={markRead}
				deleteNotification={deleteNotification}
			/>

			{/* Menu unique — desktop/tablet ; nul sur mobile (géré en interne) */}
			<Sidebar
				open={sidebarOpen}
				onClose={() => setSidebarOpenPersisted(false)}
			/>

			{/*
        Contenu principal
          mobile  → ml-0,    pb-bottom-nav (espace sous la BottomNav)
          tablet  → ml-0     (la barre survole)
          desktop → ml-panel quand la barre est ouverte, sinon ml-0
      */}
			<main
				className={[
					'flex-1',
					mainMargin,
					mainPadding,
					isDesktop
						? 'transition-[margin-left] duration-200 ease-out motion-reduce:transition-none'
						: '',
				]
					.filter(Boolean)
					.join(' ')}
			>
				{children}
			</main>

			{/* BottomNav — visible uniquement sur mobile, si le module a un menu */}
			{isMobile && hasBottomNav && <BottomNav currentModule={currentModule} />}
		</div>
	)
}
