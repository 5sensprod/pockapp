// frontend/layout.tsx
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { Footer, Header, Sidebar } from '@/components/layout'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
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

	const [activeGroup, setActiveGroup] = useState<string | null>(null)
	const [manuallyClosed, setManuallyClosed] = useState(false)

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

	// Sync activeGroup avec l'URL (sauf si fermé manuellement)
	useEffect(() => {
		if (!sidebarMenu.length) return
		if (manuallyClosed) return

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

	// Reset manuallyClosed quand on change de module
	useEffect(() => {
		if (currentModule?.id !== undefined) {
			setManuallyClosed(false)
			setActiveGroup(null)
		}
	}, [currentModule?.id])

	const handleToggleGroup = (groupId: string) => {
		// Ferme si déjà actif
		if (activeGroup === groupId) {
			setManuallyClosed(true)
			setActiveGroup(null)
			return
		}

		// Ouvre le panneau — PAS de navigation automatique
		// C'est la Sidebar qui gère la navigation directe pour les groupes à 1 item
		setManuallyClosed(false)
		setActiveGroup(groupId)
	}

	const handleClosePanel = () => {
		setManuallyClosed(true)
		setActiveGroup(null)
	}

	const activeGroupData = sidebarMenu.find((g) => g.id === activeGroup) || null
	const isPanelOpen =
		activeGroupData !== null && (activeGroupData.items?.length ?? 0) > 1

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
		if (setupLoading || needsSetup) return
		if (!isAuthenticated) return
		if (!isWails()) return
		const key = 'update_check_done_session'
		if (sessionStorage.getItem(key) === '1') return
		sessionStorage.setItem(key, '1')
		const unsub = tryWailsSub(() => EventsOn('update:available', () => {}))
		const t = window.setTimeout(() => {
			tryWailsVoid(() => CheckForUpdates())
		}, 10_000)
		return () => {
			window.clearTimeout(t)
			unsub()
		}
	}, [isAuthenticated, needsSetup, setupLoading])

	useEffect(() => {
		if (setupLoading || needsSetup || !isAuthenticated) return
		if (!currentModule) return
		if (!currentModule.requiresCompany) return
		if (companiesLoading) return
		const noCompany = companies.length === 0 || !activeCompanyId
		if (noCompany && pathname !== '/') {
			console.log('[Layout] ⛔ redirect vers / car noCompany=true')
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

			{hasSidebar && (
				<Sidebar
					currentModule={currentModule}
					activeGroup={activeGroup}
					onToggleGroup={handleToggleGroup}
					onClosePanel={handleClosePanel}
				/>
			)}

			<main
				className={`flex-1 transition-[margin] duration-200 ease-in-out ${
					hasSidebar ? (isPanelOpen ? 'ml-[19.5rem]' : 'ml-14') : ''
				}`}
			>
				{children}
			</main>

			<Footer />
		</div>
	)
}
