import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { Footer, Header, Sidebar } from '@/components/layout'
import { useSetupCheck } from '@/lib/hooks/useSetupCheck'
import { poles } from '@/modules/_registry'
import type { ModuleManifest } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'

type Notification = {
	id: number
	text: string
	unread: boolean
}

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

	// Vérifie si le setup initial est nécessaire
	const { needsSetup, loading: setupLoading } = useSetupCheck()

	const currentModule = useMemo(() => findModuleByPath(pathname), [pathname])
	const isHomePage = pathname === '/'
	const hasSidebar = !!currentModule?.sidebarMenu?.length

	// Redirections avec gestion du setup
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

	// Sur /setup → pas de layout global
	if (pathname === '/setup') {
		return <>{children}</>
	}

	// Sur /login → pas de layout global
	if (pathname === '/login') {
		return <>{children}</>
	}

	// En attente de redirection ou de chargement → rien
	if (!isAuthenticated || setupLoading) {
		return null
	}

	return (
		<div className='min-h-screen flex flex-col bg-background'>
			<Header
				currentModule={currentModule}
				isHomePage={isHomePage}
				notifications={notifications}
			/>

			{hasSidebar && (
				<Sidebar
					currentModule={currentModule}
					onPanelChange={setIsPanelOpen}
					defaultOpenGroup='crm'
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
