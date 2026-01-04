// frontend/layout.tsx
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { Footer, Header, Sidebar } from '@/components/layout'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useSetupCheck } from '@/lib/hooks/useSetupCheck'
import { poles } from '@/modules/_registry'
import type { ModuleManifest } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'
import { toast } from 'sonner'

// ✅ ajoute cet import
import { CheckForUpdates } from '@/wailsjs/go/main/App'
import { EventsOn } from '@/wailsjs/runtime/runtime'

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

	// Contexte entreprise active
	const { activeCompanyId, companies } = useActiveCompany()

	// Redirections avec gestion du setup + auth
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

	// ✅ Vérification MAJ 10s après login (une seule fois par session)
	useEffect(() => {
		if (setupLoading || needsSetup) return
		if (!isAuthenticated) return

		// évite de relancer si le layout remonte (changement de route)
		const key = 'update_check_done_session'
		if (sessionStorage.getItem(key) === '1') return
		sessionStorage.setItem(key, '1')

		// (optionnel) s'assurer que l'écouteur est actif tôt
		const unsub = EventsOn('update:available', () => {
			// Ton UI actuelle (UpdateChecker) gère déjà l'affichage.
			// Ici on ne fait rien; on garde juste l'écoute en place si besoin.
		})

		const t = window.setTimeout(() => {
			// Déclenche la vérif côté backend après 10s
			CheckForUpdates().catch(() => {
				// silencieux (pas de toast) pour ne pas polluer l'expérience
			})
		}, 10_000)

		return () => {
			window.clearTimeout(t)
			unsub()
		}
	}, [isAuthenticated, needsSetup, setupLoading])

	// 🚫 Bloque l'accès aux modules qui nécessitent une entreprise
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
			<Header
				currentModule={currentModule}
				isHomePage={isHomePage}
				notifications={notifications}
			/>

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
