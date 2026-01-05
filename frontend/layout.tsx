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
import { toast } from 'sonner'

import { CheckForUpdates } from '@/wailsjs/go/main/App'
import { EventsOn } from '@/wailsjs/runtime/runtime'

function findModuleByPath(pathname: string): ModuleManifest | null {
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
		}
	}
	return best
}

export function Layout({ children }: { children: React.ReactNode }) {
	const { pathname } = useLocation()
	const navigate = useNavigate()
	const { isAuthenticated } = useAuth()
	const [isPanelOpen, setIsPanelOpen] = useState(false)

	const { needsSetup, loading: setupLoading } = useSetupCheck()

	const currentModule = useMemo(() => findModuleByPath(pathname), [pathname])
	const isHomePage = pathname === '/'
	const hasSidebar = !!currentModule?.sidebarMenu?.length

	const { activeCompanyId, companies } = useActiveCompany()

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
			if (!isAuthenticated && pathname !== '/login') {
				navigate({ to: '/login' })
			}
			if (isAuthenticated && pathname === '/login') {
				navigate({ to: '/' })
			}
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

		const noCompany = !companies || companies.length === 0 || !activeCompanyId

		if (noCompany && pathname !== '/') {
			toast.error(
				'Tu dois d’abord créer une entreprise avant d’accéder à ce module (clients, produits, etc.).',
			)
			navigate({ to: '/' })
		}
	}, [
		activeCompanyId,
		companies,
		currentModule,
		isAuthenticated,
		navigate,
		pathname,
		needsSetup,
		setupLoading,
	])

	if (pathname === '/setup') return <>{children}</>
	if (pathname === '/login') return <>{children}</>
	if (!isAuthenticated || setupLoading) return null

	return (
		<div className='min-h-screen flex flex-col bg-background'>
			<Header currentModule={currentModule} isHomePage={isHomePage} />

			{hasSidebar && (
				<Sidebar currentModule={currentModule} onPanelChange={setIsPanelOpen} />
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
